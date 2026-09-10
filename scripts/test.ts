/**
 * Engine tests. No framework: `tsx scripts/test.ts`.
 *
 * The fixture uses invented names with the *real* answer shapes pulled from the
 * live sheet — odds parentheticals, "(favorite)", ", WR, Titans" suffixes,
 * misspellings, bare surnames, "???", and two-names-in-one-box. Real entrants'
 * names are never committed here; the messiness is what the engine has to
 * survive, and that transfers.
 */
import { parseCsv } from "../lib/sheets/csv";
import { mapColumns } from "../lib/sheets/headers";
import { canonicalKey, displayValue, isMultiAnswer, isNonAnswer } from "../lib/resolve/normalize";
import { resolveAnswer, clusterAnswers, clusterLabel, pickKey, type AliasMap, type ResolverContext, type TeamEntity } from "../lib/resolve/match";
import { readOutcome, scoreEntrant, type Entrant, type Outcome } from "../lib/scoring/engine";
import { rank } from "../lib/scoring/tiebreak";
import { resolvePots } from "../lib/scoring/pots";
import { NFL_FUTURES_26_27 as POOL } from "../lib/pools/nfl-futures-26-27/config";
import entities from "../data/nfl-futures-26-27/entities.json";
import aliases from "../data/nfl-futures-26-27/aliases.json";
import results from "../data/nfl-futures-26-27/results-26-27.json";
import model from "../data/nfl-futures-26-27/model-picks.v2.json";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, Object.is(actual, expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

const ctx: ResolverContext = {
  teams: entities.teams as TeamEntity[],
  aliases: { global: aliases.global, byQuestion: aliases.byQuestion } as AliasMap,
};
const q = (id: string) => POOL.questions.find((x) => x.id === id)!;
const resolve = (raw: string, id: string) => resolveAnswer(raw, q(id).domain, id, ctx);

/* ---------------------------------------------------------------- CSV ---- */
{
  const rows = parseCsv('a,b,c\r\n1,"Carnell Tate, WR, Titans (+600)",3\r\n4,"say ""hi""",6\r\n');
  eq("csv: row count", rows.length, 3);
  eq("csv: quoted commas stay in one field", rows[1][1], "Carnell Tate, WR, Titans (+600)");
  eq("csv: doubled quote unescapes", rows[2][1], 'say "hi"');
  eq("csv: blank trailing row dropped", parseCsv("a,b\n1,2\n\n").length, 2);
  eq("csv: BOM stripped", parseCsv("﻿a,b\n1,2\n")[0][0], "a");
}

/* -------------------------------------------------------- normalization --- */
{
  eq("strips odds", displayValue("Buffalo Bills (+1000)"), "Buffalo Bills");
  eq("strips (favorite)", displayValue("Myles Garrett (favorite)"), "Myles Garrett");
  eq("strips position+team+odds", displayValue("Carnell Tate, WR, Titans (+600)"), "Carnell Tate");
  eq("strips trailing space", displayValue("Tua "), "Tua");
  eq("cuts commentary after a comma", displayValue("Tua, duh"), "Tua");
  eq("cuts a spaced-dash team suffix", displayValue("David Bailey - Jets"), "David Bailey");
  eq("keeps a hyphenated name", displayValue("Amon-Ra St. Brown"), "Amon-Ra St. Brown");
  eq("strips a leading hedge", displayValue("Should be Mike McCarthy"), "Mike McCarthy");
  eq("leaves a normal answer alone", displayValue("Dan Quinn"), "Dan Quinn");
  eq("drops Jr.", canonicalKey("Rueben Bain Jr."), "rueben bain");
  eq("lowercases", canonicalKey("gibbs"), "gibbs");
  check("??? is a non-answer", isNonAnswer("???"));
  check("Dont know is a non-answer", isNonAnswer("Dont know"));
  check("a real name is not a non-answer", !isNonAnswer("Josh Allen"));
  check("detects two-in-one", isMultiAnswer("Emmitt Smith or OJ Simpson"));
  check("does not trip on names containing 'or'", !isMultiAnswer("Baker Mayfield"));
}

/* ------------------------------------------------------------- headers --- */
{
  const header = [
    "Timestamp", "Name", "Maybe interested in side pot? (Will follow up with those interested)",
    "AFC East winner", "AFC North winner", "AFC South winner", "AFC West winner",
    "NFC East winner", "NFC North winner", "NFC South winner", "NFC West winner",
    "1 seed in the AFC", "1 seed in the NFC", "Most wins, both conferences",
    "Worst record in the league", "AFC Champion", "NFC Champion", "Super Bowl LXI Champion",
    "Super Bowl LXI MVP", "TIEBREAKER: total combined points scored in Super Bowl LXI",
    "MVP", "Dark Horse MVP", "Offensive Player of the Year", "Defensive Player of the Year",
    "Offensive Rookie of the Year", "Defensive Rookie of the Year", "Comeback Player of the Year",
    "Coach of the Year", "Passing yards leader", "Rushing yards leader", "Receiving yards leader",
    "Sack leader", "First head coach fired", "First Week 1 starting QB to get benched",
  ];
  const cols = mapColumns(POOL, header);
  eq("headers: every question mapped", cols.missing.length, 0);
  eq("headers: nothing left unmapped", cols.unmapped.length, 0);
  eq("headers: timestamp", cols.timestamp, 0);
  eq("headers: side pot found", cols.sidePot, 2);
  // The three MVP columns are the trap: bare "MVP" must not steal the other two.
  eq("headers: bare MVP", cols.byQuestion.mvp, 20);
  eq("headers: Super Bowl MVP", cols.byQuestion.sb_mvp, 18);
  eq("headers: Dark Horse MVP", cols.byQuestion.dark_horse, 21);

  // Reordered and reworded next season — still maps.
  const reworded = ["Name", "Timestamp", "Who wins the AFC East winner?", "League MVP"];
  const c2 = mapColumns(POOL, reworded);
  eq("headers: survives reordering", c2.name, 0);
  eq("headers: survives rewording", c2.byQuestion.afc_east, 2);
}

/* ------------------------------------------------------------ resolving -- */
{
  eq("team: exact", resolve("Buffalo Bills", "afc_east").team, "BUF");
  eq("team: with odds", resolve("Buffalo Bills (+1000)", "sb_champ").team, "BUF");
  eq("team: nickname only", resolve("Seahawks", "nfc_west").team, "SEA");
  eq("team: typo is flagged, not silent", resolve("Buffalo Bils", "afc_east").status, "flagged");
  eq("team: typo still lands", resolve("Buffalo Bils", "afc_east").team, "BUF");
  eq("team: nonsense stays unresolved", resolve("purple monkey dishwasher", "afc_east").status, "unresolved");

  eq("person: alias map wins", resolve("Saquan", "dark_horse").value, canonicalKey("Saquon Barkley"));
  eq("person: alias method", resolve("Saquan", "dark_horse").method, "alias");
  eq("person: '???' abstains", resolve("???", "sacks").status, "abstained");
  eq("person: 'Dont know' abstains", resolve("Dont know", "cpoy").status, "abstained");
  eq("person: two names scores zero", resolve("Emmitt Smith or OJ Simpson", "rush_yards").status, "multi");

  const teamRef = resolve("Panthers coach", "coy");
  eq("coach: team-referential resolves to the team", teamRef.team, "CAR");
  eq("coach: team-referential is flagged", teamRef.status, "flagged");
  eq("coach: bare team name works too", resolve("Arizona", "first_fired").team, "ARI");
  eq("coach: a plain name stays a name", resolve("Dan Quinn", "first_fired").team, undefined);

  eq("number: parses", resolve("44", "sb_points").number, 44);
  eq("number: non-numeric unresolved", resolve("lots", "sb_points").status, "unresolved");
}

/* ------------------------------------------------------------ grading ---- */
function outcome(id: string, value: string | number | null, extra: Record<string, unknown> = {}): Outcome {
  return readOutcome(q(id), { value, resolvedAt: "2027-02-08", source: "test", ...extra }, ctx);
}

function entrant(name: string, answers: Record<string, string>, at: number, outcomes: Record<string, Outcome>): Entrant {
  const resolutions = Object.fromEntries(
    POOL.questions.map((question) => [question.id, resolve(answers[question.id] ?? "", question.id)]),
  );
  return scoreEntrant(
    POOL,
    { id: name, name, submittedAt: String(at), submittedAtMs: at, isModel: false, sidePotAnswer: "Yes", optedIntoSidePot: true },
    resolutions,
    outcomes,
  );
}

{
  const outcomes: Record<string, Outcome> = {
    afc_east: outcome("afc_east", "Buffalo Bills"),
    mvp: outcome("mvp", "Josh Allen"),
    sb_champ: outcome("sb_champ", "Buffalo Bills"),
    sb_points: outcome("sb_points", 50),
    coy: outcome("coy", "Dave Canales", { team: "CAR" }),
    first_fired: outcome("first_fired", "Jonathan Gannon", { team: "ARI" }),
  };

  const a = entrant("Ada", { afc_east: "Buffalo Bills", mvp: "Josh Allen", dark_horse: "Josh Allen", sb_points: "48", coy: "Panthers coach" }, 100, outcomes);
  eq("grade: division correct", a.picks.afc_east.grade, "correct");
  eq("grade: award correct", a.picks.mvp.grade, "correct");
  eq("grade: dark horse bonus fires", a.picks.dark_horse.points, 2);
  eq("grade: coach via team ref", a.picks.coy.grade, "correct");
  eq("grade: total", a.points, 1 + 1 + 2 + 1);
  eq("grade: divisions counted", a.divisionsCorrect, 1);
  eq("grade: awards counted", a.awardsCorrect, 2);

  const b = entrant("Bo", { mvp: "Allen", afc_east: "Miami Dolphins" }, 200, outcomes);
  eq("grade: bare surname hits", b.picks.mvp.grade, "correct");
  eq("grade: wrong team misses", b.picks.afc_east.grade, "wrong");

  const c = entrant("Cy", { mvp: "Josh Allan" }, 300, outcomes);
  eq("grade: near-miss spelling hits", c.picks.mvp.grade, "correct");
  check("grade: near-miss spelling is flagged", c.picks.mvp.flagged);

  const d = entrant("Di", { mvp: "Lamar Jackson" }, 400, outcomes);
  eq("grade: different player misses", d.picks.mvp.grade, "wrong");
  check("grade: different player is not flagged", !d.picks.mvp.flagged);

  // Real strings from the sheet that used to grade wrong in silence.
  const e = entrant("Ed", { mvp: "Josh Allen beast mode post-injury", coy: "Should be Dave Canales", sb_mvp: "Allen, duh" }, 450, outcomes);
  eq("grade: name with commentary still hits", e.picks.mvp.grade, "correct");
  eq("grade: hedged coach name hits", e.picks.coy.grade, "correct");

  // A double misspelling is too far to score, but must not be silently wrong.
  const f = entrant("Fay", { mvp: "Jesh Allan" }, 460, outcomes);
  eq("near-miss: still scores zero", f.picks.mvp.grade, "wrong");
  check("near-miss: is flagged for review", f.picks.mvp.flagged);
  check("near-miss: says what it was close to", (f.picks.mvp.note ?? "").includes("Close to"));

  const g = entrant("Gil", { mvp: "Xavier Worthy" }, 470, outcomes);
  check("far miss: not flagged", !g.picks.mvp.flagged);

  // Nothing resolved: the state the page lives in for four months.
  const empty = Object.fromEntries(POOL.questions.filter((x) => !x.gradeAgainst).map((x) => [x.id, readOutcome(x, { value: null }, ctx)]));
  const p = entrant("Pending", { afc_east: "Buffalo Bills", mvp: "Josh Allen" }, 500, empty);
  eq("pending: scores nothing", p.points, 0);
  eq("pending: grade is pending, not wrong", p.picks.afc_east.grade, "pending");
  eq("pending: nothing counted as graded", p.gradedCount, 0);

  // A voided question drops out instead of scoring everyone zero.
  const voided = { ...outcomes, first_fired: outcome("first_fired", null, { void: true }) };
  const v = entrant("Vee", { first_fired: "Dan Quinn" }, 600, voided);
  eq("void: drops out", v.picks.first_fired.grade, "void");
}

/* ---------------------------------------------------------- tiebreaks ---- */
{
  const outcomes: Record<string, Outcome> = {
    afc_east: outcome("afc_east", "Buffalo Bills"),
    nfc_east: outcome("nfc_east", "Philadelphia Eagles"),
    mvp: outcome("mvp", "Josh Allen"),
    opoy: outcome("opoy", "Bijan Robinson"),
    sb_points: outcome("sb_points", 50),
  };

  // Same points; A has more awards, so awards separate them.
  const byAwards = [
    entrant("MoreAwards", { mvp: "Josh Allen", opoy: "Bijan Robinson", sb_points: "10" }, 100, outcomes),
    entrant("MoreDivs", { afc_east: "Buffalo Bills", nfc_east: "Philadelphia Eagles", sb_points: "49" }, 200, outcomes),
  ];
  const r1 = rank(byAwards, POOL.tiebreaks, outcomes);
  eq("tiebreak: equal points", r1[0].entrant.points, r1[1].entrant.points);
  eq("tiebreak: most awards wins", r1[0].entrant.name, "MoreAwards");
  eq("tiebreak: reports the rule", r1[0].separatedBy, "most awards correct");

  // Same points and same awards: combined points, closest without going over.
  const byPoints = [
    entrant("Over", { mvp: "Josh Allen", sb_points: "51" }, 100, outcomes),
    entrant("Under", { mvp: "Josh Allen", sb_points: "47" }, 200, outcomes),
    entrant("Exact", { mvp: "Josh Allen", sb_points: "50" }, 300, outcomes),
  ];
  const r2 = rank(byPoints, POOL.tiebreaks, outcomes);
  eq("tiebreak: exact beats under", r2[0].entrant.name, "Exact");
  eq("tiebreak: under beats over", r2[1].entrant.name, "Under");
  eq("tiebreak: over sorts last", r2[2].entrant.name, "Over");
  eq("tiebreak: names the separator", r2[0].separatedBy, "combined points, closest without going over");

  // Everyone over: fall back to closest absolute, then earliest submission.
  const allOver = [
    entrant("Way over", { mvp: "Josh Allen", sb_points: "90" }, 100, outcomes),
    entrant("Just over", { mvp: "Josh Allen", sb_points: "52" }, 200, outcomes),
  ];
  const r3 = rank(allOver, POOL.tiebreaks, outcomes);
  eq("tiebreak: all-over falls back to closest", r3[0].entrant.name, "Just over");

  const identical = [
    entrant("Later", { mvp: "Josh Allen", sb_points: "50" }, 900, outcomes),
    entrant("Earlier", { mvp: "Josh Allen", sb_points: "50" }, 100, outcomes),
  ];
  eq("tiebreak: earliest submission last resort", rank(identical, POOL.tiebreaks, outcomes)[0].entrant.name, "Earlier");
}

/* --------------------------------------------------------------- pots ---- */
{
  const pending = Object.fromEntries(POOL.questions.filter((x) => !x.gradeAgainst).map((x) => [x.id, readOutcome(x, { value: null }, ctx)]));
  const e = [entrant("Solo", { sb_champ: "Buffalo Bills", mvp: "Josh Allen" }, 100, pending)];
  const pendingPots = resolvePots(POOL, e, pending);
  eq("pots: pending before anything resolves", pendingPots.find((p) => p.config.id === "sb")!.state, "pending");
  check("pots: no crash with nothing resolved", pendingPots.every((p) => p.contenders.length >= 0));

  const settled = { ...pending, sb_champ: outcome("sb_champ", "Kansas City Chiefs"), mvp: outcome("mvp", "Josh Allen") };
  const e2 = [entrant("Missed", { sb_champ: "Buffalo Bills", mvp: "Josh Allen" }, 100, settled)];
  const pots = resolvePots(POOL, e2, settled);
  eq("pots: nobody hit it -> rollover", pots.find((p) => p.config.id === "sb")!.state, "rollover");
  eq("pots: rollover has no leader", pots.find((p) => p.config.id === "sb")!.leader, null);
  eq("pots: a hit pot is won", pots.find((p) => p.config.id === "mvp")!.state, "won");
  eq("pots: winner named", pots.find((p) => p.config.id === "mvp")!.leader!.entrant.name, "Missed");
}

/* ---------------------------------------------------------- clustering --- */
{
  const spellings = ["Puka Nacua", "Puca Nacua", "nacua", "Puka Nacua"].map((s) => resolve(s, "rec_yards"));
  const clusters = clusterAnswers(spellings, "person");
  eq("cluster: three spellings collapse to one bar", clusters.size, 1);
  eq("cluster: labelled by the commonest spelling", clusterLabel([...clusters.values()][0]), "Puka Nacua");

  const distinct = ["Josh Allen", "Lamar Jackson", "Patrick Mahomes"].map((s) => resolve(s, "mvp"));
  eq("cluster: different players stay apart", clusterAnswers(distinct, "person").size, 3);

  // The model records a team alongside its player picks; humans do not. If
  // clustering keyed on that team the model would sit alone in every player
  // question, reporting agreement as zero.
  const modelPick = { ...resolve("Myles Garrett", "dpoy"), team: "CLE" };
  const field = ["Myles Garrett (favorite)", "Garret", "Will Anderson Jr. (+500)"].map((x) => resolve(x, "dpoy"));
  const merged = clusterAnswers([modelPick, ...field], "person");
  const withModel = [...merged.values()].find((m) => m.includes(modelPick))!;
  eq("cluster: model joins the humans who agree", withModel.length, 3);
}

/* ---------------------------------------------------- comparison keys ---- */
{
  // A player question must compare on the name. The model carries a team for
  // its player picks and the humans do not, so falling back to the team scored
  // five people agreeing on Myles Garrett as nobody agreeing at all.
  const human = resolve("Myles Garrett (favorite)", "dpoy");
  const modelLike = { ...resolve("Myles Garrett", "dpoy"), team: "CLE" };
  eq("key: player question ignores the team", pickKey("person", modelLike), pickKey("person", human));

  const a = resolve("Buffalo Bills", "afc_east");
  const b = resolve("Bills", "afc_east");
  eq("key: team question uses the franchise", pickKey("team", a), pickKey("team", b));
  eq("key: team question is the id", pickKey("team", a), "BUF");
  eq("key: missing resolution has no key", pickKey("person", undefined), null);
}

/* --------------------------------------------------- shipped data files -- */
{
  const outcomeIds = Object.keys(results.outcomes);
  const expected = POOL.questions.filter((x) => !x.gradeAgainst).map((x) => x.id);
  eq("results key: one entry per question", outcomeIds.length, expected.length);
  check("results key: ids line up", expected.every((id) => outcomeIds.includes(id)), expected.filter((id) => !outcomeIds.includes(id)).join(","));
  check("results key: everything starts null", Object.values(results.outcomes).every((o) => (o as { value: unknown }).value === null));
  eq("entities: 32 franchises", entities.teams.length, 32);
  check("entities: no alias claimed twice", (() => {
    const seen = new Set<string>();
    for (const t of entities.teams) for (const a of t.aliases) { if (seen.has(a)) return false; seen.add(a); }
    return true;
  })());
  eq("pool: 16 scoring points on offer", POOL.questions.filter((x) => x.bucket === "division" || x.bucket === "award").reduce((n, x) => n + x.points, 0), 16);
  eq("pool: max total with the bonus", POOL.maxPoints, 18);

  // The model must have a position on every question — a pick or a stated
  // abstention. A question it simply forgot would score zero in silence.
  const covered = new Set([...Object.keys(model.picks), ...Object.keys(model.abstentions)]);
  const wanted = POOL.questions.map((x) => x.id);
  check("model: covers every question", wanted.every((id) => covered.has(id)), wanted.filter((id) => !covered.has(id)).join(","));
  check("model: nothing covered twice", !Object.keys(model.picks).some((id) => id in model.abstentions));
  const TIERS = ["modelled", "projected", "derived", "market"];
  check("model: every pick declares a basis tier",
    Object.values(model.picks).every((p) => TIERS.includes((p as { tier: string }).tier)));
  check("model: every pick explains itself",
    Object.values(model.picks).every((p) => ((p as { basis: string }).basis ?? "").length > 10));
  eq("model: four stat leaders are projected",
    Object.values(model.picks).filter((p) => (p as { tier: string }).tier === "projected").length, 4);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
