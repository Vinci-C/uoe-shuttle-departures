export type ReaderStatus = "unsupported" | "disconnected" | "connecting" | "listening" | "error";

/**
 * One line from the sketch, exactly as BoothReader.ino emits it:
 *   {"v":1,"uid":"b1c2d3e4","tag":"NTAG213"}   a tap
 *   {"v":1,"event":"ready","fw":"1.0.0"}       on boot
 *   {"v":1,"event":"held","card":"b1c2d3e4"}   re-tap inside the 10s debounce
 *   {"v":1,"event":"error","code":1|2}         1 = no tag, 2 = read failed
 * A tap is the only line carrying `uid`; the board debounce already dropped `held`.
 */
export interface ScanEvent {
  v: number;
  event?: "ready" | "held" | "error" | string;
  /** FNV-1a hash of the card UID, never the UID itself. Present on a tap. */
  uid?: string;
  tag?: string;
  /** Echoed card on `held`, so the operator can see what was ignored. */
  card?: string;
  fw?: string;
  code?: number;
}

export const READER_BAUD_RATE = 115200;

/**
 * The sketch hashes the UID to 8 lowercase hex characters and nothing else writes
 * `card_id` from a real reader, so a `uid` that does not match this is a malformed or
 * foreign serial line rather than a tap. It is dropped rather than written, so a garbled
 * read can never put an arbitrary string into the boardings table.
 */
export const TAP_CARD_ID_PATTERN = /^[0-9a-f]{8}$/i;

/**
 * Deliberately returns `boolean` rather than a type predicate: a `value is string`
 * predicate narrows the *negative* branch of an already-`string` field to `never`, which
 * makes the "log the bad value" path untypable.
 */
export function isTapCardId(value: unknown): boolean {
  return typeof value === "string" && TAP_CARD_ID_PATTERN.test(value);
}

// Arduino (Uno/Nano/Mega), CH340 and FTDI boards — the usual USB-serial bridges.
const VENDOR_FILTERS = [
  { usbVendorId: 0x2341 },
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x0043 },
];

/** Web Serial is Chromium-only on desktop, so this gate decides whether to show any UI. */
export function isSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

async function requestPortWithFallback(): Promise<SerialPort> {
  try {
    return await navigator.serial.requestPort({ filters: VENDOR_FILTERS });
  } catch (err) {
    // NotFoundError means the operator dismissed the picker: don't reopen it.
    if (err instanceof DOMException && err.name === "NotFoundError") throw err;
    return navigator.serial.requestPort();
  }
}

export function requestReaderPort(): Promise<SerialPort> {
  return requestPortWithFallback();
}

export function describePort(port: SerialPort): string {
  const info = port.getInfo();
  if (!info.usbVendorId) return "Serial device";
  const vendor = info.usbVendorId.toString(16).toUpperCase().padStart(4, "0");
  return info.usbProductId
    ? `USB ${vendor}:${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}`
    : `USB ${vendor}:****`;
}

/** Ports this origin was already granted, so the booth reconnects without a dialog. */
export async function getGrantedPorts(): Promise<SerialPort[]> {
  if (!isSerialSupported()) return [];
  try {
    return await navigator.serial.getPorts();
  } catch {
    return [];
  }
}

export interface ReadSession {
  stop: () => void;
}

/**
 * Frames the sketch's newline-delimited JSON into typed events. Partial lines are held
 * until the newline arrives, and unreadable lines are reported rather than thrown, so one
 * bad byte cannot take the reader down mid-demo.
 */
export function readScans(
  port: SerialPort,
  onEvent: (event: ScanEvent) => void,
  onError?: (err: Error) => void,
): ReadSession {
  const decoder = new TextDecoder();
  let buffer = "";
  let stopped = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const handleLine = (line: string) => {
    // The Seeed library prints its own debug to the same port (src/Ndef.h defines
    // NDEF_USE_SERIAL unconditionally, so it cannot be turned off from the sketch).
    // On the bench that was 36 of 73 lines in a 50s capture, mostly "Tag is not NDEF
    // formatted." A line that does not begin with `{` is therefore third-party chatter
    // and is dropped silently. A line that DOES begin with `{` but fails to parse is a
    // real protocol fault and is reported, which is what the malformed-JSON test pins.
    if (!line.startsWith("{")) return;

    try {
      const parsed: unknown = JSON.parse(line);
      // A line is worth forwarding if it is either a tap (`uid`) or a sketch event
      // (`event`). Anything else is not ours.
      if (parsed && typeof parsed === "object" && ("uid" in parsed || "event" in parsed)) {
        onEvent(parsed as ScanEvent);
      }
    } catch {
      onError?.(new Error(`Ignored unreadable serial line: ${line.slice(0, 60)}`));
    }
  };

  const pump = async () => {
    for (;;) {
      if (stopped) return;
      const stream = port.readable;
      // No stream means the port is closed or gone. The reconnect path in useReader
      // takes it from here.
      if (!stream) return;

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        reader = stream.getReader();
        activeReader = reader;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line) handleLine(line);
            newline = buffer.indexOf("\n");
          }
        }
      } catch (err) {
        if (!stopped) onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        // Always hand the lock back. Leaving it held is what made the previous version
        // throw "ReadableStream is locked" on its next pass -- an unhandled rejection,
        // because getReader() sat outside the try, which killed the reader with no
        // error shown anywhere.
        try {
          reader?.releaseLock();
        } catch {
          // Already released, or the stream is in a state that refuses it.
        }
        activeReader = null;
      }

      // The session ends when the stream ends or the read fails, and deliberately does
      // not loop. Neither case can produce another read from this stream, so retrying
      // would either re-lock it or spin; reconnection is the caller's job, and it
      // already handles an unplugged or reset shield.
      return;
    }
  };

  void pump();

  return {
    stop: () => {
      stopped = true;
      void activeReader?.cancel().catch(() => {});
    },
  };
}

export interface ScanHandlers {
  onEvent: (event: ScanEvent) => void;
  onError: (err: Error) => void;
}

interface OpenReader {
  session: ReadSession;
  handlers: ScanHandlers;
}

// Sessions live outside React so a remount (including React StrictMode's deliberate
// double-mount) can re-attach to a port it has already opened, and so scan handlers
// always resolve to the newest callbacks.
const openReaders = new Map<SerialPort, OpenReader>();
const opening = new Map<SerialPort, Promise<void>>();

/** Opens the port if needed and starts reading. Safe to call repeatedly. */
export async function openReader(port: SerialPort, handlers: ScanHandlers): Promise<void> {
  const alreadyOpen = openReaders.get(port);
  if (alreadyOpen) {
    alreadyOpen.handlers = handlers;
    return;
  }

  let pending = opening.get(port);
  if (!pending) {
    pending = port
      .open({ baudRate: READER_BAUD_RATE })
      .then(() => {
        opening.delete(port);
        const entry: OpenReader = {
          session: readScans(
            port,
            (event) => (openReaders.get(port) ?? entry).handlers.onEvent(event),
            (err) => (openReaders.get(port) ?? entry).handlers.onError(err),
          ),
          handlers,
        };
        openReaders.set(port, entry);
      })
      .catch((err: unknown) => {
        opening.delete(port);
        throw err;
      });
    opening.set(port, pending);
  }

  return pending;
}

/** Stops reading and closes the port, even if the open is still in flight. */
export async function closeReader(port: SerialPort): Promise<void> {
  const pending = opening.get(port);
  if (pending) {
    try {
      await pending;
    } catch {
      // Never opened, so there is nothing to close.
    }
  }

  openReaders.get(port)?.session.stop();
  openReaders.delete(port);

  try {
    await port.close();
  } catch {
    // Already closed or unplugged.
  }
}

export async function closeAllReaders(): Promise<void> {
  await Promise.all([...openReaders.keys()].map((port) => closeReader(port)));
}
