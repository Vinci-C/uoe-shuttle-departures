export type StopCode = "bristo" | "kings";

export interface Connection {
  id: string;
  label: string;
  url: string;
  anonKey: string;
  ingestToken?: string;
}

const PREFIX = "boarding-demo";
const CONNECTIONS_KEY = `${PREFIX}-connections-v1`;
const ACTIVE_KEY = `${PREFIX}-active-connection-v1`;
const DATASET_KEY = `${PREFIX}-dataset-v1`;
const STOP_KEY = `${PREFIX}-stop-v1`;

export const DEFAULT_DATASET = "expo-demo";

export const STOP_OPTIONS: { value: StopCode; label: string }[] = [
  { value: "bristo", label: "Bristo Square" },
  { value: "kings", label: "Kings Buildings" },
];

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

let envConnectionCache: Connection | null | undefined;

/**
 * Connection built from VITE_* env vars, or null when they are not configured.
 *
 * Cached at module scope so every caller gets the same object reference. `import.meta.env`
 * is baked in at build time, so the result cannot change while the page is open. Without
 * the cache this mints a fresh literal per call, which silently re-triggers any effect
 * that lists the connection in its dependencies — on the board that was a render/fetch
 * loop running as fast as the network allowed.
 */
export function envConnection(): Connection | null {
  if (envConnectionCache !== undefined) return envConnectionCache;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  envConnectionCache =
    url && anonKey ? { id: "env", label: "Default (from .env)", url, anonKey } : null;
  return envConnectionCache;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing / quota: the demo still works, it just won't remember settings.
  }
}

export function loadConnections(): Connection[] {
  const saved = readJson<Connection[]>(CONNECTIONS_KEY, []);
  return Array.isArray(saved) ? saved.filter((c) => c && c.url && c.anonKey) : [];
}

export function saveConnection(connection: Connection): Connection {
  const next = loadConnections().filter((c) => c.id !== connection.id);
  next.push(connection);
  writeJson(CONNECTIONS_KEY, next);
  return connection;
}

export function deleteConnection(id: string): void {
  writeJson(CONNECTIONS_KEY, loadConnections().filter((c) => c.id !== id));
  if (getActiveConnectionId() === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

/** Saved connections first, with the env connection appended if it is not already there. */
export function allConnections(): Connection[] {
  const saved = loadConnections();
  const fromEnv = envConnection();
  if (fromEnv && !saved.some((c) => c.url === fromEnv.url && c.anonKey === fromEnv.anonKey)) {
    return [...saved, fromEnv];
  }
  return saved;
}

export function getActiveConnectionId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveConnectionId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

/**
 * The connection taps are written to. The public board only ever uses the env
 * connection; the booth page can point at any saved connection.
 */
/**
 * Picks a connection from an already-loaded pool, falling back to the read-only
 * `.env.local` connection and then to the first saved one.
 *
 * Kept separate from loading the pool so callers that already hold it can memoise the
 * result. That matters: a fresh object on every render changes the identity of
 * `connection`, and anything with it in a dependency array then re-runs its effect on
 * every render.
 */
export function resolveFromPool(pool: Connection[], id?: string | null): Connection | null {
  if (id) {
    const match = pool.find((c) => c.id === id);
    if (match) return match;
  }
  const active = getActiveConnectionId();
  if (active) {
    const match = pool.find((c) => c.id === active);
    if (match) return match;
  }
  return envConnection() ?? pool[0] ?? null;
}

function datasetFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("dataset");
  return fromUrl && fromUrl.trim() ? fromUrl.trim() : null;
}

export function getDataset(): string {
  return datasetFromUrl() ?? localStorage.getItem(DATASET_KEY) ?? import.meta.env.VITE_BOARDING_DATASET ?? DEFAULT_DATASET;
}

export function setDataset(dataset: string): void {
  const trimmed = dataset.trim();
  if (trimmed) localStorage.setItem(DATASET_KEY, trimmed);
}

export function getStop(): StopCode {
  return localStorage.getItem(STOP_KEY) === "kings" ? "kings" : "bristo";
}

export function setStop(stop: StopCode): void {
  localStorage.setItem(STOP_KEY, stop);
}

export function exportConnectionsJson(): string {
  return JSON.stringify(
    loadConnections().map(({ label, url, anonKey, ingestToken }) => ({ label, url, anonKey, ingestToken })),
    null,
    2,
  );
}

/** Imports connections from the export format; ids are regenerated so nothing is overwritten. */
export function importConnectionsJson(text: string): Connection[] {
  const parsed: unknown = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : (parsed as { connections?: unknown[] })?.connections;
  if (!Array.isArray(incoming)) throw new Error("Expected a JSON array of connections");

  const saved: Connection[] = [];
  for (const entry of incoming) {
    const candidate = entry as Partial<Connection>;
    if (!candidate?.url || !candidate?.anonKey) continue;
    saved.push(
      saveConnection({
        id: generateId(),
        label: candidate.label || candidate.url,
        url: candidate.url,
        anonKey: candidate.anonKey,
        ingestToken: candidate.ingestToken || undefined,
      }),
    );
  }
  return saved;
}
