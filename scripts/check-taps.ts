/**
 * Reports the taps in the database and checks they are correct.
 *
 * This is the objective answer to "did that tap work?", for the bench session. It reads
 * the last day of rows with the publishable key -- `anon` has SELECT on `boardings`, so
 * no ingest token is involved and nothing is written -- then re-resolves every row
 * through the same `attributeBoardings` the board uses, and flags anything wrong.
 *
 * The checks exist because each of these produced a plausible-looking board rather than
 * an error: a tap attributed to the Lothian 9 instead of the shuttle, a card id that is
 * not the sketch's 8 hex characters, or one card written twice inside the 10s debounce.
 *
 * Local only. It talks to the network and the row set is whatever the demo database
 * happens to hold, so it is deliberately not part of CI.
 *
 * Run with: npm run check:taps  [-- --hours 2]
 */
import { loadEnv } from "vite";
import { attributeBoardings } from "../src/lib/attribution";
import { buildShuttleWindows, londonMinutes } from "../src/lib/serviceId";
import { fetchBoardings, type BoardingRow } from "../src/lib/boardings";
import { isTapCardId } from "../src/lib/nfcReader";
import type { Connection } from "../src/config";
import type { StopCode } from "../src/config";

const env = loadEnv("development", process.cwd(), "VITE_");
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const dataset = env.VITE_BOARDING_DATASET || "expo-demo";

if (!url || !anonKey) {
  console.error("FAIL  connection configured  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env");
  process.exit(1);
}

const hoursArg = process.argv.find((a) => a.startsWith("--hours="))?.split("=")[1];
const HOURS = Number(hoursArg ?? (process.env.npm_config_hours || 24));
const since = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();

const connection: Connection = { id: "check-taps", label: "check-taps", url, anonKey };

const problems: string[] = [];
function flag(level: "FAIL" | "WARN", message: string): void {
  problems.push(`${level}  ${message}`);
  console.log(`${level}  ${message}`);
}

const hhmm = (iso: string) => {
  const m = londonMinutes(iso);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

console.log(`dataset ${dataset} · last ${HOURS}h · since ${since}\n`);

let rows: BoardingRow[];
try {
  rows = await fetchBoardings(connection, dataset, since);
} catch (err) {
  console.error(`FAIL  could not read boardings  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

if (rows.length === 0) {
  console.log("No taps in the window. Use \"Simulate tap\" in the kiosk, or tap a card on the reader.");
  process.exit(0);
}

// Resolved service per row, via the production rule. Grouped by stop so the window
// list is built once per stop rather than once per row.
const windowsFor = new Map<string, ReturnType<typeof buildShuttleWindows>>();
const resolved = rows.map((row) => {
  let windows = windowsFor.get(row.stop);
  if (!windows) {
    windows = buildShuttleWindows(row.stop as StopCode, new Date(row.tapped_at));
    windowsFor.set(row.stop, windows);
  }
  const attribution = attributeBoardings([row], windows, new Date(row.tapped_at));
  const serviceId = Object.keys(attribution.byServiceId)[0] ?? null;
  return { row, serviceId, unassigned: attribution.unassigned === 1 };
});

console.log("tapped_at   stop     card_id     raw kind   resolved shuttle        tap");
console.log("-".repeat(76));
for (const { row, serviceId, unassigned } of resolved) {
  const window = serviceId
    ? windowsFor.get(row.stop)?.find((w) => w.serviceId === serviceId)
    : undefined;
  console.log(
    [
      hhmm(row.tapped_at).padEnd(10),
      row.stop.padEnd(8),
      String(row.card_id ?? "-").padEnd(11),
      (row.service_kind ?? "-").padEnd(10),
      (window ? `${window.displayTime}` : unassigned ? "(none)" : "?").padEnd(21),
      unassigned ? "after last shuttle" : "counted",
    ].join(" "),
  );
}
console.log("-".repeat(76));
console.log(`${rows.length} row(s)\n`);

// ------------------------------------------------------------------- the checks

for (const { row, serviceId, unassigned } of resolved) {
  if (serviceId?.startsWith("bus9-")) {
    flag("FAIL", `row ${row.id} resolved to the 9 (${serviceId}) -- attribution is wrong`);
  }
  if (row.service_kind !== "shuttle") {
    flag("WARN", `row ${row.id} carries service_kind="${row.service_kind}" (pre-fix row; should still resolve to a shuttle)`);
  }
  if (row.card_id && !isTapCardId(row.card_id)) {
    flag("FAIL", `row ${row.id} has a malformed card_id: ${JSON.stringify(row.card_id)}`);
  }
  if (row.card_id && row.card_id !== row.card_id.toLowerCase()) {
    flag("WARN", `row ${row.id} has an uppercase card_id: ${row.card_id} (Simulate tap used to emit uppercase)`);
  }
  if (unassigned) {
    flag("WARN", `row ${row.id} at ${hhmm(row.tapped_at)} is after the last shuttle of the day, so it is not counted`);
  }
}

// One card twice inside the 10s debounce. Sorted by tap time so the comparison is
// between genuinely adjacent taps.
const byCard = new Map<string, BoardingRow[]>();
for (const row of [...rows].sort((a, b) => a.tapped_at.localeCompare(b.tapped_at))) {
  const key = row.card_id ?? "(null)";
  const list = byCard.get(key) ?? [];
  list.push(row);
  byCard.set(key, list);
}
for (const [card, list] of byCard) {
  for (let i = 1; i < list.length; i++) {
    const gapMs = new Date(list[i].tapped_at).getTime() - new Date(list[i - 1].tapped_at).getTime();
    if (gapMs < 10_000) {
      flag(
        "FAIL",
        `card ${card} was recorded twice within ${(gapMs / 1000).toFixed(1)}s (rows ${list[i - 1].id}, ${list[i].id}) -- the 10s debounce did not hold`,
      );
    }
  }
}

const realCards = new Set(
  resolved.filter((r) => r.row.service_kind === "shuttle").map((r) => r.row.card_id),
).size;
console.log(`${realCards} distinct card id(s) on shuttle rows`);

if (problems.some((p) => p.startsWith("FAIL"))) {
  console.error("\nAt least one FAIL above: the tap path is not correct yet.");
  process.exit(1);
}
if (problems.length > 0) {
  console.log("\nNo FAILs. Warnings above are legacy rows or taps after the last shuttle.");
} else {
  console.log("\nAll clean: every tap is a shuttle boarding, correctly attributed.");
}
