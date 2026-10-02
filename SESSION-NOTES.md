# Session notes — catch-up document

Written 30 Sep 2026. Covers the security work and the request-loop investigation.
Everything described here is committed in `7d2a2ed first commit` on `main`, working
tree clean, pushed to `https://github.com/Vinci-C/uoe-shuttle-departures`.

Later sessions append below, newest last: see **Hardware bring-up, 30 Sep 2026** for
the card reader, the shuttle-only attribution fix, and two new CI guards.

---

## Where things stand

The demo runs, reads from Supabase, and the board shows live tap counts. The kiosk can
record taps. The significant work this session was **not** the feature set — it was
tracking down a runaway render/fetch loop that was generating ~86k requests/day, and
hardening the kiosk's ingest-token setup.

Two things are **not yet verified** and need a human with a browser:

1. That the request loop is actually gone (needs a real render cycle).
2. That a real card tap writes a row (needs the Arduino flashed).

Nothing is broken. Both are confirmations of work believed to be correct.

---

## Environment and setup facts

| | |
| --- | --- |
| Supabase project | `https://<project-ref>.supabase.co` — the real ref is in gitignored `.env.local` and is deliberately not written here, since this file is published to a public repo |
| Dataset in use | `expo-demo` |
| `.env.local` | project URL + anon key. **Gitignored**, not in the repo. `.env.example` is committed. |
| Ingest token | the user's own, set via the SQL editor. The `CHANGE_ME` placeholder is **not** the live token (verified: `boarding_token_is_valid('CHANGE_ME')` → `false`) |
| Region | `eu-west-2` |
| Boardings rows | 31, all `expo-demo`, all within 24h at time of writing |
| Realtime | `boardings` **is** in the `supabase_realtime` publication (verified) |
| Deployment | GitHub Pages, base path `/uoe-shuttle-departures/`. **Was never actually live — see "The deployment never happened".** |

### Commands

```bash
npm run dev              # vite dev server
npm run build            # tsc -b && vite build
npm run lint             # eslint
npm run verify:identity  # asserts connection object stability (see below)
npm run deploy           # gh-pages
```

All of `tsc --noEmit`, `lint`, `build`, and `verify:identity` were green at the end of
the session.

---

## The deployment never happened

Worth knowing before trusting any statement about "the live site", because two of the
notes in this file were written on a false assumption.

The single CI run for `7d2a2ed` **failed**. The build succeeded and uploaded the artifact,
then the deploy step returned 404:

```
HttpError: Not Found
  Error: Failed to create deployment (status: 404) with build version 7d2a2ed...
  Ensure GitHub Pages has been enabled
```

The cause was mundane: **Pages had never been enabled for the repo.** Confirmed on
30 Sep 2026:

| | |
| --- | --- |
| `has_pages` | `false` |
| `visibility` | `private` |
| Branches | `main` only — no `gh-pages` branch |
| `https://vinci-c.github.io/uoe-shuttle-departures/` | `404` |

So **every test in this file's history was run against `npm run dev`, not a deployed
site.** Two consequences:

- The `limit=1000` network log (which looked like a stale deploy) was the dev server
  serving code that had already been changed to `limit=200`. It just had not been
  restarted. Same root cause as the loop — a stale artifact — different mechanism.
- The security framing in "Decision: keep the token" was written as though the kiosk was
  already public. It was not. The token reasoning holds, but the urgency was misplaced;
  the exposure begins when Pages is enabled on a public repo, not before.

Fixed on 30 Sep 2026: repo made public, Pages enabled with `build_type=workflow`, gates
added to the build, and the four stale actions bumped (`checkout@v4→v7`,
`setup-node@v4→v7`, `upload-pages-artifact@v3→v5`, `deploy-pages@v4→v5` — the last of
which also clears a Node 20 deprecation warning the failed run emitted).

**Repo permanence is an open decision.** Going public means the publishable key and
project URL are visible in the shipped JS, and `anon` can read the whole `boardings`
table. The ingest token is the only thing preventing forged taps, and it is the only
control that matters if the repo stays public indefinitely. Flipping back to private
later costs nothing (the token lives in the booth's `localStorage`, never the repo), but
on the free plan private repos cannot serve Pages, so that ends the public board.

---

## The first successful deploy shipped a dead board

Publishing it caught a bug that three separate gates had all passed.

The first deploy **succeeded** — green CI, live URL, HTTP 200 on both pages. It was also
useless. Vite inlines `import.meta.env` at build time, and `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` existed only in the gitignored `.env.local`. So on the runner
both were `undefined`, and the deployed bundle contained no Supabase connection at all:

- the page rendered and the timetable worked
- there were no live tap counts
- there were no requests to Supabase whatsoever

Nothing failed. `tsc`, `eslint`, and `verify:identity` all passed, because none of them
look at build *output*. The green pipeline was actively misleading.

This is the second time in this project that a **stale or wrong artifact** caused the
real problem, and the pattern is worth naming: the first was the request loop, where a
dev server was serving code that had already changed. Here it was a CI build with no
config. In both cases the code on disk was correct and the thing being *served* was not.
Only looking at the served bytes — or at the network tab — would have caught either.

**The fix.** `.env` is now committed and holds the project URL, publishable key, and
dataset. That is safe, and it is the intended mechanism: the publishable key is public by
design (it replaces the old `anon` JWT, which was equally public and equally RLS-scoped)
and ships in the bundle regardless. The ingest token remains the one value that is never
in a file, because leaking it lets anyone forge taps.

**The gate.** `npm run verify:bundle` asserts the built output actually contains the
project URL and publishable key, and that no `x-boarding-token` literal is inlined. It
runs in CI after `npm run build`. Tested by stripping the URL out of `dist` and confirming
exit 1.

The lesson for the remaining todos: a passing check only means something if it asserts the
property you actually care about. Three of them asserted the code was well-formed, and the
thing that was broken was whether the output was configured.

---

## What is and is not public

Audited 30 Sep 2026, across all 48 tracked files and the single commit.

| Check | Result |
| --- | --- |
| `.env.local` | ignored via `*.local`, never tracked |
| History | 1 commit, 48 blobs, 48 files — HEAD is the entire history, no orphaned objects |
| `sb_publishable_` / `sb_secret_` | none |
| `eyJ` JWTs, `service_role`, private key blocks | none |
| Long hex (≥48 chars: a `rand -hex 32` token or a sha256) | none |
| `password=` / `secret=` / `api_key=` | none |
| Real project ref | only in gitignored `.env.local` — kept out of this file too, since it is published |
| Vendored `Seeed_Arduino_NFC-master.zip` | public Seeed library, upstream `3a55a63` |

A first pass at this audit grepped for `eyJ`-style JWTs and reported clean. That check was
**wrong** — the key in use is the newer `sb_publishable_` format, which an `eyJ` pattern
cannot match. The conclusion was right by luck. Scan for the formats actually in use.

**The ingest token never touches the filesystem.** It exists only in the booth laptop's
`localStorage`, and `dist/` was confirmed to contain no token literal.

### `card_id` is a pseudonym, not an identity

`anon` has `SELECT` on all of `boardings`, so **once Pages is public, anyone can read
every tap through the REST API.** The firmware runs FNV-1a-32 over the UID on the Arduino
and the raw UID never leaves the board, so `card_id` is an 8-hex digest rather than the
card. That matches what `schema.sql` claims, but the firmware's own comment is the honest
version: *"a one-way digest with no salt, so it is not a real identity."*

A 32-bit unsalted hash is brute-forceable by anyone who knows the UID format, so this is
pseudonymisation. Fine for an expo with throwaway cards; not acceptable for real
passenger cards.

There is no live exposure regardless: the Arduino has never been flashed, so no real card
can have been tapped. Every existing row came from **Simulate tap**, which generates a
random id via `randomCardId()`.

---

## The main event: a render/fetch loop

### What actually happened

`App.tsx` called `envConnection()` **directly in the render body**:

```ts
const connection = envConnection();   // returned a new object literal, every render
const boardings = useBoardings(connection, dataset);
```

`envConnection()` built a fresh `{ id, label, url, anonKey }` object on every call. That
new identity landed in `useBoardings`' effect dependency array, so the effect tore itself
down and re-ran on every render. The effect fetched, the fetch set state, the state
re-rendered, and the loop fed itself:

```
render → new connection object → effect deps changed → effect re-runs
       → load() → setRowsState / setErrorState (fresh objects)
       → re-render → new connection object → ...
```

The loop ran as fast as the network allowed, not once per second.

**How it was spotted:** the DevTools network log showed ~37 requests inside a single
clock second, with `tapped_at=gte` values stepping backwards in ~10ms increments
(`.918 .893 .885 .877 …`). A 20s poll would show requests 20s apart across different
clock seconds; 1/sec would show one per second. Dozens inside one second is a loop.

### The fix

`src/config.ts:31-50` — `envConnection()` now caches at module scope:

```ts
let envConnectionCache: Connection | null | undefined;

export function envConnection(): Connection | null {
  if (envConnectionCache !== undefined) return envConnectionCache;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  envConnectionCache =
    url && anonKey ? { id: "env", label: "Default (from .env)", url, anonKey } : null;
  return envConnectionCache;
}
```

`undefined` is the "not computed yet" sentinel, so a legitimately unconfigured project
(returning `null`) is not recomputed on every call. Caching is correct for the page
lifetime because `import.meta.env` is baked in at build time.

`App.tsx` was left unchanged — it now gets a stable reference from a cheap lookup.

### Two errors made along the way — worth knowing about

**1. Misdiagnosed as a 1-request-per-second poll.** I removed a 20s polling timer,
replaced it with Realtime plus fetch-on-boundary, and only afterwards realised the timer
was never firing at all: the effect was being destroyed and recreated faster than the
interval could ever tick. The `Feed: Polling every 20s` label I had called "the honest
tell" was describing a fallback that was never carrying anything. The removal was not
harmful (Realtime-only reads are cheaper and the reconnect catch-up is a genuine
improvement), but the reasoning behind it was wrong.

**2. Fixed the kiosk path, not the board.** The memo went into `useBoothConfig`, which
the kiosk uses. The board calls `envConnection()` directly and never touches that hook, so
the board kept looping. The evidence was already in hand — the identity check printed
`envConnection() identity: e === f -> false`, which I called "the specific culprit" — and
I still didn't follow it to the call site. The user's DevTools log is what exposed it.

Both are the same lesson: the first bug was invisible to inspection because the code
looked correct, and the second survived because the fix was aimed at a file rather than
at the mechanism.

### The invariant, and the guard

A `Connection` in an effect dependency array must be referentially stable.

**`eslint-plugin-react-hooks` cannot catch this.** The exhaustive-deps rule reports
missing and surplus dependencies, not dependencies whose identity changes every render.
The code lints clean while the effect re-runs continuously.

`npm run verify:identity` (`scripts/verify-connection-identity.ts`) asserts it. The guard
was tested against the old implementation and **exits 1 on regression, 0 when fixed** — a
guard that can't fail isn't one. It needs `vite-node` because `config.ts` reads
`import.meta.env`, which plain Node/tsx can't resolve; that was added as a devDependency.

The guard will not catch a *new* unstable source. The rule still has to be kept in mind.

---

## Usage and quota findings

Checked against supabase.com/pricing and the billing docs on 30 Sep 2026.

### Free tier limits

| Item | Free limit |
| --- | --- |
| API requests | **unlimited** |
| Egress (uncached) | 5 GB/month |
| Egress (cached) | 5 GB/month |
| Log ingestion | 1 GB/month |
| Realtime messages | 2 million/month |
| Realtime peak connections | 200 |
| Database size | 500 MB/project |
| Idle pause | 7 days without database activity, ~30s to wake |

Projects are **paused after 7 days of inactivity** (no database activity). On reaching a
quota, free orgs get an email, then a grace period, then the project can be restricted to
read-only with API requests returning 402. There is no second grace period.

### Measured

| | |
| --- | --- |
| One real board request | body 6,723 B + headers 1,076 B = **7,799 B** |
| Rows per row | ~217 B (31 rows) |
| Reported API requests at time of investigation | 381,375 |
| Org usage reported | egress **0.62 GB / 5 GB** (12%) |
| | log ingestion **1.07 GB / 1 GB** — over by 0.07 GB |

**The request count was never the problem** — free API requests are unlimited. An early
estimate of ~2.97 GB egress (381,375 × 7,799 B) was wrong by ~5× because it extrapolated
from today's 31-row snapshot; earlier in the period responses were much smaller. The real
cost was **log ingestion**, which is over its 1 GB quota.

Nobody can say with confidence which queries drove the log volume — Realtime churn,
connection churn, and Supabase's own internals are all in the mix. Reducing request volume
is the only lever available, and it pushes both numbers down.

### Where the usage page is

**Organisation level, not project level.** Sidebar: Projects, Team, Integrations, **Usage**,
Billing, Organization settings. Direct: `https://supabase.com/dashboard/org/_/usage`.
Shows all projects by default, with a project dropdown and time selector. Numbers are
aggregated, not real-time. The quota is org-wide across all projects.

Project → **Observability** is a different tool (logs, metrics, query history) and looks
empty here because no logging is configured.

### The OPTIONS pairs in the network log are expected

Every GET is paired with an OPTIONS preflight because `Authorization: Bearer <anonKey>` is
not CORS-safelisted. The preflight cache never helps because the URL's `tapped_at=gte`
value changes per call, so no fetch can reuse a previous preflight. `supabase.ts` already
omits `x-boarding-token` when there's no token. At one fetch per page load this is
immaterial, so it was left alone.

### The RLS insert gate is proven (30 Sep 2026)

Verified from outside the app, using the public publishable key — the same credentials the
browser has, with no ingest token:

| | |
| --- | --- |
| `GET boardings` (as the board does) | `200`, row returned |
| `POST boardings` with no token | rejected, `42501` — *"new row violates row-level security policy"* |
| Probe row created? | **no** — `dataset=rls-probe` has 0 rows, total unchanged at 33 |

Note the status is **401, not 403**. PostgreSQL `42501` is `insufficient_privilege` and
Supabase's gateway maps it to 401. Expecting 403 and treating 401 as anomalous is a wrong
heuristic; the real test is whether the row exists, and it does not. This also confirms
the live policy matches `schema.sql:113-120` — something re-running the file would not
have told you.

The count being 33 rather than the 31 recorded earlier is the user's Simulate tap, which
independently corroborates that a token-bearing write succeeded.

---

## Security work: the ingest token

### Decision: keep the token

The kiosk page is deployed on GitHub Pages from a **public** repo, so its JS bundle — and
the project URL and publishable key in it — are readable by anyone. Without a token, anyone
who opens `kiosk.html` can click **Simulate tap** in a loop and inject unlimited rows. It
also undermines the demo's premise: if the count is forgeable, "would this estimate look
believable?" is unfalsifiable.

This section was first written on 30 Sep 2026 as though the site were *already* public. It
was not — Pages had never been enabled, and the repo was private. The reasoning still
holds, but the exposure starts when the repo goes public, not at the time of writing. See
"The deployment never happened".

Rules that follow from this:
- The token is **never** a `VITE_*` env var — those are compiled into the public bundle.
- `service_role` is never used client-side.
- The token lives in the kiosk browser's `localStorage` via the Connection panel.
- **Export connections copies ingest tokens in plaintext.** That is how a second booth
  laptop gets provisioned, and the token is write-capable, so the exported JSON is a
  secret. A warning now appears next to the button and in the export message.

### The token value

Not something to be written in a chat or a ticket — anything in a transcript is public
knowledge. Generate it with `openssl rand -hex 32` and put the same string in two places:
`seed_token` in `supabase/schema.sql` and the Ingest token field in the kiosk panel.

**Caveat:** the seed is wrapped in `where not exists (select 1 from public.ingest_tokens)`.
If a row already exists, editing `seed_token` and re-running the file changes nothing —
it silently keeps the old token. To rotate, use the SQL editor directly:

```sql
select label, left(token_hash, 16) as hash_prefix from public.ingest_tokens;

update public.ingest_tokens
set token_hash = encode(digest('PASTE_NEW_TOKEN_HERE', 'sha256'), 'hex');

select public.boarding_token_is_valid('PASTE_NEW_TOKEN_HERE') as should_be_true;
```

The bare `UPDATE` rewrites every row, which is right for a single-booth demo. If the first
`select` shows more than one row, narrow it with `where label = '...'`.

### Schema guard against a known token

`supabase/schema.sql:37-52` previously seeded the literal `CHANGE_ME` as the token. On a
fresh project that would have created a real, working write token that anyone reading the
file already knows — and with the page public, nothing else guards it. The seed is now a
`DO` block that raises instead. Note the file is one transaction, so that exception aborts
the entire run (intended, and the error message names the fix).

---

## Changes made this session

### `src/lib/boardings.ts`

- `verifyIngestToken(connection)` → four-way `TokenCheck`: `ok` / `rejected` /
  `unreachable` / `no-token`, each with `saveable` and an operator-facing message.
  Reuses `REJECTED_HINT` and `NO_INGEST_TOKEN_HINT`.
  - **The four outcomes are kept distinct deliberately.** A paused project or wifi drop is
    not evidence a token is wrong; mapping those to `rejected` would let a network blip
    block saving a perfectly good connection.
- `MAX_ROWS` split into `MAX_FETCH_ROWS = 200` (transfer bound) and
  `MAX_BUFFERED_ROWS = 1000` (memory bound, appended to by Realtime).
- `fetchBoardings` limits to `MAX_FETCH_ROWS`.

### `src/components/ReaderPanel.tsx`

- `saveForm` is async with a "Checking…" state. `rejected` blocks the save, focuses and
  selects the token field, and offers **save anyway**. Every other outcome saves.
- Import validates the connections it actually created and reports how many tokens were
  accepted.
- Token-less connections get a `(read only)` suffix and a "reads only" note under the
  Database field; **Simulate tap** gets a title explaining why it will be rejected.
- Export carries an explicit warning that it contains write-capable tokens.
- `.link` button class for the inline "save anyway" escape.

### `src/config.ts`

- `resolveFromPool(pool, id)` extracted as a pure function; `resolveConnection` removed
  (no remaining callers). This is what `useBoothConfig` memoises.
- `importConnectionsJson` returns `Connection[]` instead of a count, so callers can verify
  what landed. `saveConnection` returns the record.
- `envConnection()` module-scope cache — **the actual loop fix**.

### `src/hooks/useBoothConfig.ts`

- `activeConnection` memoised on `[connections, activeConnectionId]`. Still required:
  `allConnections()` re-parses `localStorage` on each call.

### `src/hooks/useBoardings.ts`

- **The 20s poll timer is gone.** Fetches now happen on: initial load, tab-becoming-visible,
  and Realtime reconnect.
- Reconnect catch-up uses a `wasSubscribed` flag so the first `SUBSCRIBED` doesn't fetch
  twice. **This matters:** `postgres_changes` does not replay inserts that happened while
  the socket was down, so a reconnect must re-read or those taps are lost permanently. The
  old poll was silently covering that.
- `RECOUNT_MS = 60_000` local-only timer calling just `setNowMs` — keeps "taps in the last
  hour" decaying without any request. Without it the figure freezes at its last value.
- `load` sets `nowMs` at the start, otherwise the board reads **0** for the first minute
  after every page load (`lastHourCount` returns 0 while `nowMs` is 0).
- Status `"polling"` → `"reconnecting"` across the union and all call sites.

### `supabase/schema.sql`

- `alter table public.ingest_tokens enable row level security;` (added)
- `search_path = public, extensions` on the token function — fixed
  `digest(text, unknown) does not exist`
- `DO` block replacing the `CHANGE_ME` seed

### Other

- `scripts/verify-connection-identity.ts` + `vite-node` devDependency +
  `npm run verify:identity`
- README: token validation on save, read-only marker, export-is-a-secret warning,
  Realtime-only reads, keep-alive correction, and the referential-stability invariant

---

## Work from the earlier session

- **NFC protocol mismatch** — `nfcReader.ts` accepts real `uid`/`event` messages;
  `useReader` counts only `event.uid`; firmware no longer emits no-tag errors every 400ms.
  Not bench-tested.
- **Outbox** — drains by filtering the complement; verified offline retention, successful
  delivery, zero duplicate retry, preservation of other connection queues.
- **Attribution** — timestamp-only, first departure at-or-after. Verified 16:24 → 16:25,
  rollover, late taps. The **24h lookback** was chosen so taps flushed after an outage
  still count.
- **Permanent write errors** — `recorded | queued | rejected`; RLS/auth failures are not
  queued. 11/11 classifier cases verified.
- **Outbox UX** — retry/discard, honest flush reporting, amber/green/red status.

---

## Verification status

**Verified this session:**

- `tsc --noEmit`, `npm run lint`, `npm run build` all clean
- `verify:identity` exits 0 with the fix, and **1 when the cache is removed** (proven by
  temporarily reverting `config.ts`)
- `verifyIngestToken` — 4/4 branches against the live project: `no-token`, `unreachable`
  (missing anon key), `rejected` (wrong token), `unreachable` (bad project URL)
- `boarding_token_is_valid` reachable as a PostgREST RPC by `anon`
- `boardings` present in `supabase_realtime`
- Payload measured at 7,799 B per request, 217 B/row
- Bundle: largest chunk 515.5 kB minified (162.7 kB gzipped); `modelWeights.json`
  accounts for ~56 kB of it, the rest is React and app code
- Schema guard raises (verified by inspection, not executed against a live project)

**Not verified — needs a human:**

- **The loop is gone.** Reload the board, expect exactly one GET plus one OPTIONS, and a
  request count that stays put. If it still climbs, the cause is something else and the
  new log is needed.
- A real card tap writes a row.

**Resolved since the last session:**

- Simulate tap wrote a row, which proves the token path works end to end. The insert
  policy (`schema.sql:113-120`) rejects anything without a valid `x-boarding-token`, so a
  tokenless write cannot succeed — the write must have carried a token. The "Token
  accepted" label itself is still unconfirmed as a UI observation.

---

## "Why does every bus say 'Plenty of seats available'?" (30 Sep 2026)

### The prediction file was never the problem

Checked first, because it was the obvious suspect. `src/data/modelWeights.json` is
68,962 bytes, tracked since the first commit, and **byte-identical** to the copy in the
sibling project `/Users/vincic/Documents/code/ai expo` — both SHA-256 `e014f5f5…`.
`src/lib/runModel.ts` is byte-identical too (`55dccd28…`). All ten tensors match their
declared shapes, and the network produces a healthy spread when fed sane inputs. So
nothing was corrupt, missing, or mismatched.

### The cause: a second hardcoded academic date that had expired

`src/hooks/useCapacityParams.ts` computed the "week of semester" from a single
hardcoded start:

```ts
// Semester 2 2026 starts 12 January 2026.
const SEMESTER_START = new Date("2026-01-12T00:00:00Z");
```

One semester. No Semester 1, no 2026/27. It stopped being right on 2026-05-22 — the same
day `SHUTTLE_OPERATING_PERIODS` stopped being right, fixed earlier the same day.

Nothing guarded it, so it kept counting. By 30 Sep 2026, 261 days later,
`calculateSemesterWeek` returned **35**, and `DepartureBoard.tsx` fed
`Math.max(1, 35) = 35` to the model as `weekOfSemester`. The model was only ever trained
on weeks 1–11. The week feature has a large effect — at 09:33 the prediction decays
`w1=78 → w12=61` and keeps sliding — so 35 extrapolated off a cliff and pushed every
output below the `<= 40` threshold in `ridershipToBusyness`:

| week fed | mean prediction | L1 Plenty | L2 Limited | L3 Standing | L4 Full |
| --- | --- | --- | --- | --- | --- |
| **35 (shipped)** | 14.4 | **52** | 2 | 0 | 0 |
| 2 (correct for 30 Sep) | 31.7 | 34 | 14 | 5 | 1 |

52 of 54 services reading "Plenty of seats" is exactly the reported symptom. **No
request failed, nothing was logged, and no test covered it.**

**This was not a regression from the shuttle fix.** The shuttle was hidden until that
fix, so these predictions had never been on screen. The fix exposed a latent bug.

### The fix

`ai expo` already had the right shape, so the calendar came from there: a
`{start, end, week}` table plus `getTeachingWeek(date)`, in `src/data/timetable.ts`.
All eight entries were checked against <https://semester-dates.ed.ac.uk/202627> and are
accurate. Two deliberate deviations:

- **London time, not local time.** The reference uses its own `toLocalDateString`
  (local). This project deliberately moved to London, so `getTeachingWeek` uses the
  existing `londonDateKey` and does its day arithmetic on London days. Copying the
  reference verbatim would have reinstated the exact UTC/local bug fixed earlier today.
- **`-1` out of term, not `0`.** Downstream, `weekOfSemester` is `Math.max(1, week)` and
  `revisionOrFlexibleWeek` is `week === -1`, so `0` would silently become a confident
  week-1 prediction for a day that never happened. `-1` means the board reads "plenty of
  seats" out of term, which is the honest answer — nobody is on campus.

`useCapacityParams` now calls `getTeachingWeek`, and its `dayOfWeek` moved from
`now.getDay()` (local) to `londonDayOfWeek(now)` — the same class of bug, and the last
one in that file.

### Verification

`getTeachingWeek` checked across 16 boundary dates plus a day-by-day sweep of the whole
of 2026/27. Teaching weeks come out as **1–11 for Semester 1 and 12–22 for Semester 2**,
matching the documented structure, with `-1` for welcome week, the 6–8 Dec and 26 Apr
examinations, Flexible Learning Week, spring teaching vacation, winter and summer
vacation. The 00:30-London case passes.

The board was then rendered to static HTML to confirm the actual user-visible fix, since
a correct `semesterWeek` alone does not prove the labels changed:

| when | semesterWeek | L1 | L2 | L3 | L4 |
| --- | --- | --- | --- | --- | --- |
| Wed 30 Sep, 10:00 London (today) | 2 | 28 | 10 | 3 | 5 |
| Wed 30 Sep, 08:00 London | 2 | 32 | 12 | 3 | 6 |
| Wed 14 Oct | 4 | 33 | 9 | 4 | 5 |
| Wed 19 Aug (out of term) | -1 | — | — | — | — (shuttle hidden) |

> Two of my own test expectations were wrong while writing these, and the code was
> right both times. First I asserted 22 May 2027 (Semester 2's official end date) should
> be an operating day — it is a **Saturday**. Then I asserted 4 Dec 2026 was week 10 and
> 2 Apr 2027 was week 21; they are weeks **11** and **22**, which is what makes Semester
> 1 span 1–11 and Semester 2 span 12–22. Both caught by re-deriving the arithmetic.

### Still true afterwards

- **Out of term the board also reads mostly "Plenty of seats"** — the revision regime
  averages 15.1, giving 51/3/0/0. That is correct, not a symptom: no teaching, no
  riders. It only shows when the shuttle is hidden anyway.
- **The 18:55 Kings departure is not one of the model's 54 known times**, so it
  activates no time feature and gets a generic prediction. `runModel.ts` is identical in
  both projects, so this predates today and is not a regression. 53 of 54 timetable
  times match; this is the only mismatch.
- `ACADEMIC_CALENDAR_2026_27` **only covers 2026/27.** Like `SHUTTLE_OPERATING_PERIODS`
  it is hardcoded, and it will fail the same silent way in 2027/28. There is a `TODO` in
  the source. If the ranges are ever left with a gap inside a term, `getTeachingWeek`
  falls through to `-1` and the board under-predicts for that stretch.

---

## "Why is only the 9 showing?" (30 Sep 2026)

The board was serving the 9 and a "shuttle not in operation" notice instead of shuttle
departures, on a Wednesday, in term. Four separate things were in the console; only the
first was the reported bug.

### 1. The shuttle: a stale hardcoded term-date list

`isShuttleOperating()` (`src/data/timetable.ts`) compares the date against
`SHUTTLE_OPERATING_PERIODS`. The last entry ended **2026-05-22**, so from the start of
the 2026/27 autumn term the check returned `false`, `DepartureBoard.tsx` skipped the
shuttle entirely and rendered the notice. **Nothing anywhere reported an error** — no
failed request, no console warning, no lint rule. The board just quietly rendered less.

Added, from <https://semester-dates.ed.ac.uk/202627> (Semester 1 = 21 Sep – 21 Dec 2026,
Semester 2 = 11 Jan – 22 May 2027):

```ts
{ start: "2026-09-21", end: "2026-12-21" },
{ start: "2027-01-11", end: "2027-05-22" },
```

Notes on the dates, so the next person does not have to re-derive them:

- The existing 2025/26 entry starts `2025-09-08`, which is **Welcome Week**, not the
  Semester 1 start. The new entries use the official Semester 1 start instead, so the
  list is now internally inconsistent about welcome week. Left that way deliberately:
  the notice says "during semester time only", and today sits inside either choice.
- **22 May 2027 is a Saturday**, so `isShuttleOperating` correctly returns `false` on
  it. The last *weekday* of Semester 2 is Friday 21 May. This is a real gotcha when
  writing date tests — an early test asserted `true` and was wrong, not the code.
- 2027/28 is not yet published. There is a `TODO` in the source. **This will break again
  at the start of the 2027/28 autumn term** unless the list is extended.

### 2. A real bug next door: the date check mixed timezones

`isShuttleOperating` used `date.getDay()` (local) for the weekend test but
`date.toISOString().slice(0, 10)` (UTC) for the period test. Between **00:00 and 01:00
London time** (UTC+1 under BST) the UTC date is still the previous day, so on the first
day of any term the shuttle stayed hidden for that first hour, and the two halves of the
same predicate disagreed with each other.

Fixed by extracting the London helpers into **`src/lib/londonTime.ts`** and using them:

- `londonDateKey(date)` — `yyyy-MM-dd` in Europe/London
- `londonDayOfWeek(date)` — day of week in London, derived from that key so the weekday
  and the date string **cannot** disagree with each other
- `londonMinutes(iso)` — moved unchanged, plus `londonMinutesForDate(date)`

`serviceId.ts` re-exports `londonDateKey`/`londonMinutes` so the two existing callers
(`KioskView.tsx`, `attribution.ts`) are untouched. They had to move out because
`serviceId.ts` imports `timetable.ts`, so `timetable.ts` importing back from
`serviceId.ts` would have been an import cycle.

> Trap: `tsc --noEmit` passed while `tsc -b` (which the build runs) failed with
> `TS2304: Cannot find name 'londonDateKey'`. `export { x } from "./y"` does **not** put
> `x` in local scope — `serviceId.ts` uses it internally and needed a real `import` too.

### 3. corsproxy.io is dead; the live feed was removed

`fetchLiveArrivals()` fetched bustimes.org through `corsproxy.io` every 60 s for both
stops, and now returns **403** (401 with `?url=`). Every free alternative was checked
and none is usable: bustimes.org sends no `access-control-allow-origin` so a direct
browser fetch is blocked; allorigins fails DNS; codetabs 503s; cors.lol returned 200
then 429; whateverorigin 400s; corsproxy.org 301s.

The live feed only *enriched* the static 9 — it supplied `On Time` / `Delayed` and a
revised time. It never supplied the departure list. So it was decoration on a feature
that had silently stopped working, while costing **two failed requests per minute per
visitor** plus a console full of warnings. **Removed** (`LiveArrival`,
`fetchLiveArrivals`, both state hooks, the polling effect, the fuzzy-match block and
every `expectedTime`/`isLive`/`expectedArrivalTime` assignment).

Dead code deliberately left in place: the optional `isLive` / `expectedTime` /
`expectedArrivalTime` fields on `Departure` and the `.status-on-time` /
`.status-delayed` CSS are now unreachable. Reachable statuses are `Scheduled` and
`Departing` only. Harmless, and it keeps the door open if the feed ever comes back
properly — which would mean a **Supabase Edge Function** as a first-party proxy, not a
public CORS proxy.

### 4. Two things that were not ours

- `contentscript.js:14083 MaxListenersExceededWarning` and
  `ObjectMultiplex — orphaned data` / `app-init-liveness` / `background-liveness` are a
  **browser extension** (MetaMask; `ObjectMultiplex` is from `@MetaMask/stream-json`).
  Not in our bundle, not our bug.
- `api.countapi.xyz` — `ERR_NAME_NOT_RESOLVED`. The free service is gone, so the footer
  rendered a permanently blank "Visitors:". **Removed**, along with its state and CSS.

### Verification

`isShuttleOperating` checked across 13 boundary dates: term starts/ends, the day before
and after, weekends inside the range, and the 00:30-London case that the timezone bug
used to get wrong. All pass. The `.status-on-time` / `.status-delayed` classes were
confirmed unreachable before being left alone.

Rendered the component to static HTML to confirm the actual user-visible fix, since
`isShuttleOperating` returning `true` alone does not prove cards appear:

| date | operating | shuttle cards | bus 9 cards | notice |
|---|---|---|---|---|
| Wed 30 Sep 2026 (today) | true | **28** | 52 | not shown |
| Wed 14 Oct 2026 | true | 28 | 52 | not shown |
| Wed 19 Aug 2026 | false | 0 | 63 | shown |
| Sat 19 Dec 2026 | false | 0 | 69 | shown |

Bundle got ~2 kB smaller (543,435 → 541,466 bytes raw). The largest chunk is
**515,488** bytes minified / 162,666 gzipped — see the optional todo below for what is
actually in it.

---

## "Is the Lothian 9 timetable right?" (30 Sep 2026)

The two `BUS_9_*` arrays disagreed badly between this repo and `../ai expo`, so I traced
where each came from. Recording this because the answer is counter-intuitive and a
future maintainer will be tempted to "fix" it back the other way.

**What the disagreement looked like.** `BUS_9_TO_KB` had 50 entries here vs 52 in
`ai expo`; only 3 departure times were common to both. Daytime runs were 1–2 min apart
(indistinguishable on the board), but the evening pattern was materially different:

```
this repo : 19:56 20:26 20:58 21:28 21:58 22:28 22:58 23:28 23:58   (30-min headway)
ai expo   : 20:00 20:20 20:39 21:00 21:30 22:00 22:27 22:57 23:26 23:56
```

`BUS_9_FROM_KB` had 52 entries in both but 24 times differed, almost all by 1–2 min.

**Provenance.** `../ai expo` contains the official Lothian exports
`lothian 9 to kb.xlsx` and `lothian 9 from kb.xlsx` (both dated 5 Mar 2026). Parsing the
stop rows and matching them against both projects:

| array | this repo (before) | `ai expo` |
|---|---|---|
| `BUS_9_TO_KB` departures | "Old Town, at Bristo Place" row, 50/51 | 11/46 best match |
| `BUS_9_TO_KB` arrivals | "Mayfield, at Kings Buildings" row, **50/50** | 8/52 |
| `BUS_9_FROM_KB` departures | "Mayfield, at Kings Buildings" row, **52/52 exact** | 28/52 |
| `BUS_9_FROM_KB` arrivals | "South Side, at Bristo Square" row, **52/52** | 1/52 |

So the pre-existing arrays were an exact transcription of the spreadsheets, and
`ai expo`'s matched no source at all. The divergence was introduced by `ai expo` commit
`2b12db8` "updated for 26/27 term" (28 Sep 2026), which rewrote 227 route-9 lines: it
inserted a 06:58 service, nudged times ~1 min, and replaced the real 30-min evening tail
with a ~20-min one. The later commit date is what initially made `ai expo` look newer and
therefore authoritative — that inference was wrong.

**Decision: `ai expo` is the source of truth for the 9.** Asked directly, the user
confirmed what `ai expo` displays is correct. Both arrays are now copied from
`ai expo` **byte-for-byte** (verified: both blocks compare identical to
`../ai expo/src/data/timetable.ts`). Do not re-derive them from the xlsx.

**Caveat, so the mismatch is not a future "bug".** The spreadsheets predate the change by
six months, and the route's extent demonstrably shifted at some point — the Sept 2025
`r9_250907.pdf` runs *Muirhouse* to King's Buildings while the Mar 2026 xlsx only covers
*Granton* ↔ King's Buildings. A real timetable change since March is therefore entirely
plausible, and the user is closer to the live source than the repo is. If someone later
re-validates against the xlsx and it "fails", that is expected. Confirm with the user
before changing anything.

**Also fixed:** `displayTime: "1611"` (missing colon) on the old 16:11 entry rendered as
`1611` on the card. The verbatim copy removes that entry, so the bug is gone — the board
now shows `16:12` for the 16:12 departure, and all 104 route-9 entries have
`displayTime === time`.

**Verification:** both arrays byte-identical to `ai expo`; `displayTime` matches `time`
104/104; times ascending; no duplicates; arrival after departure 104/104; journey
durations 12–22 min. `lint`, `verify:identity`, `tsc -b` + `build`, `verify:bundle` all
pass. Confirmed in the built chunk that the new evening times are present and the old
`19:56 20:26 20:58 21:28 23:28 23:58` departures are gone.

---

## Todos

### In progress
- [ ] **Reload the board and confirm the loop is dead** — one GET + one OPTIONS, count
      flat. This is the single most important open item. Do it on the **deployed** URL
      rather than the dev server, so a stale bundle is ruled out entirely.
- [ ] **Confirm on the deployed board that the shuttle is back** and that the console is
      clear of corsproxy / countapi errors. The cause is fixed and verified locally, but
      the user-facing check is still outstanding.

### Next up
- [ ] Check **org → Usage** after a day to confirm request volume dropped and log
      ingestion has stopped climbing.
- [x] ~~Install Arduino IDE + the Seeed NFC library, flash `card reader/BoothReader/BoothReader.ino`
      to the UNO.~~ — **done 30 Sep 2026.** IDE 2.3.10, `arduino:avr` 1.8.8,
      Seeed_Arduino_NFC 1.1.0. The board is a genuine UNO R3 on USB `2341:0043`
      (signature `1E 95 0F`); `2341:0411` was a Realtek hub in the same tree. See
      "Hardware bring-up, 30 Sep 2026".
- [x] ~~Bench: real card tap registers, and the 10s debounce holds exactly one row.~~ —
      **done 30 Sep 2026, but the debounce turned out to be the bug rather than the
      behaviour under test.** Taps registered fine on first try. The 10s debounce counted a
      card *left resting on the reader* again every 10 seconds — one 25s hold produced 3
      rows. Replaced with a lift-based re-arm (1.5s clear); the same hold now produces 1
      row and 32 `held` events. `verify:reader` replays the real capture.
- [ ] Bench: wifi off → taps queue → wifi on → no duplicate rows.
- [x] ~~Prove the RLS gate is strict end to end~~ — **done 30 Sep 2026.** Rejected with
      `42501`, no row created. See "The RLS insert gate is proven". No browser test needed.

### Optional / follow-ups
- [ ] Memoize the `useCapacityParams` return value. It returns a fresh object literal each
      render and sits in a `useCallback` dep array at `DepartureBoard.tsx:634`, so that
      callback and the `useMemo`s behind it are invalidated every render. Same
      anti-pattern, but only costs CPU — no fetch, no loop. Deliberately left alone as
      out of scope.
- [ ] **Investigate the 515.82 kB main bundle.** (was recorded as 505 kB; re-measured
      2 Oct 2026, unchanged by the reader fix.) Vite warns about it on every build. The
      largest chunk is `useCapacityParams-<hash>.js` at 515.82 kB minified (the hash changes
      per build). It contains React/ReactDOM plus all app code, so the chunk name is
      rollup's heuristic, not a hint that `useCapacityParams` is the culprit. The inlined
      `modelWeights.json` is only **~56 kB** of it (~11%) — the other ~449 kB is React and
      application code. So dropping the weights to a lazy fetch would shave a little; the
      bulk would need actual code-splitting.
- [x] ~~Drop the `api.countapi.xyz` visitor counter in `App.tsx:68`.~~ — **done 30 Sep
      2026.** The service was dead (`ERR_NAME_NOT_RESOLVED`), so the footer showed a
      permanently blank "Visitors:". Fetch, state and markup removed.
- [x] ~~Decide what to do about the dead corsproxy.io live feed~~ — **done 30 Sep 2026.**
      Removed rather than replaced. If live arrivals are ever wanted again, do it with a
      Supabase Edge Function; every public CORS proxy is unreliable or rate-limited.
- [ ] **Add 2027/28 entries to `SHUTTLE_OPERATING_PERIODS` and
      `ACADEMIC_CALENDAR_2026_27` when the dates are published.** Both are hardcoded and
      both fail silently. The shuttle one already cost a whole term; the calendar one
      made every prediction read "Plenty of seats" without a single error. This is a
      recurring failure mode, not a one-off — see both incident sections above.
- [ ] Wire up a real test runner. `verify:identity` is CI-ready and could be the first one.
- [ ] **`npm audit`: 10 vulnerabilities (2 low, 2 moderate, 6 high), all in `vite`
      7.0.0–7.3.3** — re-verified 2 Oct 2026, count unchanged. Path traversal,
      `server.fs.deny` bypass, and arbitrary file read
      via the dev server. These are **dev-server only** — the static GitHub Pages bundle
      is unaffected — but they matter if `npm run dev` is ever reachable from another
      machine on the network. Pre-existing, not caused by adding `vite-node`. `npm audit
      fix` is available and will bump Vite, which may in turn want a `vite-node` bump;
      verify `npm run build` and `verify:identity` still pass afterwards.

---

## Gotchas to remember

- **`envConnection()` must stay cached.** It is the one thing standing between the board
  and another request loop. Lint will not catch a regression; `verify:identity` will.
- **Realtime does not replay.** Any reconnect must re-read the window.
- **`postgres_changes` needs the table in the publication.** Verified present. If the
  schema is ever re-run or the project is rebuilt, re-check it — a silently dead
  subscription is indistinguishable from a quiet dataset.
- **`attributeBoardings` discards rows not on the current London day**
  (`src/lib/attribution.ts:42`). That is what makes the 200-row fetch tail safe.
- **The env connection is read-only by design** — no ingest token, so writes are rejected
  by RLS. That is not a bug. The kiosk writes through a connection saved in its panel.
- **The whole schema file is one transaction.** A raise anywhere rolls back everything.
- **The seed is `where not exists`** — re-running with a new `seed_token` will not rotate
  an existing token. Do not re-run `schema.sql` against the live project casually: the
  `CHANGE_ME` guard will raise and abort the whole file, and it would not have rotated
  anything regardless.
- **Check that a deploy actually succeeded before believing anything about "the live
  site".** The Pages step fails *after* a green build, so the run log is the only source
  of truth: `gh run list`, then confirm the URL returns 200.
- **`npm run deploy` is a second, competing deploy path** (it pushes a `gh-pages` branch)
  and is left over from before the workflow existed. With Actions-based Pages it should
  not be used — it would fight the workflow. Unused; candidate for removal.

## File map

| Path | |
| --- | --- |
| `src/config.ts` | saved connections, dataset, stop, `envConnection()` cache, `resolveFromPool` |
| `src/App.tsx` | public board. Calls `envConnection()` in the render body (line 49) |
| `src/KioskView.tsx` | kiosk page. Uses `useBoothConfig()` |
| `src/hooks/useBoardings.ts` | reads, Realtime, reconnect catch-up, no timer |
| `src/hooks/useBoothConfig.ts` | memoised `activeConnection` |
| `src/hooks/useCapacityParams.ts` | weather + `getTeachingWeek`; the two inputs the model needs beyond bus time |
| `src/lib/boardings.ts` | writes, reads, outbox, `verifyIngestToken`, row caps |
| `src/lib/supabase.ts` | client cache, conditional `x-boarding-token` header |
| `src/lib/attribution.ts` | tap → service, day filter, rollover |
| `src/lib/londonTime.ts` | London date key / minutes / day-of-week. Extracted from `serviceId.ts` so `timetable.ts` can use them without a cycle |
| `src/data/timetable.ts` | schedules, `SHUTTLE_OPERATING_PERIODS`, `isShuttleOperating`, `ACADEMIC_CALENDAR_2026_27`, `getTeachingWeek`. The two `BUS_9_*` arrays are copied verbatim from `../ai expo` — see the route-9 section above before touching them |
| `src/lib/serviceId.ts` | per-bus service ids, service windows; re-exports the London helpers |
| `src/lib/nfcReader.ts` | Web Serial framing, JSON parsing |
| `src/components/ReaderPanel.tsx` | connection editor, token check, outbox controls |
| `supabase/schema.sql` | tables, RLS, token function, publication, seed guard |
| `scripts/verify-connection-identity.ts` | referential-stability guard |
| `card reader/BoothReader/BoothReader.ino` | Arduino firmware |

---

## Hardware bring-up, 30 Sep 2026

Picking up the card reader. Nothing about the reader needed building — the chain from
`BoothReader.ino` through Web Serial to Supabase has been wired for a while. What was
missing was validation, and one bug that only a real stream would have exposed.

### The board is a genuine Arduino UNO R3 — two things I got wrong

Corrected on 30 Sep 2026, after the board was finally flashed and verified:

- The board is `/dev/cu.usbmodem113301`, USB **`2341:0043`** — *Uno R3 (CDC ACM)* — serial
  `03536373232351306182`, device signature `1E 95 0F` (ATmega328P). It is exactly the
  board the sketch was written for.
- The toolchain **was** installed all along: Arduino IDE 2.3.10 in `/Applications`, core
  `arduino:avr` 1.8.8, and `Seeed_Arduino_NFC` 1.1.0 in the sketchbook. The earlier
  "no toolchain on this machine at all" was simply wrong.

I had recorded the USB id as `2341:0411`. That was a **Realtek USB3.2 hub** further up the
same USB tree, picked up because I matched on the wrong `idProduct` when scanning
`ioreg`. The Arduino is `0x0043`. `arduino-cli board list` reported the right answer
(`arduino:avr:uno`) while I was still working from the wrong id, which is the actual
lesson: the toolchain would have told me immediately and I did not ask it.

Check it with `ioreg -p IOUSB -l -w 0 | grep -A3 '"idProduct" = 67'`.

Flashing needs no GUI — the IDE bundles a working `arduino-cli` at
`/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli`.

### The attribution bug was much worse than estimated

Earlier in this work the misattribution was estimated at 72% of Bristo's shuttle window
and 27% of Kings Buildings'. That was measured against the *old* Lothian 9 timetable.
After `bba8d28` synced the 9 to `ai expo` — 52 departures per direction, a far denser
evening pattern — the exposure got worse, not better:

| Stop | In-window taps that landed on a 9 | Share |
| --- | --- | --- |
| Bristo Square | 899 of 1074 | **84%** |
| Kings Buildings | 680 of 1136 | **60%** |

The 9 sync, which was correct on its own terms, made this bug considerably more likely to
be seen. Worth remembering: two correct changes can multiply.

Fixed as planned. `buildServiceWindows` is now `buildShuttleWindows` and returns shuttle
departures only; `attributeBoardings` buckets by stop and ignores `row.service_kind`;
`KioskView` hardcodes `service_kind: "shuttle"`. The schema still permits `bus9` so
existing rows stay valid, and the 9 keeps its own cards and timetable on the board.

**The database already contained the damage**: ~37 rows from a 22:35 session on 29 Sep
carry `service_kind = "bus9"`, written by Simulate tap through the buggy window logic.
They now re-attribute to the shuttle on read. No row in the table resolves to a 9.

### A real bug in the serial framing, found by the new guard

Writing `verify:reader` surfaced this immediately. `readScans`'s pump did:

```ts
while (!stopped) {
  const stream = port.readable;
  if (!stream) break;
  activeReader = stream.getReader();   // <- outside the try
  try { ... if (done) break; ... } catch { ... }
}
```

When a stream ends cleanly the inner loop breaks, the outer `while` is still true, and
`getReader()` is called again on a stream that is still **locked** — because the previous
reader was never released. That throws `ERR_INVALID_STATE` / "ReadableStream is locked",
and because the call sits outside the `try`, it escapes as an **unhandled promise
rejection**. The reader dies with no error in the panel and no log.

It never fired in testing because nothing had ever run a real stream. In a browser the
loop only survives if `port.readable` goes null, which happens on unplug — so this would
have surfaced as "the reader stopped counting taps after the USB stack reset the stream,
and the panel still said it was listening."

The pump now releases the lock in a `finally` and returns once the stream ends or a read
fails, leaving reconnection to `useReader`. A finished or failed stream cannot produce
another read, so retrying could only re-lock or spin.

### Reader changes

- **Firmware handshake.** `status: "listening"` was set on a successful `port.open()`,
  which succeeds even when no sketch is running — so a board that was never flashed read
  as healthy. Now `connecting` → `awaiting` → `listening`, where `listening` requires an
  actual line from the sketch, and the firmware version is shown. *Any* well-formed line
  counts, not just the boot `ready`, because opening the port does not always reset an
  UNO and a board already running would otherwise be stranded in `awaiting` forever.
- **Replug recovery.** `getGrantedPorts()` ran on mount only, and there was a disconnect
  handler but nothing watching for the port to return, so a yanked cable needed an
  operator click. Now polls every 2s for 2 minutes and re-attaches by USB id (Web Serial
  hands back a *new* `SerialPort` object, so identity comparison is useless).
- **`card_id` validation.** `event.uid` went straight into the database. Now requires 8
  hex characters and is lowercased; anything else is dropped with a visible warning.
- **Casing.** `randomCardId()` returned uppercase while the sketch emits lowercase, so
  the table would have had two casings of one field. `randomCardId` is now lowercase and
  real taps are lowercased. The ~74 existing uppercase ids are all Simulate tap rows.

### Two new CI guards

Both are offline and deterministic, and both were added because the failure they catch is
a *wrong number on a board* rather than an error:

- `npm run verify:attribution` — walks every minute of a day at both stops, asserts no
  tap can resolve to a 9, that every shuttle departure is reachable, that taps after the
  last departure are reported unassigned, and that legacy `bus9` rows re-attribute.
- `npm run verify:reader` — checks every key the sketch can emit is understood by the web
  `ScanEvent`, that the sketch's debounce is the 10s the docs claim, that `%08lx` output
  satisfies the web's card-id pattern, and replays the sketch's documented transcript —
  split mid-line, with a garbage line — through the real `readScans`. This is what found
  the locking bug above.

`npm run check:taps` is the local, networked counterpart: it reads the last day of rows
with the publishable key (no token, nothing written), re-resolves each through the
production attribution rule, and flags misattribution, malformed ids, uppercase legacy
ids, debounce violations, and taps after the last shuttle. **This is the objective check
for the first real tap** — a command rather than an eyeball.

Once the board is flashed, `verify:reader`'s synthetic transcript should be replaced with
a real capture checked into `card reader/transcripts/`.

### Bench results, 30 Sep 2026 — done

| Step | Result |
| --- | --- |
| Compile | first try, 12238 bytes (37% flash), 559 bytes globals, 1489 free |
| Upload | 12238 bytes written, signature `1E 95 0F` |
| Boot line | `Found chip PN532` / `Firmware ver. 1.6` / `{"v":1,"event":"ready","fw":"1.0.0"}` |
| Real tap | a Mifare Classic card, hashed to 8 lowercase hex; a second distinct card read the same way |
| End to end | 4 rows in Supabase, all `raw kind=shuttle`, all resolved to the 14:13 Bristo shuttle, 0 FAILs from `check:taps` |
| Debounce | **failed, then fixed** — see below |

The sketch's `String` fields were never at risk on the UNO R3's 2KB of RAM: 559 bytes of
globals and 1489 free, so the buffer refactor that was planned turned out to be
unnecessary.

### macOS cannot read this CDC device with the obvious tools

Every stock macOS reader reported the board as silent, and all of them were wrong:

| Reader | Result |
| --- | --- |
| `arduino-cli monitor` | 0 bytes over 45s |
| `dd`, `cat`, `cu` | 1 byte/sec of high-byte garbage |
| `stty` + the above, 9600–230400 baud | identical rate at **every** baud |
| `serialport` (npm) | correct text, first try |

Byte rate identical across every baud ruled out a baud mismatch and pointed at the tty
layer. The `serialport` library read the same port perfectly. Anyone else on a Mac
debugging this will hit the same wall and should not conclude the board is dead.

Note also that **opening the port resets the board** (DTR), so every capture gets a fresh
boot line — convenient, but it means the `ready` line is not a reliable "first connect"
signal.

### The debounce was wrong, and only hardware caught it

The sketch debounced on *time since the last accepted tap*: 10 seconds. A card left
resting on the reader was therefore counted again every 10 seconds, forever. Measured on
the bench, one continuous 25-second hold produced **3 taps**. The sketch's own comment
claimed "a card left on the reader is not counted twice" — it did exactly that, and for a
boarding demo, where people set a card down while they wait, that is the whole failure
mode.

Now a card counts once per *presentation*: the field must be empty for 1.5s (comfortably
longer than the 400ms poll, so an antenna dropout cannot split one tap) before the same
card counts again. Re-tested with the same 25s hold: **1 tap**, 32 `held` events. The
before/after capture is checked in, and `verify:reader` replays it.

The old guard asserted `DEBOUNCE_MS = 10000UL`, so it passed while the behaviour was
wrong — it was checking the constant matched the docs, not that the docs were true. It now
asserts re-arm happens on a lift, and that the threshold outlasts the poll.

### `tag: "ERROR"` is correct and must not be filtered

`MifareClassic.cpp:30` returns `NfcTag(uid, uidLength, "ERROR")` when *authentication*
fails, with the UID already read. That is the normal result for any card we do not hold
sector keys for — every real student card. Rejecting `ERROR` would have silently stopped
counting genuine cards. The `tag` field is informational; the count is what matters.

### The library talks on the same port, and cannot be told not to

`src/Ndef.h` defines `NDEF_USE_SERIAL` unconditionally, so 36 of 73 lines in a 50s capture
were library debug (`Tag is not NDEF formatted.`). `#undef` from the sketch cannot help —
it is a separate translation unit. Rather than patch a vendored third-party library, the
kiosk now ignores any line not beginning with `{`, silently. A line that does begin with
`{` but fails to parse is still a real fault and is still reported.


---

## Remaining work (2 Oct 2026)

A consolidated list, grouped by kind of work. The `## Todos` section above is kept as the
historical record; where the two overlap, this section is the one to trust. Items that
turned out to be done, or to be wrong, are collected under **Corrected** at the bottom
rather than quietly deleted.

### Site and infrastructure

- **Pages serves the right HTML with missing assets; the site is intermittently blank.**
  Two consecutive deploys (`cda9801` and `1bbe063`) both showed it. Measured on
  `1bbe063`: for roughly four minutes all 7 hashed assets returned 404 while the HTML
  itself returned 200, and seconds later the *previous* commit's `kiosk-DbrfW7Ky.css`
  resolved again. The CI artifact is complete and correct, so this is platform/CDN-side
  propagation, not a broken build. It self-heals, but a public demo will hit it.
  Needs a direction: accept it, drop content hashes from filenames, or move hosting off
  Pages. Do not deploy immediately before a demo.
- **Add a post-deploy asset-resolution check to CI.** Would have caught the above within
  seconds of the deploy finishing, instead of someone loading the site minutes later.
- **Confirm one GET and one OPTIONS in the browser Network panel, on the deployed URL**
  rather than the dev server, so a stale bundle is ruled out entirely. The corsproxy
  request loop is fixed and verified locally; this user-facing check is still outstanding.
- **Confirm on the deployed board that the shuttle is back**, and that the console is clear
  of corsproxy / countapi errors.
- **Check org → Usage** after a day to confirm request volume dropped and log ingestion
  has stopped climbing.

### Hardware and bench

Two bench paths were implemented but never actually exercised. Both matter, because a
demo is exactly when they will first be tried.

- **Unplug / replug recovery.** The code handles the reader disconnecting and coming
  back; never tested against real hardware.
- **Wifi off → taps queue → wifi on → flush**, with no duplicate rows and `tapped_at`
  preserved.
- **Two distinct cards back to back → two distinct rows.** Partly observed (4 rows across
  2 card ids), but never tested as a deliberate back-to-back double tap.
- **Kings shuttle at 18:55 sits outside the model window.** Confirm whether that is
  intended.
- **Legacy uppercase `card_ids` and historical `bus9` rows** are still in the database.
  Decide whether to clean them up or leave them for audit.
- **Post-last-shuttle blank card, and non-operating days.** Deliberately kept as-is at the
  user's request. Recorded here as a decision, not a defect, so it is not "fixed" by
  accident later.

### Security and privacy

- **The card hash is brute-forceable.** FNV-1a is unsalted over a 32-bit Mifare UID, so
  anyone holding the hash can recover the underlying UID by exhaustive search — a 4-billion
  space, trivial to walk. This matters more than it first appears because **the repository
  is public**, and cannot be private: GitHub Pages on the free plan cannot be served from a
  private repository (see the exposure note earlier in this file). Anything committed here
  is world-readable. Options: salt or pepper the hash via an env var, truncate it, or
  accept the exposure and document it. The captures committed under
  `card reader/transcripts/` were redacted to fixture IDs for exactly this reason; the
  unredacted originals are kept locally and out of git.
- **Confirm nothing else sensitive is committed.** The Supabase project ref lives in
  gitignored `.env.local`, and the ingest token belongs only in the kiosk browser's
  `localStorage`. Neither is in the repo, but a public repo makes this worth a deliberate
  pass rather than an assumption.

### Code hygiene

- **`npm audit`: 10 vulnerabilities (2 low, 2 moderate, 6 high)**, all in `vite` 7.0.0–7.3.3.
  Dev-server only; the static Pages bundle is unaffected. But it matters if `npm run dev`
  is ever reachable from another machine on the network. `npm audit fix` will bump Vite
  and may pull `vite-node` with it, so re-run `npm run build` and `verify:identity`
  afterwards.
- **Main bundle is 515.82 kB** (Vite warns on every build). Only ~56 kB of that is
  `modelWeights.json`; the remaining ~449 kB is React and application code. Lazy-fetching
  the weights buys little — real gains need actual code-splitting.
- **Memoize the `useCapacityParams` return value.** It builds a fresh object literal every
  render and sits in a `useCallback` dep array at `DepartureBoard.tsx:634`, invalidating
  that callback and the `useMemo`s behind it every render. CPU only, no fetch, no loop.
- **Wire up a real test runner.** `verify:identity` is CI-ready and could be the first one.

### Data and dates

- **2027/28 dates for `SHUTTLE_OPERATING_PERIODS` and `ACADEMIC_CALENDAR_2026_27`**, once
  published. Both are hardcoded and both fail *silently*. The shuttle one already cost a
  whole term; the calendar one made every prediction read "Plenty of seats" without
  emitting a single error. A recurring failure mode, not a one-off.
- **Publish the official 2027/28 shuttle and academic dates.** External dependency; this
  is the blocker on the item above.

### Corrected

Where the older `## Todos` entries were wrong, done, or no longer open.

- **Arduino install and flash — done 30 Sep 2026.** Not open.
- **"The 10s debounce holds exactly one row" — done, and the premise was wrong.** The 10s
  debounce was the bug. It counted a resting card again every 10 seconds. Replaced with a
  lift-based re-arm.
- **Repository visibility — resolved, not an open decision.** Pages on the free plan forces
  the repo public. The board being public is a consequence of wanting a public board, not a
  pending choice.
- **Main bundle figure — 505 kB → 515.82 kB**, re-measured 2 Oct 2026. Unchanged by the
  reader fix.
- **`npm audit` — re-verified 2 Oct 2026**, count unchanged at 10. Still open, just
  confirmed rather than assumed.
