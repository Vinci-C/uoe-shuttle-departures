import type { StopCode } from "../config";
import type { ServiceKind } from "./boardings";
import {
  BRISTO_SQUARE_DEPARTURES,
  KINGS_BUILDINGS_DEPARTURES,
  BUS_9_TO_KB,
  BUS_9_FROM_KB,
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
  serviceKind: ServiceKind;
  stop: StopCode;
  displayTime: string;
  serviceLabel: string;
  destination: string;
}

const SHUTTLE_BY_STOP: Record<StopCode, DepartureTime[]> = {
  bristo: BRISTO_SQUARE_DEPARTURES,
  kings: KINGS_BUILDINGS_DEPARTURES,
};

const BUS9_BY_STOP: Record<StopCode, DepartureTime[]> = {
  bristo: BUS_9_TO_KB,
  kings: BUS_9_FROM_KB,
};

const DIRECTION: Record<StopCode, string> = {
  bristo: "Kings Buildings",
  kings: "Bristo Square",
};

/**
 * Every departure of a day as a "board by this time" window. A tap belongs to the
 * first departure at or after it, which is what makes counts roll over per bus
 * without a reset job.
 */
export function buildServiceWindows(stop: StopCode, date: Date): ServiceWindow[] {
  const windows: ServiceWindow[] = [];

  const add = (kind: ServiceKind, schedule: DepartureTime[]) => {
    for (const departure of schedule) {
      windows.push({
        serviceId: makeServiceId(kind, stop, date, departure.displayTime),
        departureMinutes: hhmmToMinutes(departure.displayTime),
        serviceKind: kind,
        stop,
        displayTime: departure.displayTime,
        serviceLabel: kind === "shuttle" ? "University Shuttle" : "Lothian 9",
        destination: departure.destination || DIRECTION[stop],
      });
    }
  };

  add("shuttle", SHUTTLE_BY_STOP[stop]);
  add("bus9", BUS9_BY_STOP[stop]);
  return windows.sort((a, b) => a.departureMinutes - b.departureMinutes);
}
