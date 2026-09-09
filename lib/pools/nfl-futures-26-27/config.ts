import type { PoolConfig, Question } from "@/lib/pools/types";

/**
 * The 2026-27 NFL futures pool.
 *
 * `match` strings are compared against the *normalized* sheet header (lowercased,
 * punctuation stripped, whitespace collapsed — see `lib/sheets/headers.ts`), so
 * rewording a question next season only needs a new entry in its `match` array.
 * Column order is never assumed.
 */

const q = (
  id: string,
  label: string,
  match: string[],
  domain: Question["domain"],
  bucket: Question["bucket"],
  points: number,
  section: string,
  extra: Partial<Question> = {},
): Question => ({ id, label, match, domain, bucket, points, section, ...extra });

const DIVISIONS: Question[] = [
  ["afc_east", "AFC East"],
  ["afc_north", "AFC North"],
  ["afc_south", "AFC South"],
  ["afc_west", "AFC West"],
  ["nfc_east", "NFC East"],
  ["nfc_north", "NFC North"],
  ["nfc_south", "NFC South"],
  ["nfc_west", "NFC West"],
].map(([id, label]) => q(id, label, [`${label.toLowerCase()} winner`], "team", "division", 1, "Division winners"));

export const NFL_FUTURES_26_27: PoolConfig = {
  slug: "nfl-futures-26-27",
  title: "NFL Futures 2026-27",
  blurb: "Friend-group futures pool, graded live against the season — and against the model.",
  season: "2026-27",
  sheetId: "1QOYnNSYzYgkmpiG8_nTSOkpNDsoE1abIVrxBdum7sOE",
  nameColumn: ["name"],
  timestampColumn: ["timestamp"],
  sidePotColumn: {
    match: ["maybe interested in side pot", "side pot"],
    optedIn: ["yes", "maybe"],
  },
  questions: [
    ...DIVISIONS,

    // ---- the eight scoring awards (1pt each) ----
    q("mvp", "MVP", ["mvp"], "person", "award", 1, "Awards"),
    q("opoy", "Offensive Player of the Year", ["offensive player of the year"], "person", "award", 1, "Awards"),
    q("dpoy", "Defensive Player of the Year", ["defensive player of the year"], "person", "award", 1, "Awards"),
    q("oroy", "Offensive Rookie of the Year", ["offensive rookie of the year"], "person", "award", 1, "Awards"),
    q("droy", "Defensive Rookie of the Year", ["defensive rookie of the year"], "person", "award", 1, "Awards"),
    q("cpoy", "Comeback Player of the Year", ["comeback player of the year"], "person", "award", 1, "Awards"),
    q("coy", "Coach of the Year", ["coach of the year"], "coach", "award", 1, "Awards"),
    q("sb_mvp", "Super Bowl LXI MVP", ["super bowl lxi mvp", "super bowl mvp"], "person", "award", 1, "Awards"),

    // ---- bonus: Dark Horse graded against the *real MVP* ----
    q("dark_horse", "Dark Horse MVP", ["dark horse mvp"], "person", "bonus", 2, "Awards", { gradeAgainst: "mvp" }),

    // ---- mini pots ----
    q("sb_champ", "Super Bowl LXI Champion", ["super bowl lxi champion", "super bowl champion"], "team", "pot", 0, "Super Bowl"),
    q("sb_points", "Combined points, Super Bowl LXI", ["tiebreaker total combined points", "total combined points"], "number", "tiebreak", 0, "Super Bowl"),

    // ---- fun columns: shown, never scored ----
    q("afc_one_seed", "1 seed in the AFC", ["1 seed in the afc"], "team", "fun", 0, "Seeding & records"),
    q("nfc_one_seed", "1 seed in the NFC", ["1 seed in the nfc"], "team", "fun", 0, "Seeding & records"),
    q("most_wins", "Most wins, both conferences", ["most wins both conferences", "most wins"], "team", "fun", 0, "Seeding & records"),
    q("worst_record", "Worst record in the league", ["worst record in the league", "worst record"], "team", "fun", 0, "Seeding & records"),
    q("afc_champ", "AFC Champion", ["afc champion"], "team", "fun", 0, "Conference titles"),
    q("nfc_champ", "NFC Champion", ["nfc champion"], "team", "fun", 0, "Conference titles"),
    q("pass_yards", "Passing yards leader", ["passing yards leader"], "person", "fun", 0, "Stat leaders"),
    q("rush_yards", "Rushing yards leader", ["rushing yards leader"], "person", "fun", 0, "Stat leaders"),
    q("rec_yards", "Receiving yards leader", ["receiving yards leader"], "person", "fun", 0, "Stat leaders"),
    q("sacks", "Sack leader", ["sack leader"], "person", "fun", 0, "Stat leaders"),
    q("first_fired", "First head coach fired", ["first head coach fired"], "coach", "fun", 0, "Hot seat"),
    q("first_benched", "First Week 1 starting QB benched", ["first week 1 starting qb to get benched", "first qb benched"], "person", "fun", 0, "Hot seat"),
  ],

  pots: [
    {
      id: "champ",
      name: "Overall Champ",
      question: "",
      blurb: "16 points across eight division winners and eight awards, plus two for a Dark Horse MVP that lands.",
    },
    {
      id: "sb",
      name: "Super Bowl Champ",
      question: "sb_champ",
      blurb: "Whoever picked the Super Bowl LXI winner.",
    },
    { id: "mvp", name: "MVP", question: "mvp", blurb: "Whoever picked the league MVP." },
  ],

  // Applied in order to break equal point totals.
  tiebreaks: [
    { kind: "bucket-count", bucket: "award", label: "most awards correct" },
    { kind: "closest-under", question: "sb_points", label: "combined points, closest without going over" },
    { kind: "earliest-submission", label: "earliest submission" },
  ],

  maxPoints: 18, // 8 divisions + 8 awards + 2 Dark Horse bonus
};

/** Tiebreak chain for the two mini pots (main-pot points are irrelevant there). */
export const MINI_POT_TIEBREAKS: PoolConfig["tiebreaks"] = [
  { kind: "bucket-count", bucket: "division", label: "most division winners correct" },
  { kind: "closest-under", question: "sb_points", label: "combined points, closest without going over" },
  { kind: "earliest-submission", label: "earliest submission" },
];
