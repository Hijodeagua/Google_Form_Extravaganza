/**
 * Fits the one constant in the MVP rule: how much the award weights a team's
 * title odds against the quarterback's own projected production.
 *
 *   npx tsx scripts/fit-mvp.ts
 *
 * Target is `data/nfl-futures-26-27/mvp-history.csv` — the actual AP winners.
 * For each season the rule is rebuilt from the two seasons before it only, with
 * team strength taken from the prior season's record, and asked to name the MVP.
 *
 * The rule: among the top eight projected passers, maximise
 *     (projected yards / best projected yards) + W x (team strength / best team strength)
 * W = 0 picks the projected yardage leader and ignores the team entirely.
 * W large picks the best team's starter regardless of how he is projected.
 */

import { readFileSync, existsSync } from "node:fs";

const CACHE = process.env.NFLVERSE_CACHE ?? "/tmp";
const STAT_SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const TARGETS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const WEIGHTS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 10];
/** Matching the projection's own settings, so this fits the rule we ship. */
const W_RECENT = 0.7;
const SHRINK = 0.5;

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

function readColumns(path: string, wanted: string[]): string[][] {
  const text = readFileSync(path, "utf8");
  const out: string[][] = [];
  let header: string[] | null = null;
  let idx: number[] = [];
  let field = "", quoted = false;
  let row: string[] = [];
  const flush = () => {
    if (!header) { header = row; idx = wanted.map((w) => header!.indexOf(w)); }
    else if (row.length > 1) out.push(idx.map((i) => (i >= 0 ? row[i] ?? "" : "")));
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; continue; }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; flush(); }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); flush(); }
  return out;
}

// ---- the labels ----
const mvpCsv = readFileSync("data/nfl-futures-26-27/mvp-history.csv", "utf8")
  .split("\n").filter((l) => l && !l.startsWith("#"));
const mvpHeader = mvpCsv[0].split(",");
const MVP = new Map<number, { player: string; position: string }>();
for (const line of mvpCsv.slice(1)) {
  const p = line.split(",");
  MVP.set(Number(p[mvpHeader.indexOf("season")]), { player: p[mvpHeader.indexOf("player")], position: p[mvpHeader.indexOf("position")] });
}
process.stdout.write(`Labels: ${MVP.size} AP MVP winners, ${Math.min(...MVP.keys())}-${Math.max(...MVP.keys())}\n`);

// ---- production ----
interface Rec { games: number; team: string; firstWeek: number; passYds: number; attempts: number; name: string }
const bySeason = new Map<number, Map<string, Rec>>();
for (const season of STAT_SEASONS) {
  const path = `${CACHE}/wk_${season}.csv`;
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const map = new Map<string, Rec>();
  for (const [id, type, week, team, name, yds, att] of readColumns(path, ["player_id", "season_type", "week", "team", "player_display_name", "passing_yards", "attempts"])) {
    if (type !== "REG" || !id) continue;
    const w = Number(week) || 0;
    const rec = map.get(id) ?? { games: 0, team, firstWeek: w, passYds: 0, attempts: 0, name };
    rec.games += 1;
    if (w < rec.firstWeek) { rec.firstWeek = w; rec.team = team; }
    rec.passYds += Number(yds) || 0;
    rec.attempts += Number(att) || 0;
    map.set(id, rec);
  }
  bySeason.set(season, map);
}

// ---- team strength: previous season's record, no lookahead ----
const games = readColumns(`${CACHE}/nflverse_games.csv`, ["season", "game_type", "home_team", "away_team", "home_score", "away_score"]);
const rec = new Map<string, { w: number; g: number }>();
for (const [season, type, home, away, hs, as_] of games) {
  if (type !== "REG" || hs === "" || as_ === "") continue;
  const h = Number(hs), a = Number(as_);
  for (const [t, won] of [[home, h > a ? 1 : h === a ? 0.5 : 0], [away, a > h ? 1 : h === a ? 0.5 : 0]] as const) {
    const k = `${season}|${t}`;
    const r = rec.get(k) ?? { w: 0, g: 0 };
    r.w += won as number; r.g += 1; rec.set(k, r);
  }
}
const strength = (season: number, team: string) => { const r = rec.get(`${season}|${team}`); return r && r.g ? r.w / r.g : 0.5; };

function pick(target: number, W: number): { name: string; correct: boolean } | null {
  const cur = bySeason.get(target), p1 = bySeason.get(target - 1), p2 = bySeason.get(target - 2);
  const truth = MVP.get(target);
  if (!cur || !p1 || !p2 || !truth) return null;

  const qbs: { name: string; team: string; proj: number }[] = [];
  for (const [id, r] of cur) {
    const a = p1.get(id), b = p2.get(id);
    // Starter test uses the PRIOR season's attempts. Using the target season's
    // would be lookahead — it would quietly hand the model the knowledge of who
    // ended up starting, which preseason nobody has.
    if ((a?.attempts ?? 0) < 200) continue;
    const weight = (a ? a.games * W_RECENT : 0) + (b ? b.games * (1 - W_RECENT) : 0);
    if (weight <= 0) continue;
    const yds = (a ? a.passYds * W_RECENT : 0) + (b ? b.passYds * (1 - W_RECENT) : 0);
    const played = Math.min(((a?.games ?? 0) * W_RECENT + (b?.games ?? 0) * (1 - W_RECENT)), 17);
    const expG = SHRINK * played + (1 - SHRINK) * 17;
    qbs.push({ name: r.name, team: r.team, proj: (yds / weight) * expG });
  }
  if (!qbs.length) return null;
  qbs.sort((x, y) => y.proj - x.proj);

  const top = qbs.slice(0, 8);
  const bestProj = top[0].proj;
  const bestStr = Math.max(...top.map((q) => strength(target - 1, q.team)));
  const scored = top.map((q) => ({ q, s: q.proj / bestProj + W * (strength(target - 1, q.team) / (bestStr || 1)) }))
    .sort((x, y) => y.s - x.s);
  return { name: scored[0].q.name, correct: norm(scored[0].q.name) === norm(truth.player) };
}

process.stdout.write(`\nEvaluating ${TARGETS.length} seasons (${TARGETS[0]}-${TARGETS[TARGETS.length - 1]})\n\n`);
process.stdout.write("   W    hits   picks by season\n");
const results: { W: number; hits: number; n: number }[] = [];
for (const W of WEIGHTS) {
  let hits = 0, n = 0;
  const detail: string[] = [];
  for (const t of TARGETS) {
    const r = pick(t, W);
    if (!r) continue;
    n++; if (r.correct) hits++;
    detail.push(`${r.correct ? "✓" : " "}${r.name.split(" ").pop()}`);
  }
  results.push({ W, hits, n });
  process.stdout.write(`${W.toFixed(2).padStart(5)}  ${hits}/${n}    ${detail.join(" ")}\n`);
}

process.stdout.write("\nActual winners:  " + TARGETS.map((t) => `${t} ${MVP.get(t)?.player.split(" ").pop()}`).join("  ") + "\n");
const best = results.slice().sort((a, b) => b.hits - a.hits)[0];
const range = { lo: Math.min(...results.map((r) => r.hits)), hi: Math.max(...results.map((r) => r.hits)) };
process.stdout.write(`\nRange across every weight tried: ${range.lo}-${range.hi} of ${best.n}.\n`);
const plateau = results.filter((r) => r.hits === best.hits).map((r) => r.W);
process.stdout.write(`Best: ${best.hits}/${best.n} at W = ${plateau.join(", ")}\n`);
