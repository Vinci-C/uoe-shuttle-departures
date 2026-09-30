/**
 * Fails if a tap can ever be attributed to a Lothian 9 service.
 *
 * The reader sits at the shuttle stand and the 9 leaves from a different stand, so a
 * tap can only ever mean "boarding the shuttle". `buildServiceWindows` used to
 * interleave the 9 into the same window list and `attributeBoardings` used to trust
 * each row's `service_kind`, which together let a real tap land on a 9 card for most
 * of the shuttle's window. Nothing failed when that happened: a row was written, the
 * pill incremented, and the number was simply wrong.
 *
 * This walks every minute of a day at both stops, resolves each one the way the board
 * does, and asserts the result is always a shuttle service. It also replays rows still
 * carrying the old "bus9" hint, because those exist in the table and must re-attribute
 * rather than disappear.
 *
 * Offline and deterministic, so it is safe in CI.
 *
 * Run with: npm run verify:attribution
 */
import {
  BRISTO_SQUARE_DEPARTURES,
  KINGS_BUILDINGS_DEPARTURES,
} from "../src/data/timetable";
import { attributeBoardings } from "../src/lib/attribution";
import { buildShuttleWindows, makeServiceId } from "../src/lib/serviceId";
import type { BoardingRow, ServiceKind } from "../src/lib/boardings";
import type { StopCode } from "../src/config";

const failures: string[] = [];

function check(label: string, pass: boolean, detail: string): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!pass) failures.push(label);
}

// A fixed summer weekday in term, in the middle of the current operating period.
// Fixed rather than `new Date()` so the guard is deterministic and does not start
// failing in the vacation. Europe/London is BST (+01:00) on this date, so the offset
// below is correct and `londonMinutes` reads the local time straight off it.
const DAY = "2026-10-07";
const OFFSET = "+01:00";
const displayDate = new Date(`${DAY}T12:00:00Z`);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const at = (m: number) =>
  `${DAY}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00${OFFSET}`;

const CASES: { stop: StopCode; label: string; schedule: typeof BRISTO_SQUARE_DEPARTURES }[] = [
  { stop: "bristo", label: "Bristo Square", schedule: BRISTO_SQUARE_DEPARTURES },
  { stop: "kings", label: "Kings Buildings", schedule: KINGS_BUILDINGS_DEPARTURES },
];

for (const { stop, label, schedule } of CASES) {
  const windows = buildShuttleWindows(stop, displayDate);

  // 1. The window set is shuttle-only.
  const nonShuttle = windows.filter((w) => !w.serviceId.startsWith("shuttle-"));
  check(
    `${label}: every service window is a shuttle service`,
    nonShuttle.length === 0,
    `${windows.length} windows, ${nonShuttle.length} not shuttle`,
  );

  // 2. A tap at every minute of the day never resolves to a 9.
  const rows: BoardingRow[] = [];
  for (let m = 0; m < 24 * 60; m++) {
    rows.push({
      id: rows.length + 1,
      dataset: "verify",
      stop,
      service_id: null,
      service_kind: "shuttle",
      card_id: "0000abcd",
      tapped_at: at(m),
    });
  }

  const { byServiceId, unassigned, total } = attributeBoardings(rows, windows, displayDate);

  const resolvedIds = Object.keys(byServiceId);
  const bus9Ids = resolvedIds.filter((id) => id.startsWith("bus9-"));
  check(
    `${label}: no tap resolves to a Lothian 9 service`,
    bus9Ids.length === 0,
    `${total} taps resolved across ${resolvedIds.length} services, ${bus9Ids.length} on the 9`,
  );

  // 3. Every shuttle departure is reachable, so no bus can never show a count.
  const reachable = new Set(resolvedIds);
  const unreachable = windows.filter((w) => !reachable.has(w.serviceId));
  check(
    `${label}: every shuttle departure is reachable by a tap`,
    unreachable.length === 0,
    `${reachable.size}/${windows.length} reachable, ${unreachable.length} unreachable`,
  );

  // 4. Taps before the first departure and in every gap are attributed, and taps
  //    after the last departure are reported as unassigned rather than dropped.
  const lastDeparture = Math.max(...windows.map((w) => w.departureMinutes));
  const earlyTap = attributeBoardings(
    [{ id: 1, dataset: "verify", stop, service_id: null, service_kind: "shuttle", card_id: "0", tapped_at: at(0) }],
    windows,
    displayDate,
  );
  check(
    `${label}: a tap before the first departure lands on the first bus`,
    earlyTap.byServiceId[windows[0].serviceId] === 1,
    `expected ${windows[0].serviceId}`,
  );

  const lateTap = attributeBoardings(
    [{ id: 1, dataset: "verify", stop, service_id: null, service_kind: "shuttle", card_id: "0", tapped_at: at(lastDeparture + 1) }],
    windows,
    displayDate,
  );
  check(
    `${label}: a tap after the last departure is reported unassigned`,
    lateTap.unassigned === 1 && Object.keys(lateTap.byServiceId).length === 0,
    `unassigned=${lateTap.unassigned}`,
  );

  // 5. A row still carrying the old "bus9" hint must re-attribute to the shuttle, not
  //    vanish and not land on a 9.
  const legacy: BoardingRow[] = [1, 2, 3].map((n) => ({
    id: n,
    dataset: "verify",
    stop,
    service_id: makeServiceId("bus9" as ServiceKind, stop, displayDate, "0904"),
    service_kind: "bus9" as ServiceKind,
    card_id: "0000abcd",
    tapped_at: at(minutes("09:05")),
  }));
  const legacyResult = attributeBoardings(legacy, windows, displayDate);
  const legacyTotal = Object.values(legacyResult.byServiceId).reduce((a, b) => a + b, 0);
  check(
    `${label}: legacy bus9-tagged rows re-attribute to the shuttle`,
    legacyTotal === 3 && Object.keys(legacyResult.byServiceId).every((id) => id.startsWith("shuttle-")),
    `${legacyTotal}/3 re-attributed, kinds=${JSON.stringify(Object.keys(legacyResult.byServiceId))}`,
  );

  console.log(
    `      (${schedule.length} departures, ${unassigned} of ${total} taps after the last bus)`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} attribution check(s) failed.`);
  process.exit(1);
}
console.log("\nAll attribution checks passed: taps are shuttle boardings only.");
