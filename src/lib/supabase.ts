import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Connection } from "../config";

const clients = new Map<string, SupabaseClient>();

function cacheKey(connection: Connection): string {
  return `${connection.url}|${connection.anonKey}|${connection.ingestToken ?? ""}`;
}

/** True when a connection is complete enough to talk to Supabase. */
export function isUsableConnection(connection: Connection | null): connection is Connection {
  return Boolean(connection?.url && connection?.anonKey);
}

export function getSupabase(connection: Connection): SupabaseClient {
  const key = cacheKey(connection);
  const cached = clients.get(key);
  if (cached) return cached;

  const client = createClient(connection.url, connection.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // The optional ingest token is checked by the RLS insert policy, so a stray laptop
    // on venue wifi cannot inject taps into a dataset it should not touch.
    global: {
      headers: connection.ingestToken ? { "x-boarding-token": connection.ingestToken } : {},
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  clients.set(key, client);
  return client;
}

/** Called when the operator switches connection, so nothing keeps using a stale client. */
export function resetSupabaseClients(): void {
  clients.clear();
}
