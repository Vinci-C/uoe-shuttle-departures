import type { StopCode } from "../config";
import { predictBusyness, type BusynessLevel } from "./runModel";

export const BUSYNESS_LABELS: Record<BusynessLevel, string> = {
  0: "No information available",
  1: "Plenty of seats available",
  2: "Limited seats available",
  3: "Standing room only",
  4: "Bus expected to be full",
};

export const BUSYNESS_COLORS: Record<BusynessLevel, string> = {
  0: "#666666",
  1: "#a3bce6",
  2: "#c2d9a3",
  3: "#e8b966",
  4: "#e6a3a3",
};

/**
 * Maps a measured headcount onto the same scale the timetable already uses for
 * `baseCapacity` (see `getPredictedBusyness` in DepartureBoard) so a real count and a
 * predicted level can be shown side by side. It is a rough comparison for the demo,
 * not a calibrated model output.
 */
export function levelFromCount(count: number): BusynessLevel {
  if (count <= 0) return 0;
  if (count <= 40) return 1;
  if (count <= 60) return 2;
  if (count <= 70) return 3;
  return 4;
}

/** predicted - actual, in levels. Negative means the model expected a busier bus. */
export function levelDelta(predicted: BusynessLevel, actual: BusynessLevel): number {
  return predicted - actual;
}

export function agreementLabel(predicted: BusynessLevel, actual: BusynessLevel): string {
  if (actual === 0 || predicted === 0) return "Not enough data to compare yet";
  const delta = levelDelta(predicted, actual);
  if (delta === 0) return "Model matched the observed boarding";
  if (delta < 0) {
    const levels = Math.abs(delta);
    return `Model was ${levels} level${levels === 1 ? "" : "s"} busier than reality`;
  }
  const levels = delta;
  return `Model was ${levels} level${levels === 1 ? "" : "s"} quieter than reality`;
}

export interface ServicePrediction {
  /** "HH:MM" */
  time: string;
  stop: StopCode;
  temperature: number;
  rainfall: number;
  dayOfWeek: number;
  semesterWeek: number;
}

/** The model's own view of one service, matching how the departure board calls it. */
export function predictServiceBusyness(params: ServicePrediction): BusynessLevel {
  return predictBusyness({
    temperatureF: Math.round((params.temperature * 9) / 5 + 32),
    isRaining: params.rainfall === 0 ? 0 : params.rainfall >= 2 ? 2 : 1,
    busTime: params.time,
    dayOfWeek: params.dayOfWeek,
    isBristoSquare: params.stop === "bristo",
    isKingsBuildings: params.stop === "kings",
    revisionOrFlexibleWeek: params.semesterWeek === -1,
    weekOfSemester: Math.max(1, params.semesterWeek),
  });
}
