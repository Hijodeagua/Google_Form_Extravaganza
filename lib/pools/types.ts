/**
 * Pool-agnostic vocabulary. Everything football-specific lives in a pool's own
 * `config.ts` + `data/<slug>/` folder, so an NBA futures pool, the EDH survey or
 * the gingerbread race is a new config and a new data directory — never a change
 * in `lib/scoring`, `lib/resolve` or `lib/sheets`.
 */

/** How an answer is interpreted and compared. */
export type Domain =
  /** One of the 32 NFL franchises; matched against `data/<slug>/entities.json`. */
  | "team"
  /** A human name. No roster is required: answers are clustered against each
   *  other for the distribution view, and graded against the outcome string. */
  | "person"
  /** A human name that may instead be given as a team ("Panthers coach",
   *  "Arizona"), in which case it grades against the outcome's `team`. */
  | "coach"
  /** A bare integer (the Super Bowl points tiebreaker). */
  | "number"
  /** A fixed set of options (the side-pot Yes/No/Maybe column). */
  | "choice";

/**
 * What a question is worth. Only `division` and `award` feed the 16-point
 * total; everything else is displayed but kept out of the standings.
 */
export type Bucket =
  | "division" // 8 × 1pt
  | "award" //    8 × 1pt
  | "bonus" //    Dark Horse MVP: +2 if it matches the real MVP
  | "pot" //      Super Bowl champion — mini pot only, no points
  | "tiebreak" // combined points — ordering only, no points
  | "fun"; //     1 seeds, stat leaders, first fired/benched — displayed only

export interface Question {
  /** Stable key. Used in `results-*.json`, `aliases.json` and every URL. */
  id: string;
  /** Short label for tables and cards. */
  label: string;
  /**
   * Substrings matched (after normalization) against the sheet's header row.
   * Never a column index: the wording changes between seasons, the position
   * does not need to. The first header matching ANY entry wins.
   */
  match: string[];
  domain: Domain;
  bucket: Bucket;
  /** Points awarded for a correct answer. Ignored unless bucket scores. */
  points: number;
  /** For `bonus`: the question id whose *outcome* this answer is graded against. */
  gradeAgainst?: string;
  /** Display grouping on the entrant and distribution pages. */
  section: string;
  /** Allowed values for `choice` questions. */
  choices?: string[];
}

export interface PotConfig {
  id: string;
  name: string;
  /** Question whose correct answer wins the pot. */
  question: string;
  blurb: string;
}

export interface PoolConfig {
  slug: string;
  title: string;
  /** One-line description used on the index card and the page hero. */
  blurb: string;
  season: string;
  sheetId: string;
  /** Header text of the respondent-name column. */
  nameColumn: string[];
  /** Header text of the submission-timestamp column. */
  timestampColumn: string[];
  /** Optional opt-in column that drives the side-pot filter. */
  sidePotColumn?: { match: string[]; optedIn: string[] };
  questions: Question[];
  pots: PotConfig[];
  /**
   * Ordered tiebreak chain applied to equal point totals. Each entry names a
   * comparator implemented in `lib/scoring/tiebreak.ts`.
   */
  tiebreaks: TiebreakRule[];
  /** Max total, derived — kept here so the UI never recomputes it inline. */
  maxPoints: number;
}

export type TiebreakRule =
  | { kind: "bucket-count"; bucket: Bucket; label: string }
  | { kind: "closest-under"; question: string; label: string }
  | { kind: "earliest-submission"; label: string };

export const scoresToTotal = (b: Bucket) => b === "division" || b === "award" || b === "bonus";
