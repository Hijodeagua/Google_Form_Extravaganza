export type ResolutionStatus =
  /** Confidently mapped to a canonical value. */
  | "resolved"
  /** Mapped, but by a route that could be wrong — always surfaced in /admin. */
  | "flagged"
  /** Deliberately left blank ("???", "Dont know"). Scores zero, not a data problem. */
  | "abstained"
  /** Two names in one box. Scores zero by pool rule. */
  | "multi"
  /** Could not be mapped. Scores zero and lands in the /admin fix queue. */
  | "unresolved";

export type ResolutionMethod =
  | "alias" //     hand-written entry in aliases.json
  | "exact" //     canonical name or team alias hit
  | "team-ref" //  a team name given for a coach question ("Panthers coach")
  | "surname" //   unique surname match against the outcome
  | "fuzzy" //     bigram similarity above threshold — never silent
  | "number"
  | "choice"
  | "none";

export interface Resolution {
  /** Exactly what the entrant typed. Always what gets displayed. */
  raw: string;
  /** Raw with odds/qualifier parentheticals and ", QB, Team" suffixes removed. */
  display: string;
  /** Comparison key, or a team id for `team` questions. */
  value: string | null;
  /** Team id when the answer names (or implies) a franchise. */
  team?: string | null;
  /** Parsed integer for `number` questions. */
  number?: number | null;
  status: ResolutionStatus;
  method: ResolutionMethod;
  /** 0..1. Anything below 1 that still resolved is `flagged`, never silent. */
  confidence: number;
  /** The value an alias mapped this to, when one did. Preferred as a label. */
  canonical?: string;
  /** Human-readable reason, shown verbatim in /admin. */
  note?: string;
  /** Candidate canonical values when the answer was ambiguous. */
  candidates?: string[];
}

/**
 * Fuzzy matches at or above this bigram similarity are used, but always as
 * `flagged` so they show up in /admin for a human to confirm or override.
 * Below it, the answer is left unresolved rather than guessed at.
 */
export const FUZZY_THRESHOLD = 0.72;

/**
 * A person answer that misses the outcome but scores at least this is close
 * enough that a mangled spelling is the likely cause rather than a genuinely
 * different pick. It still scores zero, but it is flagged for review instead of
 * quietly counting as wrong — "Sequan barkly" against Saquon Barkley lands here.
 */
export const NEAR_MISS_THRESHOLD = 0.5;
