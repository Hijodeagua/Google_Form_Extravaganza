/**
 * Builds the model's entry: `data/nfl-futures-26-27/model-picks.v2.json`.
 *
 *   npx tsx scripts/build-model-picks.ts
 *
 * Run BY HAND, once, before the season. Never at build time — the whole point of
 * the model's entry is that its picks were locked on the same deadline as
 * everyone else's, so the committed file is the record and this script only
 * exists to regenerate it deliberately.
 *
 * Three inputs, all public and keyless:
 *
 * 1. Can-Tre-Beat-Vegas's committed preseason futures snapshot — 10,000 Elo
 *    season replays taken at 0-0. Supplies every team-level pick and the win
 *    expectations that scale the player projections.
 * 2. nflverse weekly player stats for the two prior seasons. Supplies the
 *    production the stat-leader projections are built from.
 * 3. nflverse 2026 week-1 rosters and the 2026 schedule's coach column. Supplies
 *    who is on which team now, and who coaches them, so a player who moved in
 *    the offseason is projected onto his new team.
 *
 * Where a pick has no statistical basis at all — the two rookie awards and
 * Comeback Player — the model takes the market price the Form's own dropdown
 * carried rather than inventing a number. Those are labelled `market`, and the
 * UI shows the basis of every pick.
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { parseCsv } from "../lib/sheets/csv";

const NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download";
const VEGAS_SNAPSHOT =
  "https://raw.githubusercontent.com/Hijodeagua/Can-Tre-Beat-Vegas/main/web/public/data/nfl/latest.json";
const SEASON = 2026;
/** Recency weighting across the two prior seasons: last year counts more. */
const SEASON_WEIGHTS: Record<number, number> = { 2025: 0.7, 2024: 0.3 };
const GAMES = 17;
/**
 * How hard team strength pulls a player's projection.
 *
 * Backtested, not asserted. `scripts/fit-projection.ts` rebuilds this model for
 * every season from 2017 on using only the two seasons before it, and checks
 * the predicted leader against who actually led. Averaged across the whole grid,
 * 0.2-0.3 is the plateau; below it team quality is ignored, above it the
 * multiplier starts deciding titles on its own.
 */
const TEAM_PULL = 0.3;

/**
 * A yards leader has to be on the field, so the 17-game assumption is shrunk
 * toward what the player actually managed. The backtest puts the useful range
 * at 0.25-0.5 and is flat across it.
 */
const DURABILITY_SHRINK = 0.5;

/**
 * What the backtest measured at exactly these settings: 9 seasons x 4
 * categories. Quoted on the page so nobody mistakes a projection for a
 * prediction. Re-run scripts/fit-projection.ts if the constants change.
 */
const BACKTEST = { seasons: 9, categories: 4, cases: 36, exact: 3, topThree: 11 };

/** Two projections closer than this are a coin flip, and are labelled as one. */
const CLOSE_CALL_MARGIN = 0.03;

type Row = Record<string, string>;

async function getCsv(url: string, cache: string): Promise<Row[]> {
  let text: string;
  if (existsSync(cache)) {
    text = readFileSync(cache, "utf8");
  } else {
    process.stdout.write(`  fetching ${url.split("/").pop()}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    text = await res.text();
    writeFileSync(cache, text);
  }
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

interface TeamFutures {
  team: string; name: string; conference: string; division: string;
  exp_wins: number; p_division: number; p_top_seed: number; p_conf: number; p_sb: number;
  wins: number;
}

async function main() {
  const cacheDir = process.env.NFLVERSE_CACHE ?? "/tmp";
  process.stdout.write("Loading inputs\n");

  const snapshot = await (await fetch(VEGAS_SNAPSHOT)).json();
  const teams: TeamFutures[] = snapshot.futures.teams;
  const byTeam = new Map(teams.map((t) => [t.team, t]));
  const avgWins = teams.reduce((n, t) => n + t.exp_wins, 0) / teams.length;

  const roster = await getCsv(`${NFLVERSE}/weekly_rosters/roster_weekly_${SEASON}.csv`, `${cacheDir}/roster_${SEASON}.csv`);
  const games = await getCsv(
    "https://raw.githubusercontent.com/Hijodeagua/Can-Tre-Beat-Vegas/main/data/schedules/nflverse_games.csv",
    `${cacheDir}/nflverse_games.csv`,
  );

  // Who is on which roster in 2026, keyed by the stable gsis id.
  const now = new Map<string, { team: string; position: string; name: string }>();
  for (const r of roster) {
    if (!r.gsis_id) continue;
    now.set(r.gsis_id, { team: r.team, position: r.position, name: r.full_name });
  }

  // 2026 head coaches, and each team's most recent starting QB, from the
  // schedule file's own columns.
  const coach = new Map<string, string>();
  const lastQb = new Map<string, string>();
  const winsPrior = new Map<string, number>();
  for (const g of games.sort((a, b) => a.gameday.localeCompare(b.gameday))) {
    const season = Number(g.season);
    if (season === SEASON) {
      if (g.home_coach) coach.set(g.home_team, g.home_coach);
      if (g.away_coach) coach.set(g.away_team, g.away_coach);
    }
    if (season === SEASON - 1) {
      if (g.home_qb_name) lastQb.set(g.home_team, g.home_qb_name);
      if (g.away_qb_name) lastQb.set(g.away_team, g.away_qb_name);
      if (g.game_type === "REG" && g.home_score !== "" && g.away_score !== "") {
        const h = Number(g.home_score), a = Number(g.away_score);
        winsPrior.set(g.home_team, (winsPrior.get(g.home_team) ?? 0) + (h > a ? 1 : h === a ? 0.5 : 0));
        winsPrior.set(g.away_team, (winsPrior.get(g.away_team) ?? 0) + (a > h ? 1 : h === a ? 0.5 : 0));
      }
    }
  }

  // Weighted per-game production across the two prior seasons.
  const STATS = ["passing_yards", "rushing_yards", "receiving_yards", "def_sacks"] as const;
  type Stat = (typeof STATS)[number];

  /**
   * Rate metrics carried alongside the projections for the Advanced board. Not
   * used to pick anything — these are the columns that say *why* a projection
   * looks the way it does, which raw yardage never does.
   *
   *   epa    expected points added, the closest thing to a value-per-play stat
   *   cpoe   completion % over expected, given depth and situation
   *   pacr   passing yards earned per air yard thrown
   *   racr   receiving yards earned per air yard targeted
   *   wopr   weighted opportunity: target share and air-yards share combined
   */
  const RATES = [
    "passing_epa", "passing_cpoe", "pacr", "passing_air_yards", "passing_tds", "passing_interceptions", "attempts",
    "rushing_epa", "rushing_first_downs", "carries", "rushing_tds",
    "receiving_epa", "racr", "target_share", "air_yards_share", "wopr", "targets", "receiving_tds", "receiving_air_yards",
    "def_qb_hits", "def_tackles_for_loss", "def_fumbles_forced", "def_pass_defended",
  ] as const;
  type Rate = (typeof RATES)[number];
  const totals = new Map<string, { w: number; games: number; s: Record<Stat, number>; r: Record<Rate, number> }>();
  const zeroRates = () => Object.fromEntries(RATES.map((k) => [k, 0])) as Record<Rate, number>;
  const seasonWeightSum = Object.values(SEASON_WEIGHTS).reduce((a, b) => a + b, 0);

  for (const season of Object.keys(SEASON_WEIGHTS).map(Number).sort()) {
    const weekly = await getCsv(`${NFLVERSE}/stats_player/stats_player_week_${season}.csv`, `${cacheDir}/wk_${season}.csv`);
    const weight = SEASON_WEIGHTS[season];
    for (const r of weekly) {
      if (r.season_type !== "REG") continue;
      const id = r.player_id || r.gsis_id;
      if (!id || !now.has(id)) continue; // only players on a 2026 roster
      const rec = totals.get(id) ?? { w: 0, games: 0, s: { passing_yards: 0, rushing_yards: 0, receiving_yards: 0, def_sacks: 0 }, r: zeroRates() };
      rec.w += weight;
      rec.games += weight;
      for (const k of STATS) rec.s[k] += (Number(r[k]) || 0) * weight;
      for (const k of RATES) rec.r[k] += (Number(r[k]) || 0) * weight;
      totals.set(id, rec);
    }
  }

  interface Projection {
    id: string; name: string; team: string; position: string;
    proj: Record<Stat, number>; teamWins: number; expGames: number;
    perGame: Record<Rate, number>; totals: Record<Rate, number>; gamesPlayed: number;
  }
  const projections: Projection[] = [];
  for (const [id, rec] of totals) {
    const who = now.get(id)!;
    const t = byTeam.get(who.team);
    if (!t || rec.w <= 0) continue;
    // Team strength lifts volume, gently.
    const lift = Math.pow(t.exp_wins / avgWins, TEAM_PULL);
    // Games a full season would have been, from the same weighting.
    const playedPerSeason = Math.min(rec.games / seasonWeightSum, GAMES);
    const expGames = DURABILITY_SHRINK * playedPerSeason + (1 - DURABILITY_SHRINK) * GAMES;
    const proj = {} as Record<Stat, number>;
    for (const k of STATS) proj[k] = (rec.s[k] / rec.w) * expGames * lift;
    const perGame = {} as Record<Rate, number>;
    const totalsOut = {} as Record<Rate, number>;
    for (const k of RATES) {
      perGame[k] = rec.r[k] / rec.w;
      totalsOut[k] = rec.r[k] / seasonWeightSum;
    }
    projections.push({
      id, name: who.name, team: who.team, position: who.position, proj, teamWins: t.exp_wins, expGames,
      perGame, totals: totalsOut, gamesPlayed: playedPerSeason,
    });
  }

  const topBy = (stat: Stat, filter: (p: Projection) => boolean = () => true) =>
    projections.filter(filter).sort((a, b) => b.proj[stat] - a.proj[stat]);

  const fmt = (n: number) => Math.round(n);
  const picks: Record<string, unknown> = {};
  const put = (
    id: string, value: string, basis: string, tier: string,
    team?: string, confidence: number | null = null, closeCall = false,
    alternatives: { name: string; team: string; value: number }[] = [],
  ) => {
    picks[id] = { value, team: team ?? null, confidence, basis, tier, closeCall, alternatives };
  };

  // ---- team-level picks, straight from the Elo sim ----
  const divisions = new Map<string, TeamFutures[]>();
  for (const t of teams) (divisions.get(t.division) ?? divisions.set(t.division, []).get(t.division)!).push(t);
  const DIV_KEY: Record<string, string> = {
    "AFC East": "afc_east", "AFC North": "afc_north", "AFC South": "afc_south", "AFC West": "afc_west",
    "NFC East": "nfc_east", "NFC North": "nfc_north", "NFC South": "nfc_south", "NFC West": "nfc_west",
  };
  for (const [div, list] of divisions) {
    const w = list.reduce((b, t) => (t.p_division > b.p_division ? t : b));
    put(DIV_KEY[div], w.name, `highest division-title probability across ${snapshot.futures.sims.toLocaleString()} season replays`, "modelled", w.team, w.p_division);
  }
  for (const conf of ["AFC", "NFC"] as const) {
    const cf = teams.filter((t) => t.conference === conf);
    const seed = cf.reduce((b, t) => (t.p_top_seed > b.p_top_seed ? t : b));
    const champ = cf.reduce((b, t) => (t.p_conf > b.p_conf ? t : b));
    put(`${conf.toLowerCase()}_one_seed`, seed.name, "highest #1-seed probability in the conference", "modelled", seed.team, seed.p_top_seed);
    put(`${conf.toLowerCase()}_champ`, champ.name, "highest conference-title probability", "modelled", champ.team, champ.p_conf);
  }
  const mostWins = teams.reduce((b, t) => (t.exp_wins > b.exp_wins ? t : b));
  const worst = teams.reduce((b, t) => (t.exp_wins < b.exp_wins ? t : b));
  const sbChamp = teams.reduce((b, t) => (t.p_sb > b.p_sb ? t : b));
  put("most_wins", mostWins.name, `highest expected wins (${mostWins.exp_wins})`, "modelled", mostWins.team);
  put("worst_record", worst.name, `lowest expected wins (${worst.exp_wins})`, "modelled", worst.team);
  put("sb_champ", sbChamp.name, "highest Super Bowl probability", "modelled", sbChamp.team, sbChamp.p_sb);

  // ---- stat leaders, from projected production ----
  const leaders: Record<string, Stat> = {
    pass_yards: "passing_yards", rush_yards: "rushing_yards", rec_yards: "receiving_yards", sacks: "def_sacks",
  };
  for (const [qid, stat] of Object.entries(leaders)) {
    const ranked = topBy(stat);
    const top = ranked[0];
    const next = ranked[1];
    const unit = stat === "def_sacks" ? "sacks" : "yards";
    // How much daylight is there? Two projections inside a few percent are not
    // a pick, they are a coin flip, and the page says so rather than pretending.
    const margin = next ? (top.proj[stat] - next.proj[stat]) / top.proj[stat] : 1;
    const close = margin < CLOSE_CALL_MARGIN;
    const gap = close
      ? `only ${(margin * 100).toFixed(1)}% clear of ${next.name} — effectively a coin flip`
      : `${(margin * 100).toFixed(0)}% clear of ${next?.name ?? "the field"}`;
    // The backtest says the exact pick lands 8% of the time but the true leader
    // is inside the top three 31% of the time, so the runner-ups are carried
    // through and shown — they are where most of the signal actually lives.
    const alternatives = ranked.slice(1, 3).map((p) => ({ name: p.name, team: p.team, value: fmt(p.proj[stat]) }));
    put(qid, top.name, `projected ${fmt(top.proj[stat])} ${unit} over ${top.expGames.toFixed(1)} games, ${gap}`, "projected", top.team, null, close, alternatives);
  }

  // ---- awards derived from the same projections ----
  const qbs = topBy("passing_yards", (p) => p.position === "QB");
  // MVP has gone to a quarterback in 17 of the last 20 seasons, and almost
  // always to one on a contender, so the pick is the best projected passer
  // weighted by his team's title odds rather than raw yardage.
  const mvpRanked = qbs
    .slice(0, 8)
    .map((p) => ({ p, score: p.proj.passing_yards / qbs[0].proj.passing_yards + 2 * ((byTeam.get(p.team)?.p_sb ?? 0) / sbChamp.p_sb) }))
    .sort((a, b) => b.score - a.score);
  const mvp = mvpRanked[0].p;
  const mvpMargin = mvpRanked[1] ? (mvpRanked[0].score - mvpRanked[1].score) / mvpRanked[0].score : 1;
  const mvpClose = mvpMargin < CLOSE_CALL_MARGIN;
  put(
    "mvp",
    mvp.name,
    `${fmt(mvp.proj.passing_yards)} projected passing yards on a ${((byTeam.get(mvp.team)?.p_sb ?? 0) * 100).toFixed(0)}% Super Bowl team. Award weights title odds twice as heavily as yardage, which is why this is not the projected passing leader` +
      (mvpClose ? `, and it is only ${(mvpMargin * 100).toFixed(1)}% clear of ${mvpRanked[1].p.name}` : `, ${(mvpMargin * 100).toFixed(0)}% clear of ${mvpRanked[1]?.p.name ?? "the field"}`),
    "derived",
    mvp.team,
    null,
    mvpClose,
  );

  const skill = projections.filter((p) => p.position !== "QB").map((p) => ({ p, y: p.proj.rushing_yards + p.proj.receiving_yards })).sort((a, b) => b.y - a.y)[0];
  put("opoy", skill.p.name, `most projected yards from scrimmage by a non-quarterback (${fmt(skill.y)})`, "derived", skill.p.team);

  const dpoy = topBy("def_sacks")[0];
  put("dpoy", dpoy.name, `projected sack leader (${fmt(dpoy.proj.def_sacks)})`, "derived", dpoy.team);

  const sbQb = qbs.find((p) => p.team === sbChamp.team) ?? qbs[0];
  put("sb_mvp", sbQb.name, `starting quarterback of the projected Super Bowl champion`, "derived", sbQb.team);

  // Dark Horse: the best projected passer whose team is NOT a title favourite.
  const contenders = new Set(teams.slice().sort((a, b) => b.p_sb - a.p_sb).slice(0, 6).map((t) => t.team));
  const dark = qbs.find((p) => !contenders.has(p.team))!;
  put("dark_horse", dark.name, `best projected passer outside the six title favourites (${fmt(dark.proj.passing_yards)} yards)`, "derived", dark.team);

  // Coach of the Year goes to improvement, so: biggest projected gain on 2025.
  const gains = teams.map((t) => ({ t, gain: t.exp_wins - (winsPrior.get(t.team) ?? t.exp_wins) })).sort((a, b) => b.gain - a.gain);
  const coy = gains.find((g) => coach.has(g.t.team))!;
  put("coy", coach.get(coy.t.team)!, `${coy.t.name} projected ${coy.gain > 0 ? "+" : ""}${coy.gain.toFixed(1)} wins on last season, the biggest gain in the league`, "derived", coy.t.team);

  const fired = teams.slice().sort((a, b) => a.exp_wins - b.exp_wins).find((t) => coach.has(t.team))!;
  put("first_fired", coach.get(fired.team)!, `coaches the lowest-projected team in the league (${fired.exp_wins} wins)`, "derived", fired.team);

  const benched = lastQb.get(fired.team);
  if (benched) put("first_benched", benched, `last season's starter on the lowest-projected team`, "derived", fired.team);

  // ---- market picks, where there is no statistical basis at all ----
  // Prices carried by the Form's own dropdown options.
  const MARKET: Record<string, [string, string]> = {
    oroy: ["Jeremiyah Love", "shortest price in the Form's own dropdown (+550)"],
    droy: ["Rueben Bain Jr.", "the option the Form marked as favourite"],
    cpoy: ["Patrick Mahomes", "the option the Form marked as favourite"],
  };
  for (const [qid, [value, why]] of Object.entries(MARKET)) put(qid, value, why, "market");

  // The one question the model genuinely cannot answer: the Elo simulates win
  // probabilities, never scores, so it has nothing to say about a final total.
  const abstentions: Record<string, string> = {
    sb_points: "the season simulation produces win probabilities, not scores",
  };

  const doc = {
    _readme: [
      "THE MODEL'S ENTRY — locked, versioned, committed. Regenerate only by running",
      "scripts/build-model-picks.ts by hand. Never at build time: the point is that",
      "these picks were fixed before kickoff like everyone else's.",
      "",
      "Every pick carries a `tier` saying how much to trust it:",
      "  modelled  straight from the Elo season simulation (team outcomes)",
      "  projected a player projection from two prior seasons of production",
      "  derived   a projection plus a rule of thumb (awards)",
      "  market    no statistical basis; the price the Form's dropdown carried",
    ],
    entrantId: "model",
    displayName: "Can Tre Beat Vegas (model)",
    version: `nfl-elo-plus-projections-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    sourceSnapshot: {
      repo: "Hijodeagua/Can-Tre-Beat-Vegas",
      file: "web/public/data/nfl/latest.json",
      runDate: snapshot.run_date,
      week: snapshot.week_label,
      sims: snapshot.futures.sims,
      gamesRemaining: snapshot.futures.remaining_games,
    },
    playerModel: {
      source: "nflverse stats_player_week + weekly_rosters",
      seasons: SEASON_WEIGHTS,
      games: GAMES,
      teamPull: TEAM_PULL,
      durabilityShrink: DURABILITY_SHRINK,
      closeCallMargin: CLOSE_CALL_MARGIN,
      playersProjected: projections.length,
      backtest: BACKTEST,
    },
    picks,
    abstentions,
  };

  writeFileSync("data/nfl-futures-26-27/model-picks.v2.json", JSON.stringify(doc, null, 2) + "\n");

  // ---- the Advanced board: the projection's own working, for anyone who wants
  // to argue with it. Rate stats, not just the yardage the pick is made on.
  const BOARDS: { id: string; label: string; stat: Stat; unit: string; note: string; cols: { key: Rate | "gamesPlayed"; label: string; dp: number }[] }[] = [
    {
      id: "passing", label: "Passing", stat: "passing_yards", unit: "yds",
      note: "EPA is total expected points added passing. CPOE is completion percentage over expected. PACR is passing yards per air yard — a low PACR with high air yards means throwing deep and missing.",
      cols: [
        { key: "attempts", label: "Att/g", dp: 1 }, { key: "passing_epa", label: "EPA/g", dp: 2 },
        { key: "passing_cpoe", label: "CPOE", dp: 1 }, { key: "pacr", label: "PACR", dp: 2 },
        { key: "passing_air_yards", label: "AirY/g", dp: 0 }, { key: "passing_tds", label: "TD/g", dp: 2 },
        { key: "passing_interceptions", label: "INT/g", dp: 2 },
      ],
    },
    {
      id: "rushing", label: "Rushing", stat: "rushing_yards", unit: "yds",
      note: "Carries per game is the volume the projection leans on. Rushing EPA below zero is normal — most runs lose expected points, which is why bulk rushing rarely wins awards.",
      cols: [
        { key: "carries", label: "Car/g", dp: 1 }, { key: "rushing_epa", label: "EPA/g", dp: 2 },
        { key: "rushing_first_downs", label: "1D/g", dp: 2 }, { key: "rushing_tds", label: "TD/g", dp: 2 },
      ],
    },
    {
      id: "receiving", label: "Receiving", stat: "receiving_yards", unit: "yds",
      note: "WOPR combines target share and air-yards share into one opportunity number; above about 0.7 is a true number-one option. RACR is receiving yards per air yard targeted.",
      cols: [
        { key: "targets", label: "Tgt/g", dp: 1 }, { key: "target_share", label: "Tgt%", dp: 3 },
        { key: "air_yards_share", label: "AY%", dp: 3 }, { key: "wopr", label: "WOPR", dp: 2 },
        { key: "racr", label: "RACR", dp: 2 }, { key: "receiving_epa", label: "EPA/g", dp: 2 },
        { key: "receiving_tds", label: "TD/g", dp: 2 },
      ],
    },
    {
      id: "pressure", label: "Pass rush", stat: "def_sacks", unit: "sacks",
      note: "QB hits per game is the more stable signal: sacks are noisy year to year, pressure is not. A high hit rate with low sacks usually corrects upward.",
      cols: [
        { key: "def_qb_hits", label: "Hits/g", dp: 2 }, { key: "def_tackles_for_loss", label: "TFL/g", dp: 2 },
        { key: "def_fumbles_forced", label: "FF/g", dp: 2 }, { key: "def_pass_defended", label: "PD/g", dp: 2 },
      ],
    },
  ];

  const board = BOARDS.map((b) => ({
    ...b,
    rows: projections
      .slice()
      .sort((x, y) => y.proj[b.stat] - x.proj[b.stat])
      .slice(0, 12)
      .map((p) => ({
        name: p.name, team: p.team, position: p.position,
        projected: Math.round(p.proj[b.stat]),
        gamesPlayed: Number(p.gamesPlayed.toFixed(1)),
        expGames: Number(p.expGames.toFixed(1)),
        teamWins: p.teamWins,
        cols: Object.fromEntries(b.cols.map((c) => [c.key, Number((p.perGame[c.key as Rate] ?? 0).toFixed(4))])),
      })),
  }));

  writeFileSync(
    "data/nfl-futures-26-27/advanced-board.json",
    JSON.stringify({
      _readme: [
        "The projection's working, for arguing with. Written by scripts/build-model-picks.ts",
        "from the same nflverse weekly stats the picks come from, weighted the same way.",
        "Every column is PER GAME over the two prior seasons. Nothing here picks anything —",
        "these are the rate stats that explain why a projection looks the way it does.",
      ],
      generatedAt: doc.generatedAt,
      seasons: SEASON_WEIGHTS,
      boards: board,
    }, null, 2) + "\n",
  );
  process.stdout.write(`\nProjected ${projections.length} players. Wrote ${Object.keys(picks).length} picks.\n\n`);
  for (const [k, v] of Object.entries(picks)) {
    const p = v as { value: string; tier: string; closeCall?: boolean };
    process.stdout.write(`  ${k.padEnd(15)} ${p.tier.padEnd(10)} ${p.value}${p.closeCall ? "   [close call]" : ""}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
