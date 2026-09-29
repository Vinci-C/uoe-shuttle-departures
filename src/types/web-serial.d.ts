// Minimal Web Serial API typings.
// Hand-rolled rather than installing @types/w3c-web-serial because tsconfig.app.json
// pins `types: ["vite/client"]`, which excludes the automatic @types pickup, and this
// project only needs a small slice of the API surface.

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortOptions {
  baudRate: number;
  bufferSize?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  readonly connected: boolean;
  getInfo(): SerialPortInfo;
  open(options: SerialPortOptions): Promise<void>;
  close(): Promise<void>;
  forget(): Promise<void>;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface Serial extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  readonly serial: Serial;
}
