import type { Connection, StopCode } from "../config";
import { getSupabase, isUsableConnection } from "./supabase";

export type ServiceKind = "shuttle" | "bus9";

export interface BoardingRow {
  id: number;
  dataset: string;
  stop: string;
  service_id: string | null;
  service_kind: string;
  card_id: string | null;
  tapped_at: string;
}

export interface BoardingPayload {
  dataset: string;
  stop: StopCode;
  service_id: string | null;
  service_kind: ServiceKind;
  card_id: string | null;
  /** Always sent explicitly: a row queued offline must still count at the tap's time. */
  tapped_at: string;
}

const TABLE = "boardings";
const OUTBOX_KEY = "boarding-demo-outbox-v1";
const OUTBOX_LIMIT = 500;

/**
 * How many rows one read pulls back. The board only ever uses taps from the current
 * London day — `attributeBoardings` discards anything older — so a rolling tail of the
 * newest few hundred contains every row that can be displayed. It exists to bound
 * egress, not to be a limit anyone should notice.
 */
const MAX_FETCH_ROWS = 200;

/**
 * How many rows are held in memory once loaded. Separate from `MAX_FETCH_ROWS` because
 * this one is a memory bound that Realtime then appends to, not a transfer bound.
 */
export const MAX_BUFFERED_ROWS = 1000;

interface OutboxEntry {
  connectionId: string;
  row: BoardingPayload;
}

export type RecordOutcome = "recorded" | "queued" | "rejected";

export interface RecordResult {
  outcome: RecordOutcome;
  /** Present unless outcome is "recorded". */
  error?: string;
  /** Operator-facing explanation when the write was rejected outright. */
  detail?: string;
}

export interface FlushResult {
  delivered: number;
  error?: string;
  detail?: string;
}

/** Shown when Supabase refuses the row for a reason a retry cannot fix. */
export const REJECTED_HINT =
  "Ingest token rejected. Check the token in Connection details — it must match the one hashed in schema.sql.";

/** Shown when the connection is the read-only one built from VITE_* env vars. */
export const NO_INGEST_TOKEN_HINT =
  "This connection has no ingest token, so it can only read. Add a connection with a token in Connection details.";

/** Shown when the token could not be checked because the project was unreachable. */
export const TOKEN_UNVERIFIED_HINT =
  "Could not reach the project to check the token. Saved anyway; a tap will confirm it.";

export type TokenStatus = "ok" | "rejected" | "unreachable" | "no-token";

export interface TokenCheck {
  status: TokenStatus;
  /** Operator-facing explanation, except when the token simply checked out. */
  message?: string;
  /** False only for "rejected", so the caller can offer a Save anyway escape. */
  saveable: boolean;
}

/**
 * Asks Supabase whether this connection's token is the one hashed into `ingest_tokens`.
 *
 * This exists because the same write that proves a token wrong also happens on a tap,
 * which is a bad moment to discover a typo. `boarding_token_is_valid` is already granted
 * to anon and exposed through PostgREST, so the kiosk can ask without writing a row.
 *
 * The four outcomes are kept apart deliberately. A project that is paused or a wifi
 * drop is not evidence that a token is wrong, so those are "unreachable" rather than
 * "rejected" — otherwise a network blip would block saving a perfectly good connection.
 */
export async function verifyIngestToken(connection: Connection): Promise<TokenCheck> {
  if (!connection.ingestToken) {
    return { status: "no-token", message: NO_INGEST_TOKEN_HINT, saveable: true };
  }
  if (!isUsableConnection(connection)) {
    return {
      status: "unreachable",
      message: "Connection needs both a project URL and an anon key before it can be checked.",
      saveable: true,
    };
  }

  try {
    const { data, error } = await getSupabase(connection).rpc("boarding_token_is_valid", {
      candidate: connection.ingestToken,
    });
    if (error) {
      return {
        status: "unreachable",
        message: `Could not check the token: ${error.message}`,
        saveable: true,
      };
    }
    if (data === true) {
      return { status: "ok", saveable: true };
    }
    return { status: "rejected", message: REJECTED_HINT, saveable: false };
  } catch (err) {
    return {
      status: "unreachable",
      message: `Could not check the token: ${err instanceof Error ? err.message : String(err)}`,
      saveable: true,
    };
  }
}

interface WriteErrorLike {
  message: string;
  code?: string;
}

// Postgres insufficient_privilege is the RLS rejection; the 401/403 and PGRST301 codes
// cover a bad or revoked anon key.
const PERMANENT_CODES = new Set(["42501", "401", "403", "PGRST301"]);

const PERMANENT_TEXT = [
  "row-level security",
  "row level security",
  "permission denied",
  "invalid jwt",
  "jwt expired",
  "missing claim",
];

/**
 * True when retrying cannot possibly help: a wrong or missing ingest token, a revoked
 * anon key, or a project that is not the one this kiosk thinks it is.
 *
 * These are configuration faults, not a flaky network. Queueing them would tell the
 * operator nothing useful and would silently fill the outbox until it hits the cap and
 * starts dropping real taps.
 */
export function isPermanentWriteError(error?: WriteErrorLike | null): boolean {
  if (!error) return false;
  if (error.code && PERMANENT_CODES.has(error.code)) return true;
  const text = error.message.toLowerCase();
  return PERMANENT_TEXT.some((needle) => text.includes(needle));
}

/** Random 8-hex id so "Simulate tap" behaves like a real card in the UI. */
export function randomCardId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries: OutboxEntry[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries.slice(-OUTBOX_LIMIT)));
  } catch {
    // Nothing more we can do; the tap is lost rather than the app crashing.
  }
}

export function getOutboxCount(connectionId?: string | null): number {
  const entries = readOutbox();
  if (!connectionId) return entries.length;
  return entries.filter((e) => e.connectionId === connectionId).length;
}

export function enqueue(connectionId: string, row: BoardingPayload): void {
  writeOutbox([...readOutbox(), { connectionId, row }]);
}

/** Drops queued taps for one connection, or the whole outbox when no id is given. */
export function clearOutbox(connectionId?: string | null): number {
  const all = readOutbox();
  const keeping = connectionId
    ? all.filter((e) => e.connectionId !== connectionId)
    : [];
  writeOutbox(keeping);
  return all.length - keeping.length;
}

/**
 * Writes one boarding event. Never throws: a failed insert is parked in a localStorage
 * outbox, because venue wifi drops and a tap must not be lost.
 *
 * A rejection Supabase will repeat forever (bad ingest token, revoked key) is reported
 * instead of queued, so the operator is told what is actually wrong.
 */
export async function recordBoarding(
  connection: Connection,
  payload: BoardingPayload,
): Promise<RecordResult> {
  // Without a token the header is never sent, so the RLS policy always refuses. Say so
  // plainly rather than reporting a row-level security error the operator cannot act on.
  const reject = (error: string): RecordResult => ({
    outcome: "rejected",
    error,
    detail: connection.ingestToken ? REJECTED_HINT : NO_INGEST_TOKEN_HINT,
  });

  try {
    const { error } = await getSupabase(connection).from(TABLE).insert(payload);
    if (error) {
      if (isPermanentWriteError(error)) return reject(error.message);
      enqueue(connection.id, payload);
      return { outcome: "queued", error: error.message };
    }
    return { outcome: "recorded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isPermanentWriteError({ message })) return reject(message);
    enqueue(connection.id, payload);
    return { outcome: "queued", error: message };
  }
}

/**
 * Retries every queued tap for this connection.
 *
 * Queued taps are kept even when the retry fails permanently: they are valid rows and
 * will land once the operator fixes the connection, so discarding them would lose taps.
 */
export async function flushOutbox(connection: Connection): Promise<FlushResult> {
  // Read once. readOutbox() re-parses localStorage, so a second read would hand back
  // fresh objects and nothing taken from the first read would ever match for removal.
  const all = readOutbox();
  const pending = all.filter((e) => e.connectionId === connection.id);
  if (pending.length === 0) return { delivered: 0 };

  const fail = (message: string, code?: string): FlushResult => ({
    delivered: 0,
    error: message,
    detail: isPermanentWriteError({ message, code })
      ? connection.ingestToken
        ? REJECTED_HINT
        : NO_INGEST_TOKEN_HINT
      : undefined,
  });

  try {
    const { error } = await getSupabase(connection)
      .from(TABLE)
      .insert(pending.map((entry) => entry.row));
    if (error) return fail(error.message, error.code);

    // Keep only other connections' entries, so this one stops retrying delivered taps.
    writeOutbox(all.filter((entry) => entry.connectionId !== connection.id));
    return { delivered: pending.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Rows for one dataset since `sinceIso`, oldest first. */
export async function fetchBoardings(
  connection: Connection,
  dataset: string,
  sinceIso: string,
): Promise<BoardingRow[]> {
  const { data, error } = await getSupabase(connection)
    .from(TABLE)
    .select("id,dataset,stop,service_id,service_kind,card_id,tapped_at")
    .eq("dataset", dataset)
    .gte("tapped_at", sinceIso)
    // Newest first, so the row cap drops the oldest taps rather than the newest: a
    // truncated window must still include the bus that is boarding right now.
    .order("tapped_at", { ascending: false })
    .limit(MAX_FETCH_ROWS);

  if (error) throw new Error(error.message);
  // Callers rely on ascending order (lastTapAt takes the last element).
  return ((data ?? []) as BoardingRow[]).slice().reverse();
}
