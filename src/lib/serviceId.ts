import type { StopCode } from "../config";
import type { ServiceKind } from "./boardings";
import {
  BRISTO_SQUARE_DEPARTURES,
  KINGS_BUILDINGS_DEPARTURES,
  type DepartureTime,
} from "../data/timetable";
import { londonDateKey } from "./londonTime";

// Re-exported so existing callers keep importing from here. The London helpers live
// in their own module so `timetable.ts` can use them without importing this file back.
export { londonDateKey, londonMinutes } from "./londonTime";

function hhmmToMinutes(hhmm: string): number {
  const digits = hhmm.replace(":", "");
  return Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
}

/** e.g. shuttle-bristo-2026-10-02-1625 — one identifier per physical bus. */
export function makeServiceId(
  kind: ServiceKind,
  stop: StopCode,
  date: Date,
  hhmm: string,
): string {
  return `${kind}-${stop}-${londonDateKey(date)}-${hhmm.replace(":", "")}`;
}

export interface ServiceWindow {
  serviceId: string;
  departureMinutes: number;
  stop: StopCode;
  displayTime: string;
  serviceLabel: string;
  destination: string;
}

const SHUTTLE_BY_STOP: Record<StopCode, DepartureTime[]> = {
  bristo: BRISTO_SQUARE_DEPARTURES,
  kings: KINGS_BUILDINGS_DEPARTURES,
};

const DIRECTION: Record<StopCode, string> = {
  bristo: "Kings Buildings",
  kings: "Bristo Square",
};

/**
 * Every shuttle departure of a day as a "board by this time" window. A tap belongs to
 * the first departure at or after it, which is what makes counts roll over per bus
 * without a reset job.
 *
 * SHUTTLE DEPARTURES ONLY, deliberately. The reader sits at the shuttle stand and the
 * Lothian 9 leaves from a different stand, so a tap can only ever mean "boarding the
 * shuttle". This used to interleave the 9 into the same window list, which let a tap be
 * written against a 9 service and land on a 9 card: walking every minute of a day, 84%
 * of Bristo's in-window taps and 60% of Kings Buildings' would have gone to the 9. The
 * 9 still gets its own cards and timetable on the board, built straight from the
 * BUS_9_* arrays -- it just never carries taps.
 *
 * Do not add 9 windows back here. The busyness model is only trained on shuttle
 * departure times, so a prediction shown against a 9 would be a meaningless average.
 */
export function buildShuttleWindows(stop: StopCode, date: Date): ServiceWindow[] {
  const windows: ServiceWindow[] = [];

  for (const departure of SHUTTLE_BY_STOP[stop]) {
    windows.push({
      serviceId: makeServiceId("shuttle", stop, date, departure.displayTime),
      departureMinutes: hhmmToMinutes(departure.displayTime),
      stop,
      displayTime: departure.displayTime,
      serviceLabel: "University Shuttle",
      destination: departure.destination || DIRECTION[stop],
    });
  }

  return windows.sort((a, b) => a.departureMinutes - b.departureMinutes);
}
