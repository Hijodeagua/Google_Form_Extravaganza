# Parked work

`main` deliberately contains two pages: the **pick distribution** and **Tre model
picks**. Everything below was built, works, and was taken off `main` because it
needs more thought before anyone else sees it.

**The code is not gone.** It is all on the `future/full-tracker` branch, at the
commit `main` was cut from. To get any of it back:

```bash
git checkout future/full-tracker -- app/nfl-futures-26-27/standings
```

…and re-add the tab in `app/nfl-futures-26-27/nav.tsx`.

---

## Standings

`app/nfl-futures-26-27/standings/page.tsx`

Ranked table, points out of 18, divisions and awards correct, the three pot
cards, and the tiebreak chain with a note saying which rule separated any tied
rows. Depends on `lib/scoring/tiebreak.ts` and `lib/scoring/pots.ts`, both also
on the branch.

**Why it is parked.** Until outcomes land it is nine rows of zero. It renders
correctly and says so plainly, but "correct and useless" is still useless as a
landing page. It wants something to show during the four months when nothing has
resolved — most-likely-to-win odds from the model, or a "who is best placed"
read, or simply to stay hidden until the first outcome is filled in.

## Entrant detail

`app/nfl-futures-26-27/entrants/[slug]/page.tsx`

One person's whole card, every pick graded correct / wrong / pending, with what
they actually typed shown underneath whenever it was cleaned up. This is the
page most worth bringing back first — it is interesting even with nothing
resolved, because it shows the room what everyone said.

It needs links from somewhere. Standings and the side pot were the only routes
in, so restoring this means restoring one of those, or linking names from the
distribution legend.

## Side pot

`app/nfl-futures-26-27/side-pot/page.tsx`

The Yes and Maybe entrants, scored among themselves, with the three pots
resolved inside that group.

**Why it is parked.** It is the main table filtered, and has no reason of its own
to exist yet. Worth revisiting once the side pot has actual rules.

## Admin

`app/nfl-futures-26-27/admin/page.tsx`

The fix queue: every answer the resolver could not place, every one it placed by
judgement, the near-misses, superseded submissions, unmatched columns, and the
list of outcomes still open. Prints the exact alias key to paste for each.

**Why it is parked.** It works, but the watchlist is noisy and will stay noisy
until outcomes resolve and the near-miss rule has something to compare against.
Bring it back the week you start filling in `results-26-27.json` — that is when
it earns its keep.

## Advanced board

`app/nfl-futures-26-27/advanced/page.tsx`, `data/nfl-futures-26-27/advanced-board.json`

Top twelve projected players per category with the rate stats behind them: EPA,
CPOE, PACR, RACR, target share, air-yards share, WOPR, QB hits.

## The player projection, and why the model got narrower

`scripts/fit-projection.ts`, `scripts/fit-mvp.ts`,
`data/nfl-futures-26-27/mvp-history.csv`

An earlier model answered 30 of 31 questions: stat leaders projected from two
prior seasons of nflverse production, awards derived from those, rookie awards
taken from the market. It was backtested properly, and the backtests are the
reason the model on `main` now answers nine.

- **Stat leaders.** Rebuilt for every season since 2017 from the two before it:
  named the exact leader **3 of 36 times (8%)**, with the true leader in its top
  three **11 of 36 (31%)**. Real signal, but a shortlist rather than a call. And
  the tuning was nearly irrelevant — across all 180 configurations tried, the hit
  rate only ranged from 1 to 4 of 36.
- **MVP.** Scored the top projected passers on production plus `W` times team
  strength, measured against the real AP winners. It hit **1 of 8**, which is
  what guessing among eight quarterbacks gets you, and **every `W` from 0.5 to 10
  produced identical picks**. The constant was not unfitted, it was unfittable.

If you bring the player model back, bring the backtest numbers with it and put
them on the page. A projection presented without its measured hit rate is the
thing those two scripts exist to prevent.

`mvp-history.csv` is worth keeping either way: AP MVP winners 1957-2024,
assembled from three independent public datasets that agree on all 12 seasons
where they overlap. Wikipedia is blocked by this network's egress policy, which
is why it was built that way. 2025 still needs adding by hand.
