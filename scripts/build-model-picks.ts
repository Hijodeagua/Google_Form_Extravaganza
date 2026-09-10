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
 * How hard team strength pulls a player's projection. Deliberately gentle: a
 * good offence lifts volume, it does not rewrite who the player is. 0.5 means a
 * team projected for 12 wins lifts its players about 12% over a 9-win team's.
 */
const TEAM_PULL = 0.5;

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
  const totals = new Map<string, { w: number; s: Record<Stat, number> }>();

  for (const season of Object.keys(SEASON_WEIGHTS).map(Number).sort()) {
    const weekly = await getCsv(`${NFLVERSE}/stats_player/stats_player_week_${season}.csv`, `${cacheDir}/wk_${season}.csv`);
    const weight = SEASON_WEIGHTS[season];
    for (const r of weekly) {
      if (r.season_type !== "REG") continue;
      const id = r.player_id || r.gsis_id;
      if (!id || !now.has(id)) continue; // only players on a 2026 roster
      const rec = totals.get(id) ?? { w: 0, s: { passing_yards: 0, rushing_yards: 0, receiving_yards: 0, def_sacks: 0 } };
      rec.w += weight;
      for (const k of STATS) rec.s[k] += (Number(r[k]) || 0) * weight;
      totals.set(id, rec);
    }
  }

  interface Projection { id: string; name: string; team: string; position: string; proj: Record<Stat, number>; teamWins: number }
  const projections: Projection[] = [];
  for (const [id, rec] of totals) {
    const who = now.get(id)!;
    const t = byTeam.get(who.team);
    if (!t || rec.w <= 0) continue;
    // Team strength lifts volume, gently.
    const lift = Math.pow(t.exp_wins / avgWins, TEAM_PULL);
    const proj = {} as Record<Stat, number>;
    for (const k of STATS) proj[k] = (rec.s[k] / rec.w) * GAMES * lift;
    projections.push({ id, name: who.name, team: who.team, position: who.position, proj, teamWins: t.exp_wins });
  }

  const topBy = (stat: Stat, filter: (p: Projection) => boolean = () => true) =>
    projections.filter(filter).sort((a, b) => b.proj[stat] - a.proj[stat]);

  const fmt = (n: number) => Math.round(n);
  const picks: Record<string, unknown> = {};
  const put = (id: string, value: string, basis: string, tier: string, team?: string, confidence: number | null = null) => {
    picks[id] = { value, team: team ?? null, confidence, basis, tier };
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
    const top = topBy(stat)[0];
    const unit = stat === "def_sacks" ? "sacks" : "yards";
    put(qid, top.name, `projected ${fmt(top.proj[stat])} ${unit} — highest in the league from two prior seasons weighted 70/30 toward 2025, scaled by ${top.team}'s projected ${top.teamWins} wins`, "projected", top.team);
  }

  // ---- awards derived from the same projections ----
  const qbs = topBy("passing_yards", (p) => p.position === "QB");
  // MVP has gone to a quarterback in 17 of the last 20 seasons, and almost
  // always to one on a contender, so the pick is the best projected passer
  // weighted by his team's title odds rather than raw yardage.
  const mvp = qbs.slice(0, 8).map((p) => ({ p, score: p.proj.passing_yards / qbs[0].proj.passing_yards + 2 * ((byTeam.get(p.team)?.p_sb ?? 0) / sbChamp.p_sb) }))
    .sort((a, b) => b.score - a.score)[0].p;
  put("mvp", mvp.name, `top projected passer weighted by title odds — ${fmt(mvp.proj.passing_yards)} yards on a ${((byTeam.get(mvp.team)?.p_sb ?? 0) * 100).toFixed(0)}% Super Bowl team`, "derived", mvp.team);

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
      playersProjected: projections.length,
    },
    picks,
    abstentions,
  };

  writeFileSync("data/nfl-futures-26-27/model-picks.v2.json", JSON.stringify(doc, null, 2) + "\n");
  process.stdout.write(`\nProjected ${projections.length} players. Wrote ${Object.keys(picks).length} picks.\n\n`);
  for (const [k, v] of Object.entries(picks)) {
    const p = v as { value: string; tier: string };
    process.stdout.write(`  ${k.padEnd(15)} ${p.tier.padEnd(10)} ${p.value}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
