import type { PoolConfig, Question } from "@/lib/pools/types";
import { scoresToTotal } from "@/lib/pools/types";
import { canonicalKey } from "@/lib/resolve/normalize";
import { comparePerson, type ResolverContext } from "@/lib/resolve/match";
import { NEAR_MISS_THRESHOLD, type Resolution } from "@/lib/resolve/types";

/**
 * `pending` is the state this pool lives in for months, so it is a first-class
 * grade rather than a missing value: it is excluded from every denominator and
 * never renders as a miss.
 */
export type Grade = "correct" | "wrong" | "pending" | "void";

export interface Outcome {
  questionId: string;
  label: string;
  /** Exactly what is written in results-*.json. */
  raw: string | number | null;
  display: string;
  /** Canonical comparison key for person answers. */
  key: string;
  team: string | null;
  number: number | null;
  resolvedAt: string | null;
  source: string | null;
  /** Can never resolve (no coach was fired all season) — drops out of scoring. */
  void: boolean;
  /** No value yet. */
  pending: boolean;
}

export interface GradedPick {
  question: Question;
  resolution: Resolution;
  grade: Grade;
  points: number;
  /** True when the grade rests on a judgement call and wants a human's eye. */
  flagged: boolean;
  /** Why it graded the way it did — shown on the entrant page and in /admin. */
  note?: string;
}

export interface Entrant {
  id: string;
  name: string;
  submittedAt: string;
  submittedAtMs: number;
  isModel: boolean;
  /** Raw side-pot answer ("Yes" / "Maybe" / "No"). */
  sidePotAnswer: string | null;
  optedIntoSidePot: boolean;
  picks: Record<string, GradedPick>;
  /** Points from divisions + awards + the Dark Horse bonus. */
  points: number;
  divisionsCorrect: number;
  awardsCorrect: number;
  /** Correct across every question, scoring or not — the "fun" column. */
  totalCorrect: number;
  /** Questions with a settled outcome that this entrant was graded on. */
  gradedCount: number;
  flaggedCount: number;
  unresolvedCount: number;
}

/** Reads one outcome entry out of the hand-edited resolution key. */
export function readOutcome(
  question: Question,
  entry: Record<string, unknown> | undefined,
  ctx: ResolverContext,
): Outcome {
  const rawValue = (entry?.value ?? null) as string | number | null;
  const isVoid = entry?.void === true;
  const pending = rawValue === null || rawValue === "";

  let team = (entry?.team as string | null) ?? null;
  let display = rawValue === null ? "" : String(rawValue);
  let num: number | null = null;

  if (question.domain === "number") {
    num = typeof rawValue === "number" ? rawValue : rawValue === null ? null : Number(rawValue);
    if (num !== null && !Number.isFinite(num)) num = null;
  }

  // A team-question outcome may be written as a name or a 3-letter id; either
  // way it is stored back as the id so grading is a plain string compare.
  if (question.domain === "team" && !pending) {
    const key = canonicalKey(display);
    const match = ctx.teams.find((t) => t.aliases.some((a) => canonicalKey(a) === key));
    if (match) {
      team = match.id;
      display = match.name;
    }
  }

  return {
    questionId: question.id,
    label: question.label,
    raw: rawValue,
    display,
    key: canonicalKey(display),
    team,
    number: num,
    resolvedAt: (entry?.resolvedAt as string | null) ?? null,
    source: (entry?.source as string | null) ?? null,
    void: isVoid,
    pending,
  };
}

/**
 * Grade one answer against one outcome.
 *
 * A `flagged` result means "this was scored, but by a route that could be wrong":
 * a fuzzy spelling match, or a coach question answered with a team name. Those
 * are always surfaced on /admin — the pool rule is that nothing is ever quietly
 * graded on a guess.
 */
export function gradePick(question: Question, resolution: Resolution, outcome: Outcome | undefined): GradedPick {
  const base = { question, resolution, flagged: resolution.status === "flagged" };

  if (!outcome || outcome.void) {
    return { ...base, grade: "void", points: 0, note: outcome?.void ? "Question voided — never happened" : "No outcome entry" };
  }
  if (outcome.pending) {
    return { ...base, grade: "pending", points: 0 };
  }

  // Answered badly or not at all: zero, with the reason preserved for display.
  if (resolution.status === "abstained" || resolution.status === "multi" || resolution.status === "unresolved") {
    return { ...base, grade: "wrong", points: 0, note: resolution.note };
  }

  const award = (hit: boolean, note?: string, flagged = base.flagged): GradedPick => ({
    ...base,
    flagged,
    grade: hit ? "correct" : "wrong",
    // The tiebreaker and the fun columns are displayed but never add to the total.
    points: hit && scoresToTotal(question.bucket) ? question.points : 0,
    note,
  });

  if (question.domain === "team") {
    return award(!!resolution.team && resolution.team === outcome.team);
  }

  if (question.domain === "number") {
    return award(resolution.number !== null && resolution.number === outcome.number, "Tiebreaker — never worth points");
  }

  // A coach question answered with a franchise grades on the franchise.
  if (question.domain === "coach" && resolution.team) {
    if (!outcome.team) {
      return {
        ...base,
        grade: "wrong",
        points: 0,
        flagged: true,
        note: `Answered with a team (${resolution.team}) but the outcome has no \`team\` set — add it in results-26-27.json`,
      };
    }
    return award(resolution.team === outcome.team, resolution.note);
  }

  const cmp = comparePerson(resolution.value ?? "", outcome.key);
  const fuzzy = cmp.hit && cmp.method === "fuzzy";
  const nearMiss = !cmp.hit && cmp.confidence >= NEAR_MISS_THRESHOLD;

  const note = fuzzy
    ? `Fuzzy match to "${outcome.display}" (${cmp.confidence.toFixed(2)}) — confirm in /admin`
    : nearMiss
      ? `Close to "${outcome.display}" (${cmp.confidence.toFixed(2)}) but not close enough to score. If this was meant to be the right answer, add it to aliases.json.`
      : undefined;

  return award(cmp.hit, note, base.flagged || fuzzy || nearMiss);
}

/** Grade an entrant's whole card and roll up their totals. */
export function scoreEntrant(
  pool: PoolConfig,
  entrant: Omit<Entrant, "picks" | "points" | "divisionsCorrect" | "awardsCorrect" | "totalCorrect" | "gradedCount" | "flaggedCount" | "unresolvedCount">,
  resolutions: Record<string, Resolution>,
  outcomes: Record<string, Outcome>,
): Entrant {
  const picks: Record<string, GradedPick> = {};
  let points = 0;
  let divisionsCorrect = 0;
  let awardsCorrect = 0;
  let totalCorrect = 0;
  let gradedCount = 0;
  let flaggedCount = 0;
  let unresolvedCount = 0;

  for (const question of pool.questions) {
    const resolution = resolutions[question.id];
    if (!resolution) continue;

    // The Dark Horse bonus is graded against another question's outcome.
    const outcomeId = question.gradeAgainst ?? question.id;
    const graded = gradePick(question, resolution, outcomes[outcomeId]);
    picks[question.id] = graded;

    points += graded.points;
    if (graded.grade === "correct") {
      totalCorrect++;
      if (question.bucket === "division") divisionsCorrect++;
      if (question.bucket === "award") awardsCorrect++;
    }
    if (graded.grade === "correct" || graded.grade === "wrong") gradedCount++;
    if (graded.flagged) flaggedCount++;
    if (resolution.status === "unresolved") unresolvedCount++;
  }

  return { ...entrant, picks, points, divisionsCorrect, awardsCorrect, totalCorrect, gradedCount, flaggedCount, unresolvedCount };
}
