# Google Form Extravaganza

Live results tracking for friend-group prediction pools that run through Google
Forms. A spoke on the [whosyurgoat.app](https://whosyurgoat.app) hub, served at
`/extravaganza`.

The repo is a **general home for form-driven trackers**, not a single pool. The
NFL futures pool is the first one; NBA futures, the EDH survey and the
gingerbread race slot in beside it without touching the engine.

## How it works

1. Responses are read from the Form's sheet as CSV via the public **gviz**
   endpoint. No auth, no API key, no secret in the repo.
2. Column headers are matched by **text**, never by index, so rewording or
   reordering a question between seasons does not break anything.
3. Answers are normalized (odds strings, `(favorite)`, `, WR, Titans` suffixes,
   accents, `Jr.`), then resolved through a hand-editable alias map, an exact
   match, a team-name match, and finally fuzzy matching.
4. Outcomes come from a hand-edited resolution key. Anything still `null` renders
   as **pending** and stays out of every denominator.
5. Everything else — points, tiebreaks, pots, distributions — is computed.

Pages revalidate hourly. Sheet contents are never committed.

## Routes

| Path                                     | What                                            |
| ---------------------------------------- | ----------------------------------------------- |
| `/extravaganza`                          | Index of trackers                               |
| `/extravaganza/nfl-futures-26-27`        | Standings, pots, tiebreaks                      |
| `/extravaganza/nfl-futures-26-27/entrants/<slug>` | One entrant's card, every pick graded  |
| `/extravaganza/nfl-futures-26-27/distribution`    | How the room split, per question       |
| `/extravaganza/nfl-futures-26-27/model`           | The model's entry vs the field         |
| `/extravaganza/nfl-futures-26-27/advanced`        | Rate stats behind the projections      |
| `/extravaganza/nfl-futures-26-27/side-pot`        | Yes/Maybe entrants only                |
| `/extravaganza/nfl-futures-26-27/admin`           | Fix queue for unresolved answers       |

## Running a season

Everything you touch by hand lives in `data/nfl-futures-26-27/`.

### `results-26-27.json` — the resolution key

The only file that says what actually happened. Fill in a `value` as each
outcome settles; the whole site recomputes.

```jsonc
"mvp": {
  "label": "MVP",
  "value": "Josh Allen",          // null = pending, never wrong
  "resolvedAt": "2027-02-05",
  "source": "AP awards"
},
"first_fired": {
  "value": "Jonathan Gannon",
  "team": "ARI",                  // lets "Arizona" and "Cardinals coach" grade correctly
  "void": false                   // true if nobody ever got fired
}
```

### `aliases.json` — the manual override

Checked **before** every other route, so an entry here always wins. Keys are the
normalized answer, which the admin page prints for you, ready to paste.

```jsonc
"global":     { "saquan": "Saquon Barkley" },
"byQuestion": { "coy": { "panthers coach": "Dave Canales" } }
```

### `entities.json`

The 32 franchises, with the spoken forms people actually type. Derived from
`Can-Tre-Beat-Vegas/NFL/elo/teams.py` so the pool and the model share one set of
identities. There is deliberately **no player or coach roster**: person answers
are graded against the resolved outcome, so there is nothing here to keep
current.

### `model-picks.v2.json`

The model's locked entry, written by `scripts/build-model-picks.ts`. Read from a
committed file and **never regenerated at build time** — the point is that the
picks were fixed on the same deadline as everyone else's.

```bash
npx tsx scripts/build-model-picks.ts   # by hand, once, before the season
```

Three public keyless inputs: Can-Tre-Beat-Vegas's committed futures snapshot
(10,000 Elo season replays), nflverse weekly player stats for the two prior
seasons, and nflverse 2026 week-1 rosters plus the schedule's coach column.

Every pick carries a `tier` saying how far to trust it:

| Tier        | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `modelled`  | straight from the Elo season simulation (team outcomes)     |
| `projected` | a player projection from two prior seasons of production    |
| `derived`   | a projection plus a rule of thumb (awards)                  |
| `market`    | no statistical basis; the price the Form's dropdown carried |

The player projection weights the two prior seasons 70/30 toward the most
recent, converts to a per-game rate, maps each player onto his **2026** roster
so an offseason move follows him, and lets team strength lift volume gently.

### `advanced-board.json`

Written by the same script. The top twelve projected players per category with
the rate stats behind them — EPA, CPOE, PACR, RACR, target share, air-yards
share, WOPR, QB hits, tackles for loss. Every column is per game across the two
prior seasons, weighted the same way the projection weights them.

Nothing on that page picks anything. It is there because rate stats travel
between seasons far better than totals do, so it is where you can tell a real
signal from a player who simply had the ball a lot on a bad team.

### Fitting the constants

`scripts/fit-projection.ts` rebuilds the projection for every season since 2017
using only the two seasons before it, then checks the predicted leader against
who actually led. Nine seasons across four categories, 36 cases, no lookahead.

```bash
npx tsx scripts/fit-projection.ts
```

At the shipped settings it calls the exact leader **3 of 36 times (8%)** and has
the true leader inside its **top three 11 of 36 times (31%)**. For scale, a guess
inside a ~600-player pool lands near 0.5%.

The more useful finding is how little the tuning matters: **across all 180
configurations in the grid, hit rate ranges from 1 to 4 correct out of 36.** That
is the entire combined effect of every constant. So the values below are chosen
from the marginal plateau rather than the grid's lucky maximum, which on 36
samples would be noise.

Two guards, both added after the first run produced a nonsense pick:

- **`TEAM_PULL = 0.3`**, down from 0.5. At 0.5 the team multiplier decided the
  passing title on its own — one quarterback led another by ten yards in five
  thousand purely because his team's win projection moved half a win after a
  single game.
- **`DURABILITY_SHRINK = 0.5`.** Projecting everyone over a full 17 games hands
  the title to whoever had the best rate in an injury-shortened season, so the
  17-game assumption is shrunk halfway toward what the player actually managed.

Where the top two projections land within `CLOSE_CALL_MARGIN` (3%) of each
other, the pick is flagged `closeCall` and the page labels it a coin flip
instead of presenting it as a call.

## Scoring

| Bucket                   | Questions | Points        |
| ------------------------ | --------- | ------------- |
| Division winners         | 8         | 1 each        |
| Awards                   | 8         | 1 each        |
| Dark Horse MVP bonus     | 1         | +2 if it is the real MVP |
| **Main pot total**       |           | **18 max**    |
| Super Bowl champion      | 1         | mini pot only |
| Combined points          | 1         | tiebreak only |
| Seeding, stat leaders, hot seat | 12 | shown, never scored |

Ties break on awards correct, then combined Super Bowl points closest without
going over (falling back to closest absolute if everybody goes over), then
earliest submission. The mini pots break on division winners first, and roll over
when nobody hits.

## Adding a pool

1. `lib/pools/<slug>/config.ts` — questions, header patterns, buckets, pots.
2. `data/<slug>/` — resolution key, aliases, entities.
3. Register it in `lib/pools/registry.ts`.
4. Add a route folder under `app/<slug>/`.

Nothing in `lib/scoring`, `lib/resolve` or `lib/sheets` should need to change.

## Development

```bash
npm install
npm run dev     # http://localhost:3000/extravaganza
npm test        # engine tests, no framework
npm run lint
npm run build
```

## Deploy

Vercel, same pattern as the other spokes. `basePath` and `assetPrefix` are set to
`/extravaganza` in `next.config.mjs`; the hub proxies `/extravaganza/:path*` here
via a rewrite in `whosyurgoat-hub/vercel.json`. No environment variables are
required.

## If the sheet gets locked down

The gviz endpoint stops returning CSV and starts returning a Google sign-in page,
which `lib/sheets/fetch.ts` detects and rejects. The service-account fallback is
written up in the comments at the top of that file: share the sheet with a
service account, put the key in `GOOGLE_SHEETS_CREDENTIALS`, and swap the one
fetch call. Everything downstream takes `string[][]` and needs no changes. Not
built now, on purpose — the sheet is public and an unnecessary credential is how
repos end up with secrets in them.

## Privacy

Entrant names are real people. There is no analytics, no third-party script, and
no telemetry of any kind. Sheet contents are never committed.
