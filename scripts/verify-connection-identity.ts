/**
 * Guards the invariant behind the request loop: a Connection handed to an effect's
 * dependency array must be referentially stable.
 *
 * `eslint-plugin-react-hooks` cannot catch a violation of this. It reports missing and
 * surplus dependencies, not dependencies whose identity changes every render — and an
 * effect that depends on a fresh object re-runs on every render, which for `useBoardings`
 * meant one query and one Realtime resubscribe per render.
 *
 * Run with: npm run verify:identity
 */
import { allConnections, envConnection, resolveFromPool, saveConnection } from "../src/config";

// Node has no localStorage, and every accessor in config.ts reaches for it. config.ts
// only touches it inside function bodies, so assigning a stub here is enough -- the
// static import above has already been evaluated by the time this runs.
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
};

const failures: string[] = [];

function check(label: string, pass: boolean, detail: string): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!pass) failures.push(label);
}

// Seed one saved connection so the pool path below is exercised against real data
// rather than an empty array.
saveConnection({
  id: "verify-fixture",
  label: "Verify fixture",
  url: "https://pool.invalid",
  anonKey: "pool-only-not-a-real-key",
});

// The board calls envConnection() straight from the render body, so this is the
// reference that matters most: it must not change between renders.
const envA = envConnection();
const envB = envConnection();

// Checked separately, and first. If this ever fails the comparison below would
// still "pass" on `null === null`, which is a green check that tests nothing.
check(
  "envConnection() is configured",
  envA !== null,
  envA === null ? "returned null -- the rest of this check would pass vacuously" : `label=${envA.label}`,
);

check(
  "envConnection() is stable",
  envA !== null && envA === envB,
  envA === null ? "skipped: not configured" : `${envA === envB ? "same object across calls" : "NEW OBJECT EACH CALL"}`,
);

// The kiosk path goes through the pool. A memoised caller holds one pool reference
// across renders, so resolving from it must also be stable.
const pool = allConnections();
const id = pool[0]?.id ?? null;
const pooledA = resolveFromPool(pool, id);
const pooledB = resolveFromPool(pool, id);
check(
  "resolveFromPool() is stable for a fixed pool",
  pooledA !== null && pooledA === pooledB,
  `pool size ${pool.length}, id=${id}`,
);

// The trap the board fell into: reloading the pool per call is what makes the
// resolved object unstable. If this ever starts passing, the cache is being bypassed.
const freshA = resolveFromPool(allConnections(), id);
const freshB = resolveFromPool(allConnections(), id);
if (freshA && freshB && freshA === freshB) {
  console.log(
    "      note: fresh-pool resolution is also stable, which happens when the resolved\n" +
      "      entry is a pool element rather than an envConnection() literal. The memo in\n" +
      "      useBoothConfig is still required, since allConnections() re-parses localStorage.",
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("\nAll connection identity checks passed.");
