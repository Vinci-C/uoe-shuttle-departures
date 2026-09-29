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
import { allConnections, envConnection, resolveFromPool } from "../src/config";

const failures: string[] = [];

function check(label: string, pass: boolean, detail: string): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!pass) failures.push(label);
}

// The board calls envConnection() straight from the render body, so this is the
// reference that matters most: it must not change between renders.
const envA = envConnection();
const envB = envConnection();
check(
  "envConnection() is stable",
  envA === envB,
  envA === null ? "(no connection configured)" : `label=${envA.label}`,
);

// The kiosk path goes through the pool. A memoised caller holds one pool reference
// across renders, so resolving from it must also be stable.
const pool = allConnections();
const id = pool[0]?.id ?? null;
const pooledA = resolveFromPool(pool, id);
const pooledB = resolveFromPool(pool, id);
check(
  "resolveFromPool() is stable for a fixed pool",
  pooledA === pooledB,
  `pool size ${pool.length}`,
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
