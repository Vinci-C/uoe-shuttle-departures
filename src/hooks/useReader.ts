import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeAllReaders,
  closeReader,
  describePort,
  getGrantedPorts,
  isSerialSupported,
  isTapCardId,
  openReader,
  requestReaderPort,
  type ScanEvent,
  type ScanHandlers,
} from "../lib/nfcReader";

export type ReaderStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "awaiting"
  | "listening"
  | "error";

export interface ReaderState {
  supported: boolean;
  status: ReaderStatus;
  portLabel: string | null;
  /**
   * Firmware version reported by the sketch, or null until it says anything. `confirmed`
   * is separate because the port can be open while nothing is running on the other end:
   * a board that was never flashed reads perfectly healthy at this layer, because
   * opening a port that no sketch is using still succeeds.
   */
  firmware: { version: string | null; confirmed: boolean };
  lastEvent: ScanEvent | null;
  lastScanAt: number | null;
  scanCount: number;
  error: string | null;
  hasGrantedPort: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

/** 2s apart, for 2 minutes. Long enough to replug a shield, short enough to give up. */
const RECONNECT_INTERVAL_MS = 2000;
const RECONNECT_ATTEMPTS = 60;

export function useReader(onScan?: (cardId: string) => void): ReaderState {
  const supported = isSerialSupported();

  const [status, setStatus] = useState<ReaderStatus>(supported ? "disconnected" : "unsupported");
  const [portLabel, setPortLabel] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<ScanEvent | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasGrantedPort, setHasGrantedPort] = useState(false);
  const [firmware, setFirmware] = useState<ReaderState["firmware"]>({ version: null, confirmed: false });

  const portRef = useRef<SerialPort | null>(null);
  // Kept after a disconnect so a shield that gets unplugged and plugged back in can be
  // matched. Web Serial hands back a *new* SerialPort object on replug, so identity
  // comparison is useless here and the USB ids have to be compared instead.
  const lastPortInfoRef = useRef<{ usbVendorId?: number; usbProductId?: number } | null>(null);

  // The scan callback is read through a ref so the serial session never has to be
  // torn down just because the handler changed identity.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const handlers = useRef<ScanHandlers>({
    onEvent: () => {},
    onError: () => {},
  });

  const attach = useCallback(async (port: SerialPort) => {
    setStatus("connecting");
    setError(null);
    portRef.current = port;
    try {
      await openReader(port, handlers.current);
      setPortLabel(describePort(port));
      setHasGrantedPort(true);
      lastPortInfoRef.current = port.getInfo();
      // "awaiting", not "listening": the port is open but nothing has proved a sketch is
      // running yet. Opening a port that no firmware is using succeeds, so claiming to
      // listen here is how an unflashed board looks healthy until someone taps.
      setFirmware({ version: null, confirmed: false });
      setStatus("awaiting");
    } catch (err) {
      portRef.current = null;
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const connect = useCallback(async () => {
    if (!isSerialSupported()) return;
    try {
      const port = await requestReaderPort();
      await attach(port);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatus("disconnected");
        return;
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [attach]);

  const disconnect = useCallback(async () => {
    const port = portRef.current;
    portRef.current = null;
    if (port) await closeReader(port);
    setStatus("disconnected");
    setPortLabel(null);
    setFirmware({ version: null, confirmed: false });
    // Forget the USB ids so the replug poll does not treat an operator pressing
    // Disconnect as an unplug and helpfully reconnect two seconds later. The unplug
    // handler deliberately leaves these in place, because that is the case we recover from.
    lastPortInfoRef.current = null;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    handlers.current = {
      onEvent: (event) => {
        setLastEvent(event);

        // Any well-formed line proves a sketch is running, not just `ready`. The port
        // open does not always reset an UNO, so on a board that was already running
        // the boot line can be missed entirely; waiting for it alone would strand the
        // panel in "awaiting" on hardware that is working fine.
        setFirmware((prev) =>
          prev.confirmed
            ? prev
            : { version: typeof event.fw === "string" ? event.fw : prev.version, confirmed: true },
        );
        setStatus((prev) => (prev === "awaiting" ? "listening" : prev));

        // Only a tap counts. `ready` is boot chatter, `held` is the firmware's own 10s
        // debounce (the card was already counted), and `error` just means no tag.
        if (event.uid === undefined) return;

        const raw: unknown = event.uid;
        if (!isTapCardId(raw)) {
          setError(`Ignored a malformed card id from the reader: ${String(raw).slice(0, 24)}`);
          return;
        }

        setScanCount((count) => count + 1);
        setLastScanAt(Date.now());
        setError(null);
        // Lowercased so real taps and Simulate tap agree: the sketch already emits
        // lowercase, but randomCardId() used to return uppercase.
        onScanRef.current?.((raw as string).toLowerCase());
      },
      onError: (err) => setError(err.message),
    };
  });

  // Re-attach on load to a port this origin was already granted, so the booth recovers
  // from a refresh without an operator clicking anything.
  useEffect(() => {
    if (!isSerialSupported()) return;
    let cancelled = false;

    void (async () => {
      const ports = await getGrantedPorts();
      if (cancelled) return;
      setHasGrantedPort(ports.length > 0);
      const usable = ports.find((port) => port.connected) ?? ports[0];
      if (usable) await attach(usable);
    })();

    return () => {
      cancelled = true;
    };
  }, [attach]);

  // A shield unplugged mid-demo used to need the operator to press Connect again: the
  // disconnect handler above drops us to "disconnected" and nothing ever looked for the
  // port coming back. The port stays granted across a replug, so poll for it and
  // re-attach by USB id. Bounded, so a reader that is genuinely gone stops costing
  // anything rather than polling forever.
  useEffect(() => {
    if (!isSerialSupported()) return;
    if (status !== "disconnected" || !lastPortInfoRef.current) return;

    const wanted = lastPortInfoRef.current;
    let attempts = 0;
    let timer: number | undefined;

    const poll = async () => {
      attempts += 1;
      const ports = await getGrantedPorts();
      const match =
        ports.find(
          (port) =>
            port.getInfo().usbVendorId === wanted.usbVendorId &&
            port.getInfo().usbProductId === wanted.usbProductId,
        ) ?? undefined;

      if (match && match.connected) {
        setError(null);
        await attach(match);
        return;
      }
      if (attempts < RECONNECT_ATTEMPTS) {
        timer = window.setTimeout(() => void poll(), RECONNECT_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(() => void poll(), RECONNECT_INTERVAL_MS);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [attach, status]);

  // The shield being unplugged mid-demo must not leave the page claiming to listen.
  useEffect(() => {
    if (!isSerialSupported()) return;
    const onDisconnect = (event: Event) => {
      const port = event.target as SerialPort | null;
      if (port && port === portRef.current) {
        portRef.current = null;
        setStatus("disconnected");
        setPortLabel(null);
        setFirmware({ version: null, confirmed: false });
        setError("Card reader was unplugged — replug it and it will reconnect");
      }
    };
    navigator.serial.addEventListener("disconnect", onDisconnect);
    return () => navigator.serial.removeEventListener("disconnect", onDisconnect);
  }, []);

  useEffect(() => {
    if (!isSerialSupported()) return;
    return () => {
      void closeAllReaders();
    };
  }, []);

  return {
    supported,
    status,
    portLabel,
    firmware,
    lastEvent,
    lastScanAt,
    scanCount,
    error,
    hasGrantedPort,
    connect,
    disconnect,
    clearError,
  };
}
