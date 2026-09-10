/**
 * Fits the player-projection constants against history, instead of me picking
 * them and writing a paragraph about why they feel right.
 *
 *   npx tsx scripts/fit-projection.ts
 *
 * For each target season Y from 2017 on, the model is rebuilt using ONLY
 * seasons Y-1 and Y-2, and its predicted leader in each category is checked
 * against who actually led that season. No lookahead: a player's team for
 * season Y is taken from his first regular-season appearance that year, and the
 * team-strength term uses the previous season's record, which is what a
 * preseason projection would have had.
 *
 * Grid-searches the three constants the production script uses and reports the
 * combination that has picked the most category leaders. Whatever it prints is
 * what belongs in build-model-picks.ts.
 */

import { readFileSync, existsSync } from "node:fs";

const CACHE = process.env.NFLVERSE_CACHE ?? "/tmp";
const STAT_SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TARGETS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const STATS = ["passing_yards", "rushing_yards", "receiving_yards", "def_sacks"] as const;
type Stat = (typeof STATS)[number];

/** Column-targeted CSV reader — these files are 8 MB each and we want 8 fields. */
function readColumns(path: string, wanted: string[]): string[][] {
  const text = readFileSync(path, "utf8");
  const out: string[][] = [];
  let header: string[] | null = null;
  let idx: number[] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  const flushRow = () => {
    if (!header) {
      header = row;
      idx = wanted.map((w) => header!.indexOf(w));
    } else if (row.length > 1) {
      out.push(idx.map((i) => (i >= 0 ? (row[i] ?? "") : "")));
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; flushRow();
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); flushRow(); }
  return out;
}

interface SeasonRec { games: number; team: string; firstWeek: number; s: Record<Stat, number> }

process.stdout.write("Aggregating seasons\n");
/** season -> player id -> totals */
const bySeason = new Map<number, Map<string, SeasonRec>>();
for (const season of STAT_SEASONS) {
  const path = `${CACHE}/wk_${season}.csv`;
  if (!existsSync(path)) throw new Error(`missing ${path} — download stats_player_week_${season}.csv first`);
  const rows = readColumns(path, ["player_id", "season_type", "week", "team", ...STATS]);
  const map = new Map<string, SeasonRec>();
  for (const r of rows) {
    const [id, type, week, team, ...vals] = r;
    if (type !== "REG" || !id) continue;
    const w = Number(week) || 0;
    const rec = map.get(id) ?? { games: 0, team, firstWeek: w, s: { passing_yards: 0, rushing_yards: 0, receiving_yards: 0, def_sacks: 0 } };
    rec.games += 1;
    // Team as of the earliest appearance — the closest thing in this file to
    // "where he lined up in week 1", without peeking at midseason trades.
    if (w < rec.firstWeek) { rec.firstWeek = w; rec.team = team; }
    STATS.forEach((k, i) => { rec.s[k] += Number(vals[i]) || 0; });
    map.set(id, rec);
  }
  bySeason.set(season, map);
  process.stdout.write(`  ${season}: ${map.size} players\n`);
}

// Team win rate per season, from the schedule — the previous season's record is
// the team-strength signal a preseason projection would actually have.
const games = readColumns(`${CACHE}/nflverse_games.csv`, ["season", "game_type", "home_team", "away_team", "home_score", "away_score"]);
const teamWins = new Map<string, { w: number; g: number }>();
for (const [season, type, home, away, hs, as_] of games) {
  if (type !== "REG" || hs === "" || as_ === "") continue;
  const h = Number(hs), a = Number(as_);
  for (const [t, won] of [[home, h > a ? 1 : h === a ? 0.5 : 0], [away, a > h ? 1 : h === a ? 0.5 : 0]] as const) {
    const key = `${season}|${t}`;
    const rec = teamWins.get(key) ?? { w: 0, g: 0 };
    rec.w += won as number; rec.g += 1;
    teamWins.set(key, rec);
  }
}
const strength = (season: number, team: string): number => {
  const rec = teamWins.get(`${season}|${team}`);
  return rec && rec.g > 0 ? rec.w / rec.g : 0.5;
};

/** One (season, stat) evaluation for a given parameter set. */
function predict(target: number, stat: Stat, wRecent: number, pull: number, shrink: number) {
  const cur = bySeason.get(target)!;
  const prior1 = bySeason.get(target - 1);
  const prior2 = bySeason.get(target - 2);
  if (!prior1 || !prior2) return null;

  const wOld = 1 - wRecent;
  const league = [...cur.values()].reduce((n, r) => n + strength(target - 1, r.team), 0) / Math.max(cur.size, 1);

  const rows: { id: string; proj: number }[] = [];
  for (const [id, rec] of cur) {
    const a = prior1.get(id);
    const b = prior2.get(id);
    const weight = (a ? a.games * wRecent : 0) + (b ? b.games * wOld : 0);
    if (weight <= 0) continue; // no prior production — unpickable, like a rookie
    const total = (a ? a.s[stat] * wRecent : 0) + (b ? b.s[stat] * wOld : 0);
    const playedPerSeason = Math.min(((a?.games ?? 0) * wRecent + (b?.games ?? 0) * wOld) / (wRecent + wOld), 17);
    const expGames = shrink * playedPerSeason + (1 - shrink) * 17;
    const lift = Math.pow(strength(target - 1, rec.team) / league, pull);
    rows.push({ id, proj: (total / weight) * expGames * lift });
  }
  if (!rows.length) return null;
  rows.sort((x, y) => y.proj - x.proj);

  // Truth: who actually led that season, among everyone who played.
  let bestId = ""; let best = -1;
  for (const [id, rec] of cur) if (rec.s[stat] > best) { best = rec.s[stat]; bestId = id; }

  const rank = rows.findIndex((r) => r.id === bestId);
  return { hit1: rows[0].id === bestId, hit3: rank >= 0 && rank < 3, reachable: rank >= 0 };
}

const WR = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const PULL = [0, 0.1, 0.2, 0.3, 0.5, 0.8];
const SHRINK = [0, 0.25, 0.5, 0.75, 1.0];

process.stdout.write(`\nGrid search over ${WR.length * PULL.length * SHRINK.length} configurations, ${TARGETS.length} seasons, ${STATS.length} categories\n`);

interface Score { wRecent: number; pull: number; shrink: number; hit1: number; hit3: number; n: number }
const results: Score[] = [];
for (const wRecent of WR) for (const pull of PULL) for (const shrink of SHRINK) {
  let hit1 = 0, hit3 = 0, n = 0;
  for (const target of TARGETS) for (const stat of STATS) {
    const r = predict(target, stat, wRecent, pull, shrink);
    if (!r) continue;
    n++; if (r.hit1) hit1++; if (r.hit3) hit3++;
  }
  results.push({ wRecent, pull, shrink, hit1, hit3, n });
}

// Ceiling: how often the true leader even had prior production to project from.
let reachable = 0, tot = 0;
for (const target of TARGETS) for (const stat of STATS) {
  const r = predict(target, stat, 0.7, 0.3, 0.5);
  if (!r) continue;
  tot++; if (r.reachable) reachable++;
}

results.sort((a, b) => b.hit1 - a.hit1 || b.hit3 - a.hit3 || Math.abs(a.pull) - Math.abs(b.pull));
process.stdout.write(`\nCeiling: the actual leader was in the projectable pool in ${reachable}/${tot} cases (${Math.round((reachable / tot) * 100)}%).\n`);
process.stdout.write(`Picking at random inside a ~600-player pool would hit near 0%.\n\n`);
process.stdout.write("  recent  pull  shrink |  hit@1        hit@3\n");
for (const r of results.slice(0, 12)) {
  process.stdout.write(
    `  ${r.wRecent.toFixed(2)}    ${r.pull.toFixed(2)}  ${r.shrink.toFixed(2)}   |  ${r.hit1}/${r.n} (${Math.round((r.hit1 / r.n) * 100)}%)   ${r.hit3}/${r.n} (${Math.round((r.hit3 / r.n) * 100)}%)\n`,
  );
}

/**
 * Argmax over 36 evaluations is not a result — one extra correct pick moves a
 * configuration from mid-table to the top. So instead of trusting the winner,
 * look at each parameter's MARGINAL effect: average every configuration that
 * shares a value. If a parameter matters, its values separate here. If it does
 * not, they all land on top of each other and the honest conclusion is that the
 * constant is not worth tuning.
 */
process.stdout.write("\nMarginal effect of each constant (mean over all other settings):\n");
const marginal = (label: string, values: number[], get: (r: Score) => number) => {
  process.stdout.write(`\n  ${label}\n`);
  for (const v of values) {
    const sub = results.filter((r) => get(r) === v);
    const h1 = sub.reduce((n, r) => n + r.hit1, 0) / sub.length;
    const h3 = sub.reduce((n, r) => n + r.hit3, 0) / sub.length;
    const bar = "#".repeat(Math.round(h3 * 2));
    process.stdout.write(`    ${v.toFixed(2)}  hit@1 ${h1.toFixed(2)}  hit@3 ${h3.toFixed(2)}  ${bar}\n`);
  }
};
marginal("recency weight on the prior season", WR, (r) => r.wRecent);
marginal("team-strength pull", PULL, (r) => r.pull);
marginal("durability shrink", SHRINK, (r) => r.shrink);

const spread = { lo: Math.min(...results.map((r) => r.hit1)), hi: Math.max(...results.map((r) => r.hit1)) };
process.stdout.write(`\nAcross all ${results.length} configurations hit@1 ranges ${spread.lo}-${spread.hi} of ${results[0].n}. `);
process.stdout.write(`That is the entire effect of every constant combined.\n`);

const best = results[0];
process.stdout.write(`\nWorst configuration tried: hit@1 ${Math.min(...results.map((r) => r.hit1))}/${best.n}\n`);
process.stdout.write(`\nBEST: SEASON_WEIGHTS ${best.wRecent.toFixed(2)}/${(1 - best.wRecent).toFixed(2)}, TEAM_PULL ${best.pull}, DURABILITY_SHRINK ${best.shrink}\n`);

// The settings actually shipped in build-model-picks.ts. Reported explicitly so
// the page can quote a real measured accuracy rather than a vague claim.
const SHIPPED = { wRecent: 0.7, pull: 0.3, shrink: 0.5 };
{
  let h1 = 0, h3 = 0, n = 0;
  const per: string[] = [];
  for (const stat of STATS) {
    let s1 = 0, s3 = 0, sn = 0;
    for (const target of TARGETS) {
      const r = predict(target, stat, SHIPPED.wRecent, SHIPPED.pull, SHIPPED.shrink);
      if (!r) continue;
      sn++; if (r.hit1) s1++; if (r.hit3) s3++;
    }
    h1 += s1; h3 += s3; n += sn;
    per.push(`${stat} ${s1}/${sn} exact, ${s3}/${sn} top-three`);
  }
  process.stdout.write(`\nSHIPPED SETTINGS (${SHIPPED.wRecent}/${(1 - SHIPPED.wRecent).toFixed(1)}, pull ${SHIPPED.pull}, shrink ${SHIPPED.shrink}):\n`);
  process.stdout.write(`  exact leader   ${h1}/${n} (${Math.round((h1 / n) * 100)}%)\n`);
  process.stdout.write(`  leader in top 3 ${h3}/${n} (${Math.round((h3 / n) * 100)}%)\n`);
  for (const line of per) process.stdout.write(`    ${line}\n`);
}

// Per-category breakdown at the winning settings, since these differ a lot.
process.stdout.write("\nAt the best settings, by category:\n");
for (const stat of STATS) {
  let h1 = 0, h3 = 0, n = 0;
  for (const target of TARGETS) {
    const r = predict(target, stat, best.wRecent, best.pull, best.shrink);
    if (!r) continue;
    n++; if (r.hit1) h1++; if (r.hit3) h3++;
  }
  process.stdout.write(`  ${stat.padEnd(17)} hit@1 ${h1}/${n}   hit@3 ${h3}/${n}\n`);
}
