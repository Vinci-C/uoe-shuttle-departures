import type { StopCode } from "../config";
import type { ServiceKind } from "./boardings";
import {
  BRISTO_SQUARE_DEPARTURES,
  KINGS_BUILDINGS_DEPARTURES,
  BUS_9_TO_KB,
  BUS_9_FROM_KB,
  type DepartureTime,
} from "../data/timetable";

const LONDON_TIME_ZONE = "Europe/London";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** yyyy-MM-dd in London, used to keep datasets and service ids day-scoped. */
export function londonDateKey(date: Date): string {
  return dayFormatter.format(date);
}

/** Minutes since London midnight for an ISO timestamp. */
export function londonMinutes(iso: string): number {
  const parts = clockFormatter.formatToParts(new Date(iso));
  const hours = Number(parts.find((part) => part.type === "hour")?.value);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value);
  return hours * 60 + minutes;
}

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
