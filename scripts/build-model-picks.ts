/**
 * Builds the model's entry: `data/nfl-futures-26-27/model-picks.v1.json`.
 *
 *   npx tsx scripts/build-model-picks.ts [YYYY-MM-DD]
 *
 * Run BY HAND, once, and commit the result. Never at build time: the point of
 * the model's entry is that its picks were locked on a date, so the committed
 * file is the record and this script only exists to regenerate it deliberately.
 *
 * One input, public and keyless: Can-Tre-Beat-Vegas's committed futures
 * snapshot. That file is the output of a Monte Carlo that plays the season all
 * the way through, 10,000 times — every remaining regular-season game, then the
 * full seven-team-per-conference bracket, wild card through a neutral-site
 * Super Bowl, with Elo updating inside each replay as results land. A team's
 * number here is the share of those full playthroughs it won the thing in.
 *
 * Deliberately narrow. The model answers the eight division winners and the
 * Super Bowl champion, because those fall straight out of the simulation. It
 * does not guess at awards or stat leaders: an earlier version did, and the
 * backtests are on the `future/full-tracker` branch showing it was not much
 * better than chance. See docs/FUTURE-WORK.md.
 */

import { writeFileSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/Hijodeagua/Can-Tre-Beat-Vegas/main/web/public/data/nfl";
/** Pin the snapshot date so a rebuild reproduces the same picks. */
const SNAPSHOT_DATE = process.argv[2] ?? "2026-09-12";
const VERSION = "v1";

interface TeamFutures {
  team: string; name: string; conference: string; division: string;
  exp_wins: number; p_division: number; p_sb: number;
}

const DIVISION_QUESTION: Record<string, string> = {
  "AFC East": "afc_east", "AFC North": "afc_north", "AFC South": "afc_south", "AFC West": "afc_west",
  "NFC East": "nfc_east", "NFC North": "nfc_north", "NFC South": "nfc_south", "NFC West": "nfc_west",
};

async function main() {
  const url = `${BASE}/history/${SNAPSHOT_DATE}.json`;
  process.stdout.write(`Reading ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const snapshot = await res.json();

  const teams: TeamFutures[] = snapshot.futures.teams;
  const sims: number = snapshot.futures.sims;
  const played = 272 - snapshot.futures.remaining_games;

  const picks: Record<string, unknown> = {};

  const byDivision = new Map<string, TeamFutures[]>();
  for (const t of teams) (byDivision.get(t.division) ?? byDivision.set(t.division, []).get(t.division)!).push(t);

  for (const [division, list] of byDivision) {
    const winner = list.reduce((best, t) => (t.p_division > best.p_division ? t : best));
    const runnerUp = list.filter((t) => t !== winner).reduce((b, t) => (t.p_division > b.p_division ? t : b));
    picks[DIVISION_QUESTION[division]] = {
      value: winner.name,
      team: winner.team,
      confidence: winner.p_division,
      basis: `won ${division} in ${Math.round(winner.p_division * 100)}% of ${sims.toLocaleString()} simulated seasons, ahead of ${runnerUp.name} on ${Math.round(runnerUp.p_division * 100)}%`,
      runnerUp: { value: runnerUp.name, team: runnerUp.team, confidence: runnerUp.p_division },
    };
  }

  const ranked = teams.slice().sort((a, b) => b.p_sb - a.p_sb);
  const champ = ranked[0];
  picks.sb_champ = {
    value: champ.name,
    team: champ.team,
    confidence: champ.p_sb,
    basis: `lifted the trophy in ${Math.round(champ.p_sb * 100)}% of ${sims.toLocaleString()} full playthroughs — every remaining game plus the whole bracket — ahead of ${ranked[1].name} on ${Math.round(ranked[1].p_sb * 100)}%`,
    runnerUp: { value: ranked[1].name, team: ranked[1].team, confidence: ranked[1].p_sb },
  };

  const doc = {
    _readme: [
      "THE MODEL'S ENTRY — locked, versioned, committed. Regenerate only by running",
      "scripts/build-model-picks.ts by hand. Never at build time.",
      "",
      "Eight division winners and the Super Bowl champion, and nothing else. Every",
      "number is the share of full simulated seasons — remaining schedule plus the",
      "complete playoff bracket — in which that team won the thing.",
    ],
    entrantId: "model",
    displayName: "Can Tre Beat Vegas (model)",
    version: VERSION,
    asOf: snapshot.run_date,
    generatedAt: new Date().toISOString(),
    simulation: {
      repo: "Hijodeagua/Can-Tre-Beat-Vegas",
      file: `web/public/data/nfl/history/${SNAPSHOT_DATE}.json`,
      sims,
      gamesPlayed: played,
      gamesRemaining: snapshot.futures.remaining_games,
      week: snapshot.week_label,
      method:
        "Elo Monte Carlo. Each replay plays every remaining regular-season game, then the full seven-team-per-conference bracket — wild card, divisional, conference title, and a neutral-site Super Bowl — with ratings updating inside the replay as it goes.",
    },
    picks,
  };

  writeFileSync(`data/nfl-futures-26-27/model-picks.${VERSION}.json`, JSON.stringify(doc, null, 2) + "\n");
  process.stdout.write(`\nModel ${VERSION}, as of ${snapshot.run_date} — ${sims.toLocaleString()} full season playthroughs\n\n`);
  for (const [id, v] of Object.entries(picks)) {
    const p = v as { value: string; confidence: number };
    process.stdout.write(`  ${id.padEnd(14)} ${p.value.padEnd(24)} ${(p.confidence * 100).toFixed(0)}%\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
