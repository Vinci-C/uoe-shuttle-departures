import type { BoardingRow } from "./boardings";
import { londonDateKey, londonMinutes, type ServiceWindow } from "./serviceId";

export interface Attribution {
  byServiceId: Record<string, number>;
  /** Taps that arrived after the last departure of the day. Kept so nothing is hidden. */
  unassigned: number;
  total: number;
}

/**
 * Sorts taps onto the shuttle they boarded.
 *
 * A tap belongs to the first departure at that stop at or after the tap time, i.e. the
 * window between the previous bus leaving and this one leaving. That is what makes
 * counts roll over per bus without a reset job.
 *
 * The rule is the tap time alone. The kiosk's `service_id` hint is written for humans
 * reading the raw row and never overrides this, so a delayed or stale hint can never
 * move a tap onto the wrong bus.
 *
 * `row.service_kind` is deliberately ignored. It is a hint for whoever reads the raw
 * row, and the kiosk now always writes "shuttle", but rows written before that still
 * carry "bus9". Trusting it is what let those rows resolve onto a 9 card; ignoring it
 * re-attributes them to the shuttle, which is where the reader physically was.
 */
export function attributeBoardings(
  rows: BoardingRow[],
  windows: ServiceWindow[],
  displayDate: Date,
): Attribution {
  const day = londonDateKey(displayDate);
  const byStop = new Map<string, ServiceWindow[]>();

  for (const window of windows) {
    const list = byStop.get(window.stop);
    if (list) list.push(window);
    else byStop.set(window.stop, [window]);
  }

  const counts: Record<string, number> = {};
  let unassigned = 0;
  let total = 0;

  for (const row of rows) {
    if (londonDateKey(new Date(row.tapped_at)) !== day) continue;
    total += 1;

    const candidates = byStop.get(row.stop) ?? windows.filter((w) => w.stop === row.stop);

    const target = candidates.find(
      (window) => window.departureMinutes >= londonMinutes(row.tapped_at),
    );

    if (!target) {
      unassigned += 1;
      continue;
    }
    counts[target.serviceId] = (counts[target.serviceId] ?? 0) + 1;
  }

  return { byServiceId: counts, unassigned, total };
}
