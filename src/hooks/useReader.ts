import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeAllReaders,
  closeReader,
  describePort,
  getGrantedPorts,
  isSerialSupported,
  openReader,
  requestReaderPort,
  type ReaderStatus,
  type ScanEvent,
  type ScanHandlers,
} from "../lib/nfcReader";

export interface ReaderState {
  supported: boolean;
  status: ReaderStatus;
  portLabel: string | null;
  lastEvent: ScanEvent | null;
  lastScanAt: number | null;
  scanCount: number;
  error: string | null;
  hasGrantedPort: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export function useReader(onScan?: (cardId: string) => void): ReaderState {
  const supported = isSerialSupported();

  const [status, setStatus] = useState<ReaderStatus>(supported ? "disconnected" : "unsupported");
  const [portLabel, setPortLabel] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<ScanEvent | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasGrantedPort, setHasGrantedPort] = useState(false);

  const portRef = useRef<SerialPort | null>(null);

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
      setStatus("listening");
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
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    handlers.current = {
      onEvent: (event) => {
        setLastEvent(event);
        // Only a tap counts. `ready` is boot chatter, `held` is the firmware's own 10s
        // debounce (the card was already counted), and `error` just means no tag.
        if (event.uid) {
          setScanCount((count) => count + 1);
          setLastScanAt(Date.now());
          setError(null);
          onScanRef.current?.(event.uid);
        }
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

  // The shield being unplugged mid-demo must not leave the page claiming to listen.
  useEffect(() => {
    if (!isSerialSupported()) return;
    const onDisconnect = (event: Event) => {
      const port = event.target as SerialPort | null;
      if (port && port === portRef.current) {
        portRef.current = null;
        setStatus("disconnected");
        setPortLabel(null);
        setError("Card reader was unplugged");
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
