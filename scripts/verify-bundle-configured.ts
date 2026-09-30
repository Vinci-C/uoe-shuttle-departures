/**
 * Fails if the built bundle has no Supabase connection baked into it.
 *
 * Vite inlines `import.meta.env` at build time, so VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY must be present when `vite build` runs. They used to live
 * only in the gitignored `.env.local`, which means every CI build produced a board
 * with no connection at all: the page rendered, the timetable worked, and there were
 * no live tap counts and no requests to Supabase. Nothing failed. The deploy was green
 * and the board was silently inert.
 *
 * This exists because lint, the identity guard and tsc all passed on that build. None
 * of them look at the output. This does.
 *
 * Run with: npm run verify:bundle
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const failures: string[] = [];

function check(label: string, pass: boolean, detail: string): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!pass) failures.push(label);
}

let assets: string[];
try {
  assets = readdirSync(join(DIST, "assets"));
} catch {
  console.error(`FAIL  dist/assets exists  ${DIST} not found - run \`npm run build\` first`);
  process.exit(1);
}

const scripts = assets.filter((f) => f.endsWith(".js"));
const bundle = scripts
  .map((f) => readFileSync(join(DIST, "assets", f), "utf8"))
  .join("\n");

if (scripts.length === 0) {
  console.error("FAIL  dist/assets contains JavaScript  found none");
  process.exit(1);
}

// The project ref is the thing that must survive the build. Read from .env so this
// check tracks the real config rather than a hardcoded copy that could drift.
let expectedUrl = "";
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^VITE_SUPABASE_URL=(.+)$/.exec(line.trim());
    if (m) expectedUrl = m[1].trim();
  }
} catch {
  // handled below by the empty-expectedUrl case
}

check(
  "VITE_SUPABASE_URL is set in .env",
  expectedUrl.length > 0,
  expectedUrl || ".env missing or has no VITE_SUPABASE_URL",
);

check(
  "Supabase project URL is in the bundle",
  expectedUrl.length > 0 && bundle.includes(expectedUrl),
  expectedUrl.length > 0 ? expectedUrl : "skipped: no expected URL",
);

check(
  "publishable key is in the bundle",
  /sb_publishable_[A-Za-z0-9_-]{10,}/.test(bundle),
  "sb_publishable_…",
);

// The ingest token must never be inlined. A bare VITE_* token would be published to
// the world, which is the single worst thing that could happen to this deployment.
check(
  "no ingest token is inlined in the bundle",
  !/x-boarding-token[^A-Za-z0-9]{0,8}[A-Za-z0-9]{24,}/.test(bundle),
  "no x-boarding-token literal with a value",
);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  console.error(
    "\nA build with no connection ships a board that renders but never reads Supabase.\n" +
      "Check that .env is committed and that CI does not need a secret for the public key.",
  );
  process.exit(1);
}

console.log(`\nBundle is configured. ${scripts.length} script(s) checked.`);
