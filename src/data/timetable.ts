import { londonDateKey, londonDayOfWeek } from "../lib/londonTime";

export interface DepartureTime {
  time: string; // HHMM format
  displayTime: string; // HH:mm format
  arrivalTime?: string; // HH:mm format
  destination?: string; // Optional override for specific terminating journeys
  baseCapacity?: number; // Verified historical baseline from API
}

export const BRISTO_SQUARE_DEPARTURES: DepartureTime[] = [
  { time: '0818', displayTime: '08:18', arrivalTime: '08:32', baseCapacity: 58 },
  { time: '0838', displayTime: '08:38', arrivalTime: '08:52', baseCapacity: 62 },
  { time: '0908', displayTime: '09:08', arrivalTime: '09:22', baseCapacity: 45 },
  { time: '0933', displayTime: '09:33', arrivalTime: '09:47', baseCapacity: 38 },
  { time: '0953', displayTime: '09:53', arrivalTime: '10:07', baseCapacity: 30 },
  { time: '1013', displayTime: '10:13', arrivalTime: '10:27', baseCapacity: 25 },
  { time: '1033', displayTime: '10:33', arrivalTime: '10:47', baseCapacity: 22 },
  { time: '1053', displayTime: '10:53', arrivalTime: '11:07', baseCapacity: 20 },
  { time: '1113', displayTime: '11:13', arrivalTime: '11:27', baseCapacity: 18 },
  { time: '1133', displayTime: '11:33', arrivalTime: '11:47', baseCapacity: 15 },
  { time: '1153', displayTime: '11:53', arrivalTime: '12:07', baseCapacity: 18 },
  { time: '1213', displayTime: '12:13', arrivalTime: '12:27', baseCapacity: 22 },
  { time: '1233', displayTime: '12:33', arrivalTime: '12:47', baseCapacity: 25 },
  { time: '1253', displayTime: '12:53', arrivalTime: '13:07', baseCapacity: 28 },
  { time: '1313', displayTime: '13:13', arrivalTime: '13:27', baseCapacity: 30 },
  { time: '1333', displayTime: '13:33', arrivalTime: '13:47', baseCapacity: 32 },
  { time: '1353', displayTime: '13:53', arrivalTime: '14:07', baseCapacity: 35 },
  { time: '1413', displayTime: '14:13', arrivalTime: '14:27', baseCapacity: 38 },
  { time: '1433', displayTime: '14:33', arrivalTime: '14:47', baseCapacity: 40 },
  { time: '1453', displayTime: '14:53', arrivalTime: '15:07', baseCapacity: 42 },
  { time: '1513', displayTime: '15:13', arrivalTime: '15:27', baseCapacity: 45 },
  { time: '1533', displayTime: '15:33', arrivalTime: '15:47', baseCapacity: 48 },
  { time: '1553', displayTime: '15:53', arrivalTime: '16:11', baseCapacity: 50 },
  { time: '1623', displayTime: '16:23', arrivalTime: '16:41', baseCapacity: 52 },
  { time: '1653', displayTime: '16:53', arrivalTime: '17:11', baseCapacity: 48 },
  { time: '1723', displayTime: '17:23', arrivalTime: '17:41', baseCapacity: 42 },
  { time: '1753', displayTime: '17:53', arrivalTime: '18:11', baseCapacity: 35 },
];

export const KINGS_BUILDINGS_DEPARTURES: DepartureTime[] = [
  { time: '0835', displayTime: '08:35', arrivalTime: '08:49', baseCapacity: 8 },
  { time: '0905', displayTime: '09:05', arrivalTime: '09:19', baseCapacity: 12 },
  { time: '0935', displayTime: '09:35', arrivalTime: '09:49', baseCapacity: 15 },
  { time: '0955', displayTime: '09:55', arrivalTime: '10:09', baseCapacity: 18 },
  { time: '1015', displayTime: '10:15', arrivalTime: '10:29', baseCapacity: 20 },
  { time: '1035', displayTime: '10:35', arrivalTime: '10:49', baseCapacity: 22 },
  { time: '1055', displayTime: '10:55', arrivalTime: '11:09', baseCapacity: 25 },
  { time: '1115', displayTime: '1115', arrivalTime: '11:29', baseCapacity: 22 },
  { time: '1135', displayTime: '11:35', arrivalTime: '11:49', baseCapacity: 20 },
  { time: '1155', displayTime: '11:55', arrivalTime: '12:09', baseCapacity: 22 },
  { time: '1215', displayTime: '12:15', arrivalTime: '12:29', baseCapacity: 25 },
  { time: '1235', displayTime: '12:35', arrivalTime: '12:49', baseCapacity: 28 },
  { time: '1255', displayTime: '12:55', arrivalTime: '13:09', baseCapacity: 32 },
  { time: '1315', displayTime: '13:15', arrivalTime: '13:29', baseCapacity: 35 },
  { time: '1335', displayTime: '13:35', arrivalTime: '13:49', baseCapacity: 40 },
  { time: '1355', displayTime: '13:55', arrivalTime: '14:09', baseCapacity: 45 },
  { time: '1415', displayTime: '14:15', arrivalTime: '14:29', baseCapacity: 50 },
  { time: '1435', displayTime: '14:35', arrivalTime: '14:49', baseCapacity: 55 },
  { time: '1455', displayTime: '14:55', arrivalTime: '15:09', baseCapacity: 60 },
  { time: '1515', displayTime: '15:15', arrivalTime: '15:29', baseCapacity: 65 },
  { time: '1535', displayTime: '15:35', arrivalTime: '15:49', baseCapacity: 68 },
  { time: '1555', displayTime: '15:55', arrivalTime: '16:09', baseCapacity: 62 },
  { time: '1625', displayTime: '16:25', arrivalTime: '16:43', baseCapacity: 58 },
  { time: '1655', displayTime: '16:55', arrivalTime: '17:13', baseCapacity: 52 },
  { time: '1725', displayTime: '17:25', arrivalTime: '17:43', baseCapacity: 45 },
  { time: '1755', displayTime: '17:55', arrivalTime: '18:13', baseCapacity: 35 },
  { time: '1825', displayTime: '18:25', arrivalTime: '18:43', baseCapacity: 25 },
  { time: '1855', displayTime: '18:55', arrivalTime: '19:13', baseCapacity: 15 },
];

// Lothian Bus 9 - TO KB - Times at Bristo Place
export const BUS_9_TO_KB: DepartureTime[] = [
  {"time": "0658", "displayTime": "06:58", "arrivalTime": "07:13"},
  {"time": "0721", "displayTime": "07:21", "arrivalTime": "07:36"},
  {"time": "0745", "displayTime": "07:45", "arrivalTime": "08:02"},
  {"time": "0804", "displayTime": "08:04", "arrivalTime": "08:24"},
  {"time": "0823", "displayTime": "08:23", "arrivalTime": "08:44"},
  {"time": "0825", "displayTime": "08:25", "arrivalTime": "08:46"},
  {"time": "0828", "displayTime": "08:28", "arrivalTime": "08:49"},
  {"time": "0849", "displayTime": "08:49", "arrivalTime": "09:09"},
  {"time": "0910", "displayTime": "09:10", "arrivalTime": "09:29"},
  {"time": "0924", "displayTime": "09:24", "arrivalTime": "09:40"},
  {"time": "0928", "displayTime": "09:28", "arrivalTime": "09:47"},
  {"time": "0949", "displayTime": "09:49", "arrivalTime": "10:08"},
  {"time": "1009", "displayTime": "10:09", "arrivalTime": "10:28"},
  {"time": "1029", "displayTime": "10:29", "arrivalTime": "10:48"},
  {"time": "1049", "displayTime": "10:49", "arrivalTime": "11:08"},
  {"time": "1109", "displayTime": "11:09", "arrivalTime": "11:28"},
  {"time": "1129", "displayTime": "11:29", "arrivalTime": "11:48"},
  {"time": "1149", "displayTime": "11:49", "arrivalTime": "12:08"},
  {"time": "1209", "displayTime": "12:09", "arrivalTime": "12:28"},
  {"time": "1229", "displayTime": "12:29", "arrivalTime": "12:48"},
  {"time": "1249", "displayTime": "12:49", "arrivalTime": "13:08"},
  {"time": "1309", "displayTime": "13:09", "arrivalTime": "13:28"},
  {"time": "1329", "displayTime": "13:29", "arrivalTime": "13:48"},
  {"time": "1349", "displayTime": "13:49", "arrivalTime": "14:08"},
  {"time": "1409", "displayTime": "14:09", "arrivalTime": "14:28"},
  {"time": "1429", "displayTime": "14:29", "arrivalTime": "14:48"},
  {"time": "1449", "displayTime": "14:49", "arrivalTime": "15:08"},
  {"time": "1509", "displayTime": "15:09", "arrivalTime": "15:28"},
  {"time": "1529", "displayTime": "15:29", "arrivalTime": "15:48"},
  {"time": "1551", "displayTime": "15:51", "arrivalTime": "16:11"},
  {"time": "1612", "displayTime": "16:12", "arrivalTime": "16:33"},
  {"time": "1637", "displayTime": "16:37", "arrivalTime": "16:58"},
  {"time": "1643", "displayTime": "16:43", "arrivalTime": "17:04"},
  {"time": "1701", "displayTime": "17:01", "arrivalTime": "17:21"},
  {"time": "1723", "displayTime": "17:23", "arrivalTime": "17:43"},
  {"time": "1743", "displayTime": "17:43", "arrivalTime": "18:02"},
  {"time": "1804", "displayTime": "18:04", "arrivalTime": "18:23"},
  {"time": "1823", "displayTime": "18:23", "arrivalTime": "18:42"},
  {"time": "1843", "displayTime": "18:43", "arrivalTime": "19:01"},
  {"time": "1903", "displayTime": "19:03", "arrivalTime": "19:21"},
  {"time": "1923", "displayTime": "19:23", "arrivalTime": "19:41"},
  {"time": "1943", "displayTime": "19:43", "arrivalTime": "20:01"},
  {"time": "2000", "displayTime": "20:00", "arrivalTime": "20:18"},
  {"time": "2020", "displayTime": "20:20", "arrivalTime": "20:37"},
  {"time": "2039", "displayTime": "20:39", "arrivalTime": "20:54"},
  {"time": "2100", "displayTime": "21:00", "arrivalTime": "21:15"},
  {"time": "2130", "displayTime": "21:30", "arrivalTime": "21:45"},
  {"time": "2200", "displayTime": "22:00", "arrivalTime": "22:14"},
  {"time": "2227", "displayTime": "22:27", "arrivalTime": "22:41"},
  {"time": "2257", "displayTime": "22:57", "arrivalTime": "23:11"},
  {"time": "2326", "displayTime": "23:26", "arrivalTime": "23:40"},
  {"time": "2356", "displayTime": "23:56", "arrivalTime": "00:10"}
];

// Lothian Bus 9 - FROM KB - Times at King's Buildings
export const BUS_9_FROM_KB: DepartureTime[] = [
  {"time": "0714", "displayTime": "07:14", "arrivalTime": "07:29"},
  {"time": "0732", "displayTime": "07:32", "arrivalTime": "07:49"},
  {"time": "0749", "displayTime": "07:49", "arrivalTime": "08:07"},
  {"time": "0809", "displayTime": "08:09", "arrivalTime": "08:31"},
  {"time": "0831", "displayTime": "08:31", "arrivalTime": "08:53"},
  {"time": "0855", "displayTime": "08:55", "arrivalTime": "09:14"},
  {"time": "0915", "displayTime": "09:15", "arrivalTime": "09:33"},
  {"time": "0935", "displayTime": "09:35", "arrivalTime": "09:53"},
  {"time": "0955", "displayTime": "09:55", "arrivalTime": "10:13"},
  {"time": "1015", "displayTime": "10:15", "arrivalTime": "10:32"},
  {"time": "1035", "displayTime": "10:35", "arrivalTime": "10:52"},
  {"time": "1055", "displayTime": "10:55", "arrivalTime": "11:12"},
  {"time": "1115", "displayTime": "11:15", "arrivalTime": "11:32"},
  {"time": "1135", "displayTime": "11:35", "arrivalTime": "11:52"},
  {"time": "1155", "displayTime": "11:55", "arrivalTime": "12:12"},
  {"time": "1215", "displayTime": "12:15", "arrivalTime": "12:32"},
  {"time": "1235", "displayTime": "12:35", "arrivalTime": "12:52"},
  {"time": "1255", "displayTime": "12:55", "arrivalTime": "13:12"},
  {"time": "1315", "displayTime": "13:15", "arrivalTime": "13:32"},
  {"time": "1335", "displayTime": "13:35", "arrivalTime": "13:52"},
  {"time": "1355", "displayTime": "13:55", "arrivalTime": "14:12"},
  {"time": "1415", "displayTime": "14:15", "arrivalTime": "14:32"},
  {"time": "1435", "displayTime": "14:35", "arrivalTime": "14:52"},
  {"time": "1455", "displayTime": "14:55", "arrivalTime": "15:12"},
  {"time": "1515", "displayTime": "15:15", "arrivalTime": "15:32"},
  {"time": "1535", "displayTime": "15:35", "arrivalTime": "15:53"},
  {"time": "1557", "displayTime": "15:57", "arrivalTime": "16:15"},
  {"time": "1609", "displayTime": "16:09", "arrivalTime": "16:27", "destination": "Hanover Street"},
  {"time": "1619", "displayTime": "16:19", "arrivalTime": "16:37"},
  {"time": "1629", "displayTime": "16:29", "arrivalTime": "16:47", "destination": "Bristo Square"},
  {"time": "1639", "displayTime": "16:39", "arrivalTime": "16:58"},
  {"time": "1650", "displayTime": "16:50", "arrivalTime": "17:09"},
  {"time": "1705", "displayTime": "17:05", "arrivalTime": "17:25"},
  {"time": "1712", "displayTime": "17:12", "arrivalTime": "17:32", "destination": "Hanover Street"},
  {"time": "1725", "displayTime": "17:25", "arrivalTime": "17:45"},
  {"time": "1735", "displayTime": "17:35", "arrivalTime": "17:55", "destination": "Hanover Street"},
  {"time": "1749", "displayTime": "17:49", "arrivalTime": "18:08"},
  {"time": "1809", "displayTime": "18:09", "arrivalTime": "18:28"},
  {"time": "1831", "displayTime": "18:31", "arrivalTime": "18:48"},
  {"time": "1849", "displayTime": "18:49", "arrivalTime": "19:06"},
  {"time": "1909", "displayTime": "19:09", "arrivalTime": "19:26"},
  {"time": "1931", "displayTime": "19:31", "arrivalTime": "19:48"},
  {"time": "1951", "displayTime": "19:51", "arrivalTime": "20:08"},
  {"time": "2025", "displayTime": "20:25", "arrivalTime": "20:40"},
  {"time": "2055", "displayTime": "20:55", "arrivalTime": "21:09"},
  {"time": "2125", "displayTime": "21:25", "arrivalTime": "21:39"},
  {"time": "2157", "displayTime": "21:57", "arrivalTime": "22:11"},
  {"time": "2227", "displayTime": "22:27", "arrivalTime": "22:41"},
  {"time": "2257", "displayTime": "22:57", "arrivalTime": "23:11"},
  {"time": "2327", "displayTime": "23:27", "arrivalTime": "23:40"},
  {"time": "2347", "displayTime": "23:47", "arrivalTime": "23:59", "destination": "Bristo Square"},
  {"time": "0017", "displayTime": "00:17", "arrivalTime": "00:29", "destination": "Hanover Street"}
];

/**
 * Weeks in which the shuttle runs, taken from the University semester dates
 * (https://semester-dates.ed.ac.uk). Weekends are excluded by `isShuttleOperating`.
 *
 * THIS LIST IS WHAT HIDES THE SHUTTLE, SILENTLY. When a term starts and is missing
 * here, `isShuttleOperating` returns false, the board shows only the 9 plus a
 * "shuttle not in operation" notice, and nothing anywhere reports an error. The list
 * expired on 2026-05-22 and the shuttle vanished for the whole of the 2026/27 autumn
 * term.
 *
 * When you add a term, add the next one too, and note the source.
 */
export const SHUTTLE_OPERATING_PERIODS: { start: string; end: string }[] = [
  // 2025/26
  { start: "2025-09-08", end: "2025-12-19" },
  { start: "2026-01-12", end: "2026-04-03" },
  { start: "2026-04-20", end: "2026-05-22" },
  // 2026/27. Semester 1 runs 21 Sep - 21 Dec 2026, Semester 2 runs 11 Jan - 22 May 2027.
  // TODO: add 2027/28 when published (https://semester-dates.ed.ac.uk/202728).
  { start: "2026-09-21", end: "2026-12-21" },
  { start: "2027-01-11", end: "2027-05-22" },
];

export function isShuttleOperating(date: Date): boolean {
  const day = londonDayOfWeek(date);
  if (day === 0 || day === 6) return false;
  const dateStr = londonDateKey(date);
  return SHUTTLE_OPERATING_PERIODS.some(
    p => dateStr >= p.start && dateStr <= p.end
  );
}

/**
 * Teaching blocks for 2026/27, from https://semester-dates.ed.ac.uk/202627.
 *
 * Each entry is a contiguous run of teaching days tagged with the **teaching week number
 * it starts at**. `week: -1` marks revision, examination, vacation and Flexible Learning
 * Week, which the capacity model treats as its own regime rather than a week number.
 * Edinburgh runs Semester 1 as teaching weeks 1-11 and Semester 2 as weeks 12-22.
 *
 * THIS IS THE INPUT THAT DECIDES EVERY BUSINESS PREDICTION ON THE BOARD, and it
 * failed silently before. It was a single hardcoded `SEMESTER_START` of 12 Jan 2026
 * (Semester 2 2026 only), so from 22 May 2026 onwards the computed "week of semester"
 * just kept climbing — 35 by 30 Sep 2026. The model was only ever trained on weeks
 * 1-11, so feeding it 35 extrapolated off a cliff and pushed every prediction under
 * the `<= 40` threshold: 52 of 54 shuttle services read "Plenty of seats available".
 * No request failed and nothing was logged.
 *
 * The difference between an in-range and out-of-range week is not subtle — at 09:33
 * the model decays from 78 (week 1) to 61 (week 12) and keeps sliding. Keep this table
 * current, and keep the ranges gap-free across a term, or `getTeachingWeek` falls
 * through to its out-of-term result.
 */
export const ACADEMIC_CALENDAR_2026_27: {
  start: string;
  end: string;
  week: number;
}[] = [
  // Semester 1: teaching blocks 1 (21 Sep - 23 Oct) and 2 (26 Oct - 4 Dec), then
  // revision 7-8 Dec and examinations 9-21 Dec.
  { start: "2026-09-21", end: "2026-10-25", week: 1 },
  { start: "2026-10-26", end: "2026-12-04", week: 6 },
  { start: "2026-12-07", end: "2026-12-21", week: -1 },
  // Semester 2: teaching block 3 (11 Jan - 12 Feb), Flexible Learning Week
  // 15-19 Feb, teaching block 4 (22 Feb - 2 Apr), spring teaching vacation
  // 5-16 Apr, then revision and examinations to 21 May.
  { start: "2027-01-11", end: "2027-02-12", week: 12 },
  { start: "2027-02-15", end: "2027-02-19", week: -1 },
  { start: "2027-02-22", end: "2027-04-02", week: 17 },
  { start: "2027-04-05", end: "2027-04-16", week: -1 },
  { start: "2027-04-19", end: "2027-05-21", week: -1 },
];

/** Whole days from one yyyy-MM-dd key to another. Keys are London calendar dates. */
function daysBetweenKeys(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      (86_400_000),
  );
}

/**
 * The teaching week the capacity model expects, or `-1` for anything that is not a
 * teaching day: revision, examinations, vacation, Flexible Learning Week, welcome week,
 * or any date outside the table above.
 *
 * `-1` rather than `0` on purpose. Downstream, `weekOfSemester` is `Math.max(1, week)`
 * and `revisionOrFlexibleWeek` is `week === -1`, so returning `0` would silently become
 * a confident week-1 prediction for a day that never happened. `-1` also makes the
 * board read "plenty of seats" out of term, which is the honest answer: nobody is on
 * campus.
 *
 * TODO: add 2027/28 when published (https://semester-dates.ed.ac.uk/202728).
 */
export function getTeachingWeek(date: Date): number {
  const key = londonDateKey(date);
  const entry = ACADEMIC_CALENDAR_2026_27.find(
    p => key >= p.start && key <= p.end,
  );
  // Not a teaching day: either explicitly tagged -1, or between/outside the blocks.
  if (!entry || entry.week < 0) return -1;
  return entry.week + Math.floor(daysBetweenKeys(entry.start, key) / 7);
}
