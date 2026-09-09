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

### `model-picks.v1.json`

The model's locked entry. Read from a committed file and **never regenerated at
build time** — the point is that the picks were fixed before kickoff like
everyone else's. Derived from Can-Tre-Beat-Vegas's committed preseason futures
snapshot (10,000 season replays at 0-0). To lock a new season, bump `version` and
write a new file.

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
