# UoE Shuttle Departures — boarding demo

> Working notes, open questions, and the state of the demo live in
> [`SESSION-NOTES.md`](./SESSION-NOTES.md). Read that first if you are picking this up
> cold. This README is the reference; the notes are the journal.

Two pages built from the same departure board:

| Page | Path | Who uses it |
| --- | --- | --- |
| Visitor board | `/index.html` | Anyone with a link. Shows the next departures with predicted busyness and a live count of people who tapped at the booth. |
| Booth kiosk | `/kiosk.html` | The laptop at the reader. Connects to the PN532 shield over Web Serial, records taps, and shows a big next-bus card. |

## What the demo actually measures

The point of the proof of concept is one question: *if we counted real taps, would the
loading estimate look believable?*

A person taps any NFC card on the reader. The tap is stored as one anonymous row, and
the board attributes it to the **first departure from that stop at or after the tap**.
Each new bus therefore starts counting from zero on its own, with no reset job and no
server clock logic: a tap at 16:24 belongs to the 16:25 bus, and a tap at 16:26 belongs
to the next one.

Everything about it is a demo, and the UI says so:

- The reader cannot tell a student card from any other contactless card, so a tap is
  treated as a boarding event. There is no student ID involved.
- Only a 32-bit FNV-1a hash of the card UID is stored, never the UID. It is unsalted,
  so it is a differentiator, not an identity.
- Live counts are the booth's own taps, not a measure of everyone on the bus.
- Passenger-load figures are the model estimates from the original app.

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` serves both pages; the kiosk is at `/kiosk.html`.

```bash
npm run lint     # clean
npm run build    # type-checks and writes dist/
```

## Database

One Supabase project, several datasets. A dataset is just a label on each row, so
multiple demos (or days) can share a project, and the kiosk can switch between them
without redeploying.

1. Create a free project at [supabase.com](https://supabase.com) (region `eu-west-2`).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Replace
   `seed_token` with a token you generate yourself: `openssl rand -hex 32`. The script
   raises an exception if you leave the placeholder, because on a fresh project that
   would otherwise become a real write token that anyone reading the file already knows.
3. In **Project Settings → API**, copy the project URL and anon key.
4. For the public board, copy [`.env.example`](.env.example) to `.env.local` and fill
   those two values in. Without them the board still works, it just shows no counts.
5. For the kiosk, open the Connection panel and enter the URL, anon key, token, and
   dataset. These are stored in the kiosk browser's `localStorage`, so the booth laptop
   remembers them.

The ingest token is **not** an environment variable on purpose: anything in a `VITE_`
variable is compiled into the public bundle. The anon key is public by design; the
token is the part that stops anyone with a copy of the site from writing rows.

Saving a connection checks the token before it is stored, so a typo is reported while
you are still looking at the form rather than on somebody's tap. A token that does not
match is refused, with a **save anyway** escape for setting up a project whose schema
has not been run yet. A token that could not be checked — paused project, wifi drop —
is still saved and reported as unverified, because being offline says nothing about
whether the token is right. A connection saved without a token is marked **read only**
and will be rejected if a tap is attempted.

**Export connections copies ingest tokens in plain text.** That is how a second booth
laptop gets provisioned, and the token is write-capable, so treat the exported JSON as
a secret: do not paste it into a chat, an issue, or a shared document.

Confirm the setup landed before building anything on it:

```sql
select public.boarding_token_is_valid('PASTE_YOUR_TOKEN_HERE') as should_be_true;
```

If that returns `false`, the token you typed and the one hashed into `ingest_tokens` are
not the same — usually a stray space from copying. If it raises
`relation "ingest_tokens" does not exist`, the schema run failed part-way; the whole file
is one transaction, so start again from the top.

### Access rules

| Operation | Who | Condition |
| --- | --- | --- |
| Read boardings | anon | none — the board is public by design |
| Insert a tap | anon | valid `x-boarding-token` header |
| Update / delete | nobody | not granted, not needed |

`supabase/schema.sql` enforces the token by hashing it and comparing inside an RLS
policy, so the plaintext token is never stored in the database.

### Selecting a dataset

- The kiosk defaults to `expo-demo` and can switch dataset or stop in its panel.
- The public board reads the dataset named in `?dataset=...`, falling back to
  `VITE_BOARDING_DATASET`, then to `expo-demo`. That is how you point a QR code at one
  dataset and a demo laptop at another.

## Card reader

Hardware is a Seeed PN532 NFC Shield (SPI, chip select on pin 10) on an Arduino UNO.

**This has not been flashed yet.** As of 30 Sep 2026 the sketch had never been uploaded
to a board, so the tap path below is verified by replaying the firmware's transcript
through the real serial framing rather than by a card on real hardware. Every row in
the database so far came from *Simulate tap*. `SESSION-NOTES.md` has the bench
checklist and what was confirmed about the connected board.

1. Copy the library into `~/Documents/Arduino/libraries` (or install *Seeed Arduino
   NFC* from the Library Manager). The reference zip is in
   [`card reader/`](card%20reader/).
2. Open [`card reader/BoothReader/BoothReader.ino`](card%20reader/BoothReader/BoothReader.ino)
   and upload to an **Arduino UNO** (`arduino:avr:uno`). The board verified on 30 Sep 2026
   is a genuine Arduino UNO R3: USB `2341:0043` (*Uno R3, CDC ACM*) on
   `/dev/cu.usbmodem113301`, device signature `1E 95 0F` (ATmega328P). Verify with
   `ioreg -p IOUSB -l -w 0 | grep -A3 '"idProduct" = 67'` — `0x0043` is the UNO R3.
   `arduino-cli` bundled in the IDE can build and flash it without the GUI:

   ```
   CLI="/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli"
   "$CLI" compile --fqbn arduino:avr:uno --build-path /tmp/br "card reader/BoothReader"
   "$CLI" upload -p /dev/cu.usbmodem113301 --fqbn arduino:avr:uno --build-path /tmp/br
   ```
3. Open `/kiosk.html` in Chrome or Edge on the booth laptop and press **Connect
   reader**. Web Serial needs a secure context: `localhost` works during development,
   and the deployed Pages URL is HTTPS.

The firmware prints one JSON line per event at 115200 baud:

```
{"v":1,"event":"ready","fw":"1.0.0"}
{"v":1,"uid":"b1c2d3e4","tag":"NTAG213"}
{"v":1,"event":"held","card":"b1c2d3e4"}   // same card, still resting on the reader
{"v":1,"event":"error","code":1}          // no tag in the field
```

The kiosk counts a line as a tap if it carries `uid` of exactly 8 hex characters, and
ignores the rest. A `uid` that is not 8 hex characters is dropped with a visible warning
rather than written to the database.

**A card counts once per presentation.** It has to be lifted clear of the field for 1.5s
before it counts again, however long it sat there. This is deliberately *not* a
"time since last tap" debounce: that version was a real bug found on the bench, where a
card left resting on the reader was counted again every 10 seconds — three times in 50
seconds. For a boarding demo, where people set a card down while they wait, that inflates
counts. The capture is in
[`card reader/transcripts/`](card%20reader/transcripts/) and
`npm run verify:reader` replays it, so it cannot come back unnoticed.

The `tag` field is informational and may read `"ERROR"`. That is the Seeed library
reporting that *authentication* failed, which is expected for any card we do not hold the
sector keys for — every real student card. The UID is already read by then, so the count
is correct and those taps are **not** discarded.

The library also writes its own debug to the same port, which cannot be disabled from the
sketch (`src/Ndef.h` defines `NDEF_USE_SERIAL` unconditionally): on the bench that was 36
of 73 lines in a 50s capture, mostly `Tag is not NDEF formatted.` The kiosk therefore
ignores any line that does not begin with `{`, silently, so the panel does not fill with
third-party noise. A line that *does* begin with `{` but fails to parse is a real fault and
is still surfaced.

The panel distinguishes three healthy-ish states, because opening a serial port that no
sketch is using still succeeds — a board that was never flashed reads as healthy at that
layer, and used to show "Listening for taps" until somebody tapped:

| State | Meaning |
| --- | --- |
| Opening serial port… | the picker was accepted and the port is opening |
| Port open, waiting for the reader to report in | port is open, no firmware line seen yet. Normal for a second or two: opening the port resets an UNO, so the boot line arrives after the reboot |
| Listening for taps | the sketch has spoken, and its firmware version is shown next to the port |

If it stays in *waiting*, the sketch is not running. Any well-formed line counts as proof
of firmware, not just the boot `ready`, so a board that was already running before the
port opened does not get stranded.

Unplugging the shield says so and the panel polls for it to come back, re-attaching by
USB id for two minutes, so a yanked cable recovers without the operator pressing
anything.

NTAG213 or NTAG215 stickers are the reliable demo tokens; the reader is not fussy
about the card format, but cheap random cards are not reliably readable.

## When the wifi misbehaves

Venue wifi is the part of a demo that fails. Taps that cannot be written are kept in a
local outbox (up to 500 rows) and retried every 20 seconds and whenever the browser
sees an `online` event, with the original tap time preserved.

The board does not poll. It reads once on load and then follows Realtime, re-reading the
window if the tab becomes visible again or if the channel reconnects. That last part
matters: `postgres_changes` does not replay inserts that happened while the socket was
down, so a reconnect re-reads rather than trusting the stream to catch up. A tab left
open all weekend therefore costs a handful of requests instead of a request per second,
and the reason a fixed interval is absent is a cost decision, not an oversight.

Supabase free projects pause after 7 days of low activity and can take a minute to
wake. The outbox covers that. A tab left open still counts as activity and holds the
project awake through its Realtime socket, so the keep-alive no longer depends on
polling.

### Rejections are not retried

A wrong ingest token, a revoked key, or a connection pointing at the wrong project fails
identically on every attempt, so those taps are **not** queued. Queueing them would say
nothing useful and would quietly fill the outbox until it hit the 500-row cap and started
dropping real taps. Instead the kiosk panel shows the failure in red, and a tap is only
parked when the cause is something a retry can fix — a dropped socket, a paused project,
a 5xx.

The three states in the panel are colour-coded: green is a recorded tap, amber means
"saved locally, retrying", and red is a connection fault the operator has to fix. Queued
taps have **retry now** and **discard** links; discard is for a booth that is pointed at
the wrong project and will never deliver.

Note that the connection built from `.env.local` has no ingest token by design, so it can
only read — that is what the **reads only** note under the Database field means. The
kiosk writes through a connection saved in its own panel, which is where the token is
entered and checked.

## Connections must be referentially stable

A `Connection` passed into an effect's dependency array has to be the *same object* on
every render. An effect that depends on a fresh object re-runs on every render, and if it
fetches and stores state that re-renders, the two feed each other.

This is not caught by `eslint-plugin-react-hooks`. The exhaustive-deps rule reports
missing and surplus dependencies, not dependencies whose identity changes each render, so
the code lints clean while the effect re-runs continuously.

`envConnection()` caches its result at module scope and `useBoothConfig` memoises
`activeConnection` for exactly this reason. `import.meta.env` is baked in at build time
and `allConnections()` re-parses `localStorage`, so neither is stable on its own.

```bash
npm run verify:identity
```

That check asserts both identities and exits non-zero on a regression. It will not catch
a new unstable source, so keep the rule in mind when adding one.

## Deployment

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to
`main`. The Vite base path is `/uoe-shuttle-departures/`, which matches a project site
named `uoe-shuttle-departures`. For a custom domain, change `base` in
`vite.config.ts`.

## Checks

Four guards run in CI, and one command is for the bench. They exist because each of
these bugs produced a board that looked fine.

| Command | Fails when |
| --- | --- |
| `npm run lint` | ordinary lint |
| `npm run verify:identity` | a connection object stops being referentially stable, which reproduced the render/fetch loop that once made tens of thousands of requests a day |
| `npm run verify:attribution` | a tap could resolve to a Lothian 9 service instead of a shuttle. Walks every minute of a day at both stops |
| `npm run verify:reader` | the Arduino sketch and the web reader disagree about the protocol. Replays the sketch's transcript, split mid-line, through the real `readScans` |
| `npm run verify:bundle` | the built bundle has no Supabase connection baked in |
| `npm run check:taps` | *local only, needs network.* Prints the last day of taps and flags anything misattributed, malformed, or debounced twice. This is the objective check for a real tap |

## Taps are shuttle boardings only

A tap means "boarding the shuttle", always. The reader sits at the shuttle stand and
the 9 leaves from a different stand, and the busyness model is only trained on shuttle
departure times, so a count against a 9 would be both wrong and meaningless.

So the windows taps are attributed against are shuttle departures only, and
`service_kind` on a written row is always `"shuttle"`. The 9 still gets its own cards
and timetable on the visitor board — it just never carries a count. Rows written before
this was fixed still carry `service_kind = "bus9"` in the raw table, and are
re-attributed to the shuttle on read; the column is kept for audit and the schema
constraint is left alone.

## Layout

```
src/config.ts                 saved connections, dataset, stop
scripts/verify-connection-identity.ts  asserts connections are referentially stable
scripts/verify-attribution.ts  asserts no tap can resolve to a 9
scripts/verify-reader-protocol.ts       asserts sketch and web agree; replays the transcript
scripts/check-taps.ts          local: inspect real rows and flag bad ones
src/lib/boardings.ts          Supabase writes, reads, and the local outbox
src/lib/nfcReader.ts          Web Serial session, line framing, JSON parsing
src/lib/attribution.ts        tap -> service, the rollover rule
src/lib/serviceId.ts          service ids and the shuttle departure windows
src/lib/busyness.ts           shared labels, colours, model wrapper
src/hooks/useBoardings.ts     initial fetch, Realtime, reconnect catch-up
src/hooks/useReader.ts        serial lifecycle, firmware handshake, unplug and replug
src/KioskView.tsx             booth page
src/App.tsx                   visitor page
supabase/schema.sql           table, indexes, RLS, token check, Realtime
card reader/                  Arduino sketch and the reference library zip
```
