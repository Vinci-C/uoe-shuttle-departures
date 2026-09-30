/**
 * Fails if the Arduino sketch and the web reader disagree about the tap protocol.
 *
 * The two sides share a protocol that exists only in comments: a JSON line per event
 * from `BoothReader.ino`, framed by `readScans` and interpreted by `useReader`. Nothing
 * in the build or CI ever compared them, and the board has never been flashed, so a
 * change to either file would have shipped silently. tsc, lint and the existing guards
 * all pass on a protocol mismatch because neither language can see the other's strings.
 *
 * Two things are checked:
 *
 *  1. Source agreement -- every key the sketch can emit is a field the web's `ScanEvent`
 *     knows about, and the sketch's card id format satisfies `TAP_CARD_ID_PATTERN`.
 *  2. Behaviour -- the sketch's exact documented transcript, including a line split
 *     across two serial reads and an unreadable line, is replayed through the real
 *     `readScans`. A tap must be detected, the other lines must arrive as events rather
 *     than taps, and one bad byte must not end the session.
 *
 * Once the board is flashed, replace the synthetic transcript with a capture from
 * `card reader/transcripts/` so this replays real bytes.
 *
 * Offline and deterministic, so it is safe in CI.
 *
 * Run with: npm run verify:reader
 */
import { readFileSync } from "node:fs";
import { isTapCardId, readScans, type ScanEvent } from "../src/lib/nfcReader";
import { TAP_CARD_ID_PATTERN } from "../src/lib/nfcReader";

const SKETCH = "card reader/BoothReader/BoothReader.ino";
const failures: string[] = [];

function check(label: string, pass: boolean, detail: string): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!pass) failures.push(label);
}

// Every field the web is prepared to read. Kept as a literal so this fails if the
// interface grows a field nobody parses, or loses one the sketch still sends.
const KNOWN_FIELDS: Record<string, true> = {
  v: true,
  event: true,
  uid: true,
  tag: true,
  card: true,
  fw: true,
  code: true,
};

// ---------------------------------------------------------------- source agreement

let sketch: string;
try {
  sketch = readFileSync(SKETCH, "utf8");
} catch {
  console.error(`FAIL  sketch is readable  ${SKETCH} not found`);
  process.exit(1);
}

// The sketch writes escaped JSON, so keys appear as \"key\" in the source.
const emittedKeys = new Set<string>();
for (const match of sketch.matchAll(/\\"([a-z_]+)\\"\s*:/g)) emittedKeys.add(match[1]);
for (const match of sketch.matchAll(/"([a-z_]+)":/g)) emittedKeys.add(match[1]);

const unknownKeys = [...emittedKeys].filter((key) => !KNOWN_FIELDS[key]);
check(
  "every key the sketch emits is understood by the web",
  unknownKeys.length === 0 && emittedKeys.size > 0,
  `sketch emits [${[...emittedKeys].sort().join(", ")}], unknown: [${unknownKeys.join(", ")}]`,
);

check(
  "the sketch and the web agree on the protocol version",
  /"v":\s*1/.test(sketch) || /\\"v\\":\s*1/.test(sketch),
  "sketch emits v:1",
);

// The re-arm threshold decides how long a card must be lifted before it counts again.
// It has to be comfortably longer than the sketch's 400ms poll, or an antenna dropout
// mid-read would split one presentation into two taps. The first implementation used a
// time-since-last-tap debounce instead and counted a card left on the reader every 10s;
// see card reader/transcripts/ for the capture that caught it.
const rearm = sketch.match(/REARM_MS\s*=\s*(\d+)UL/);
const poll = sketch.match(/delay\((\d+)\);/);
check(
  "the sketch re-arms on a lift, not on elapsed time",
  rearm !== null && /lastCard\s*=\s*""/.test(sketch) && !/lastCardAt/.test(sketch),
  rearm ? `REARM_MS = ${rearm[1]}ms` : "REARM_MS not found",
);

check(
  "the re-arm threshold outlasts the poll, so a dropout cannot split one tap",
  rearm !== null && poll !== null && Number(rearm[1]) >= Number(poll[1]) * 2,
  `REARM_MS = ${rearm?.[1]}ms, poll = ${poll?.[1]}ms`,
);

// The sketch hashes with %08lx: 8 lowercase hex. If that stops being true the web
// would silently drop every real tap as malformed.
const sampleHash = "04a1b2c3";
check(
  "the sketch's card id format satisfies TAP_CARD_ID_PATTERN",
  isTapCardId(sampleHash) && TAP_CARD_ID_PATTERN.test(sampleHash.toUpperCase()),
  `"${sampleHash}" accepted, uppercase also accepted`,
);

for (const bad of ["", "zz", "04a1b2", "04a1b2c3d4", "0x4a1b2c3", "04A1B2C3 "]) {
  check(`malformed card id rejected: ${JSON.stringify(bad)}`, !isTapCardId(bad), "rejected");
}

// ------------------------------------------------------------------- behavioural

/** The transcript BoothReader.ino documents, byte for byte. */
const LINES = [
  '{"v":1,"event":"ready","fw":"1.0.0"}',
  '{"v":1,"event":"error","code":1}',
  '{"v":1,"uid":"04a1b2c3","tag":"NTAG213"}',
  '{"v":1,"event":"held","card":"04a1b2c3"}',
  '{"v":1,"event":"error","code":1}',
  '{"v":1,"uid":"deadbeef","tag":"NTAG215"}',
];

/** One bad line, dropped in early so it has to not stop the taps that follow it. */
const GARBAGE = '{"v":1,"uid":"not json at all';

const STREAM_TEXT = [LINES[0], LINES[1], GARBAGE, ...LINES.slice(2)].join("\n") + "\n";

// Split the byte stream mid-token twice, the way a real 115200 stream arrives: a line can
// and will straddle two reads. These are a clean partition, so nothing is sent twice.
const CUTS = [
  STREAM_TEXT.indexOf('"uid":"04a1') + 9,
  STREAM_TEXT.indexOf('"event":"held"') + 8,
];
const encoder = new TextEncoder();
const chunks: Uint8Array[] = [];
let cursor = 0;
for (const cut of CUTS) {
  chunks.push(encoder.encode(STREAM_TEXT.slice(cursor, cut)));
  cursor = cut;
}
chunks.push(encoder.encode(STREAM_TEXT.slice(cursor)));

const port = {
  readable: new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }),
} as unknown as SerialPort;

const events: ScanEvent[] = [];
const errors: string[] = [];

await new Promise<void>((resolve) => {
  readScans(port, (event) => events.push(event), (err) => errors.push(err.message));
  // The stream closes on its own; give the reader loop a moment to drain and unwind.
  setTimeout(resolve, 250);
});

const taps = events.filter((event) => isTapCardId(event.uid));
const byEvent = (name: string) => events.filter((event) => event.event === name);

check(
  "a split-across-reads tap line is still detected",
  taps.length === 2,
  `taps: [${taps.map((t) => t.uid).join(", ")}]`,
);

check(
  "taps arrive with the sketch's tag type",
  taps[0]?.tag === "NTAG213" && taps[1]?.tag === "NTAG215",
  `[${taps.map((t) => t.tag).join(", ")}]`,
);

check(
  "the boot line arrives as a ready event, not a tap",
  byEvent("ready").length === 1 && byEvent("ready")[0]?.fw === "1.0.0",
  `ready x${byEvent("ready").length}, fw=${byEvent("ready")[0]?.fw}`,
);

check(
  "the debounce echo arrives as a held event, not a second tap",
  byEvent("held").length === 1 && byEvent("held")[0]?.card === "04a1b2c3",
  `held x${byEvent("held").length}`,
);

check(
  "no-tag errors arrive as error events, not taps",
  byEvent("error").length === 2 &&
    byEvent("error").every((e) => e.code === 1 || e.code === 2),
  `error x${byEvent("error").length}`,
);

check(
  "an unreadable line is reported and does not end the session",
  errors.length === 1 && taps.length === 2,
  `${errors.length} error(s): ${JSON.stringify(errors)}`,
);

check(
  "no line is counted twice",
  new Set(taps.map((t) => t.uid)).size === taps.length,
  `${new Set(taps.map((t) => t.uid)).size} distinct of ${taps.length}`,
);

// ------------------------------------------------------------- real hardware replay

// The synthetic transcript above pins the contract. This one pins the behaviour that
// actually broke: a card held on the reader for 25s produced three taps before the
// lift-based re-arm, and only one after. Captured from the bench, library debug
// chatter and all, so it also proves unrelated non-JSON lines are survivable.
const REAL = "card reader/transcripts/tap-debounce-fixed-2026-09-30.txt";

try {
  const captured = readFileSync(REAL, "utf8");

  const replayed: ScanEvent[] = [];
  const replayErrors: string[] = [];
  const realPort = {
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(captured));
        controller.close();
      },
    }),
  } as unknown as SerialPort;

  await new Promise<void>((resolve) => {
    readScans(
      realPort,
      (event) => replayed.push(event),
      (err) => replayErrors.push(err.message),
    );
    setTimeout(resolve, 250);
  });

  const realTaps = replayed.filter((event) => isTapCardId(event.uid));
  const realHeld = replayed.filter((event) => event.event === "held");

  check(
    "a card held on the reader for 25s counts once, not once per debounce window",
    realTaps.length === 2 && realHeld.length > 20,
    `${realTaps.length} taps, ${realHeld.length} held`,
  );

  check(
    "every real tap carries a card id the web accepts",
    realTaps.every((event) => isTapCardId(event.uid)),
    `[${realTaps.map((event) => event.uid).join(", ")}]`,
  );

  // 36 of the 73 lines in that capture are the Seeed library's own debug output. If
  // those surfaced as warnings the kiosk panel would fill with noise on every tag.
  check(
    "the library's debug chatter is dropped silently, not warned about",
    replayErrors.length === 0,
    `${replayErrors.length} warning(s): ${JSON.stringify(replayErrors.slice(0, 2))}`,
  );

  check(
    "the real capture yields only the events it documents",
    replayed.length ===
      realTaps.length + realHeld.length +
        replayed.filter((e) => e.event === "ready").length +
        replayed.filter((e) => e.event === "error").length,
    `${replayed.length} events: ${realTaps.length} tap, ${realHeld.length} held, ` +
      `${replayed.filter((e) => e.event === "ready").length} ready, ` +
      `${replayed.filter((e) => e.event === "error").length} error`,
  );
} catch {
  console.error(`FAIL  real transcript is readable  ${REAL} not found`);
  failures.push(`real transcript ${REAL} not found`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} reader protocol check(s) failed.`);
  process.exit(1);
}
console.log("\nAll reader protocol checks passed: the sketch and the web agree.");
