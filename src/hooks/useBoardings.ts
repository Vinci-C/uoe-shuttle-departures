import { useCallback, useEffect, useMemo, useState } from "react";
import type { Connection } from "../config";
import { fetchBoardings, MAX_BUFFERED_ROWS, type BoardingRow } from "../lib/boardings";
import { getSupabase } from "../lib/supabase";

export type BoardingsStatus = "disabled" | "connecting" | "live" | "reconnecting" | "error";

export interface BoardingsView {
  enabled: boolean;
  status: BoardingsStatus;
  rows: BoardingRow[];
  lastTapAt: string | null;
  lastHourCount: number;
  error: string | null;
  reload: () => void;
}

const RECONNECT_GRACE_MS = 10_000;
const EMPTY_ROWS: BoardingRow[] = [];

/**
 * How often "taps in the last hour" is recomputed as time passes. This is a local
 * re-render only, never a request: without it the count would freeze at whatever it was
 * when the last tap arrived instead of decaying as the hour rolls over.
 */
const RECOUNT_MS = 60_000;

function sinceIso(lookbackHours: number): string {
  return new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
}

/**
 * Reads boardings for one source (connection + dataset + lookback) and keeps them fresh
 * from Realtime.
 *
 * There is no polling timer. Realtime does not replay events missed while the socket is
 * down, so the initial load and every reconnect re-read the window instead: that covers
 * the realistic gaps (tab hidden, venue wifi dropped the websocket) while a healthy tab
 * makes no requests at all. A fixed interval would have been the only way to also cover
 * a socket that dies without supabase-js noticing, at a cost that scales with how long
 * anyone leaves a tab open.
 *
 * Rows and status are tagged with the source they belong to, so switching database or
 * dataset shows no stale counts and no state has to be cleared from inside an effect.
 */
export function useBoardings(
  connection: Connection | null,
  dataset: string,
  // A whole service day, not an hour: taps flushed from the kiosk outbox after a wifi
  // outage or a paused Supabase project can land well after the fact, and the public
  // board must not show fewer people than the kiosk recorded.
  lookbackHours = 24,
): BoardingsView {
  const sourceKey = connection
    ? `${connection.url}|${connection.id}|${dataset}|${lookbackHours}`
    : "";

  const [rowsState, setRowsState] = useState<{ key: string; rows: BoardingRow[] }>({
    key: sourceKey,
    rows: EMPTY_ROWS,
  });
  const [statusState, setStatusState] = useState<{ key: string; value: BoardingsStatus }>({
    key: sourceKey,
    value: "connecting",
  });
  const [errorState, setErrorState] = useState<{ key: string; value: string | null }>({
    key: sourceKey,
    value: null,
  });
  // Refreshed by the poll so rendering stays pure; "last hour" only needs to be roughly
  // current.
  const [nowMs, setNowMs] = useState(0);

  const rows = rowsState.key === sourceKey ? rowsState.rows : EMPTY_ROWS;
  const error = errorState.key === sourceKey ? errorState.value : null;
  const status: BoardingsStatus =
    sourceKey === ""
      ? "disabled"
      : statusState.key === sourceKey
        ? statusState.value
        : "connecting";

  const setStatus = useCallback(
    (next: BoardingsStatus | ((prev: BoardingsStatus) => BoardingsStatus)) => {
      setStatusState((prev) => {
        const current = prev.key === sourceKey ? prev.value : "connecting";
        return { key: sourceKey, value: typeof next === "function" ? next(current) : next };
      });
    },
    [sourceKey],
  );

  const load = useCallback(
    async (key: string, conn: Connection) => {
      // "Last hour" is measured against load time, not against zero, or the board would
      // read 0 for the first minute after every page load.
      setNowMs(Date.now());
      const fresh = await fetchBoardings(conn, dataset, sinceIso(lookbackHours));
      setRowsState({ key, rows: fresh });
      setErrorState({ key, value: null });
    },
    [dataset, lookbackHours],
  );

  useEffect(() => {
    const conn = connection;
    const key = sourceKey;
    if (!conn || !key) return;

    const run = () => {
      load(key, conn).catch((err: unknown) => {
        setErrorState({ key, value: err instanceof Error ? err.message : String(err) });
        setStatus((prev) => (prev === "live" ? prev : "reconnecting"));
      });
    };

    run();

    // Events sent while the tab was hidden are not buffered, so re-read on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [connection, sourceKey, load, setStatus]);

  // Local clock for the rolling "last hour" figure. Deliberately not a request.
  useEffect(() => {
    if (sourceKey === "") return;
    const timer = setInterval(() => setNowMs(Date.now()), RECOUNT_MS);
    return () => clearInterval(timer);
  }, [sourceKey]);

  useEffect(() => {
    const conn = connection;
    const key = sourceKey;
    if (!conn || !key) return;

    const client = getSupabase(conn);
    let cancelled = false;
    // False until the channel has been up at least once, so the first SUBSCRIBED is not
    // mistaken for a reconnect and fetched twice.
    let wasSubscribed = false;

    const channel = client
      .channel("boardings")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "boardings" },
        (payload) => {
          const row = payload.new as BoardingRow;
          if (!row || row.dataset !== dataset) return;
          setNowMs(Date.now());
          setRowsState((prev) => {
            const list = prev.key === key ? prev.rows : EMPTY_ROWS;
            if (list.some((existing) => existing.id === row.id)) return prev;
            return { key, rows: [...list, row].slice(-MAX_BUFFERED_ROWS) };
          });
        },
      )
      .subscribe((subState) => {
        if (cancelled) return;
        if (subState === "SUBSCRIBED") {
          setStatus("live");
          // postgres_changes does not replay what was inserted while the socket was down,
          // so a reconnect has to re-read the window or those taps are lost for good.
          if (wasSubscribed) {
            load(key, conn).catch((err: unknown) => {
              setErrorState({ key, value: err instanceof Error ? err.message : String(err) });
            });
          }
          wasSubscribed = true;
        } else if (subState === "CHANNEL_ERROR" || subState === "TIMED_OUT") {
          setStatus("reconnecting");
        }
      });

    const grace = setTimeout(() => {
      if (!cancelled) setStatus((prev) => (prev === "connecting" ? "reconnecting" : prev));
    }, RECONNECT_GRACE_MS);

    return () => {
      cancelled = true;
      clearTimeout(grace);
      void client.removeChannel(channel);
    };
  }, [connection, sourceKey, dataset, load, setStatus]);

  const reload = useCallback(() => {
    if (!connection || !sourceKey) return;
    load(sourceKey, connection).catch((err: unknown) => {
      setErrorState({ key: sourceKey, value: err instanceof Error ? err.message : String(err) });
    });
  }, [connection, sourceKey, load]);

  const lastHourCount = useMemo(() => {
    if (nowMs === 0) return 0;
    const cutoff = nowMs - 3_600_000;
    return rows.filter((row) => new Date(row.tapped_at).getTime() >= cutoff).length;
  }, [rows, nowMs]);

  const lastTapAt = useMemo(
    () => (rows.length > 0 ? rows[rows.length - 1].tapped_at : null),
    [rows],
  );

  return {
    enabled: sourceKey !== "",
    status,
    rows,
    lastTapAt,
    lastHourCount,
    error,
    reload,
  };
}
