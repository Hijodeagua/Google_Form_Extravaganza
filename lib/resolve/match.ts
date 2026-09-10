import type { Domain } from "@/lib/pools/types";
import {
  canonicalKey,
  diceCoefficient,
  displayValue,
  isMultiAnswer,
  isNonAnswer,
  parseNumber,
  surname,
} from "./normalize";
import { FUZZY_THRESHOLD, type Resolution } from "./types";

export interface TeamEntity {
  id: string;
  name: string;
  city: string;
  nickname: string;
  conference: string;
  division: string;
  aliases: string[];
}

/** `aliases.json`: a hand-edited escape hatch that always wins. */
export interface AliasMap {
  /** Applies to every question. normalized answer -> canonical answer. */
  global: Record<string, string>;
  /** question id -> (normalized answer -> canonical answer). Beats `global`. */
  byQuestion: Record<string, Record<string, string>>;
}

export interface ResolverContext {
  teams: TeamEntity[];
  aliases: AliasMap;
}

const unresolved = (raw: string, note: string, candidates?: string[]): Resolution => ({
  raw,
  display: displayValue(raw),
  value: null,
  status: "unresolved",
  method: "none",
  confidence: 0,
  note,
  candidates,
});

/** Team lookup over id, full name, city, nickname and hand-added aliases. */
function findTeam(key: string, teams: TeamEntity[]): TeamEntity | null {
  for (const t of teams) {
    if (t.aliases.some((a) => canonicalKey(a) === key)) return t;
  }
  return null;
}

function fuzzyTeam(key: string, teams: TeamEntity[]): { team: TeamEntity; score: number } | null {
  let best: { team: TeamEntity; score: number } | null = null;
  for (const t of teams) {
    for (const a of t.aliases) {
      const score = diceCoefficient(key, canonicalKey(a));
      if (!best || score > best.score) best = { team: t, score };
    }
  }
  return best;
}

/**
 * Resolve one answer.
 *
 * Order matters and is deliberate: the hand-written alias map beats everything
 * (it is how Tre overrules this function), then exact identity, then the routes
 * that involve a judgement call. Anything reached by a judgement call comes back
 * `flagged` rather than `resolved`, so it is scored but never silently — that is
 * the "never auto-grade a fuzzy match without flagging it" rule, enforced here
 * rather than at the call site.
 */
export function resolveAnswer(raw: string, domain: Domain, questionId: string, ctx: ResolverContext): Resolution {
  const display = displayValue(raw);
  const key = canonicalKey(raw);
  const base = { raw, display };

  // 1. Alias map — the manual override, checked before anything else so it can
  //    rescue answers the rules below would reject (including multi-name ones).
  const perQuestion = ctx.aliases.byQuestion[questionId]?.[key];
  const aliased = perQuestion ?? ctx.aliases.global[key];
  if (aliased !== undefined) {
    if (domain === "team") {
      const t = findTeam(canonicalKey(aliased), ctx.teams);
      if (t) return { ...base, value: t.id, team: t.id, status: "resolved", method: "alias", confidence: 1 };
    }
    return {
      ...base,
      value: canonicalKey(aliased),
      canonical: aliased,
      status: "resolved",
      method: "alias",
      confidence: 1,
      note: `Alias map: "${display}" -> "${aliased}"`,
    };
  }

  if (isNonAnswer(raw)) {
    return { ...base, value: null, status: "abstained", method: "none", confidence: 0, note: "Left blank or answered with a non-answer" };
  }

  if (domain === "number") {
    const n = parseNumber(raw);
    if (n === null) return unresolved(raw, "Expected a number");
    return { ...base, value: String(n), number: n, status: "resolved", method: "number", confidence: 1 };
  }

  if (domain === "choice") {
    return { ...base, value: key, status: "resolved", method: "choice", confidence: 1 };
  }

  // 2. Two names in one box — not a pick, by pool rule. The alias map above is
  //    the only way to turn one of these into a scored answer.
  if (isMultiAnswer(raw)) {
    return { ...base, value: null, status: "multi", method: "none", confidence: 0, note: `Two answers in one box — scored zero unless added to aliases.json` };
  }

  if (domain === "team") {
    const exact = findTeam(key, ctx.teams);
    if (exact) return { ...base, value: exact.id, team: exact.id, status: "resolved", method: "exact", confidence: 1 };

    const near = fuzzyTeam(key, ctx.teams);
    if (near && near.score >= FUZZY_THRESHOLD) {
      return {
        ...base,
        value: near.team.id,
        team: near.team.id,
        status: "flagged",
        method: "fuzzy",
        confidence: near.score,
        note: `Fuzzy match to ${near.team.name} (${near.score.toFixed(2)}) — confirm or add to aliases.json`,
      };
    }
    return unresolved(raw, "No franchise matched", near ? [near.team.name] : undefined);
  }

  // 3. Coach questions accept a franchise instead of a name ("Panthers coach",
  //    "Arizona"). We resolve to the *team*, not to a person: the outcome entry
  //    in results-*.json carries the coach's team, so grading compares team to
  //    team and no head-coach roster has to be kept current anywhere.
  if (domain === "coach") {
    const stripped = canonicalKey(key.replace(/\b(head )?coach\b/g, ""));
    const t = findTeam(stripped, ctx.teams) ?? findTeam(key, ctx.teams);
    if (t) {
      return {
        ...base,
        value: null,
        team: t.id,
        status: "flagged",
        method: "team-ref",
        confidence: 0.9,
        note: `Read as "whoever coaches the ${t.nickname}" — grades against the outcome's team`,
      };
    }
  }

  // 4. A person's name. There is no roster to match against, and deliberately
  //    so: the answer is compared to the actual outcome at grading time (see
  //    lib/scoring/engine.ts), which is the only string that is ever definitive.
  return { ...base, value: key, status: "resolved", method: "exact", confidence: 1 };
}

/**
 * Compare a resolved person answer against the resolved outcome. Returns a
 * confidence, so the caller can decide whether the hit needs flagging.
 *
 * Handles the three shapes the sheet actually contains: the full name, the bare
 * surname ("Rodgers", "nacua"), and a near-miss spelling ("Saquan" for Saquon,
 * "Garret" for Garrett).
 */
export function comparePerson(answerKey: string, outcomeKey: string): { hit: boolean; confidence: number; method: "exact" | "surname" | "fuzzy" | "none" } {
  if (!answerKey || !outcomeKey) return { hit: false, confidence: 0, method: "none" };
  if (answerKey === outcomeKey) return { hit: true, confidence: 1, method: "exact" };

  // A single word that matches either name part: "Rodgers" -> "Aaron Rodgers",
  // "Mahomes" -> "Patrick Mahomes", and first names like "Saquon".
  const parts = outcomeKey.split(" ");
  if (!answerKey.includes(" ") && parts.includes(answerKey)) {
    return { hit: true, confidence: 0.95, method: "surname" };
  }

  // Names run two or three words. Anything longer is a name with commentary
  // stuck to it ("Micah Parson beast mode post-injury"), so the leading words
  // get a look of their own.
  const words = answerKey.split(" ");
  const candidates = words.length > 3 ? [answerKey, words.slice(0, 2).join(" "), words.slice(0, 3).join(" ")] : [answerKey];

  let score = 0;
  for (const candidate of candidates) {
    score = Math.max(score, diceCoefficient(candidate, outcomeKey));
    if (!candidate.includes(" ")) score = Math.max(score, diceCoefficient(surname(candidate), surname(outcomeKey)));
    if (candidate.includes(" ")) score = Math.max(score, diceCoefficient(surname(candidate), surname(outcomeKey)) * 0.95);
  }

  if (score >= FUZZY_THRESHOLD) return { hit: true, confidence: score, method: "fuzzy" };
  return { hit: false, confidence: score, method: "none" };
}

/**
 * Cluster raw answers to the same question so the distribution view shows one
 * bar for "Puka Nacua", "Puca Nacua" and "nacua". Runs without any outcome being
 * known, which is the state this page lives in for most of the season.
 */
export function clusterAnswers(resolutions: Resolution[]): Map<string, Resolution[]> {
  const clusters = new Map<string, Resolution[]>();

  for (const r of resolutions) {
    const key = r.team ?? r.value;
    if (!key) continue;

    // Exact key hit first; otherwise look for a cluster close enough to merge.
    let target = clusters.has(key) ? key : null;
    if (!target && !r.team) {
      for (const existing of clusters.keys()) {
        const whole = diceCoefficient(key, existing);
        const bySurname = !key.includes(" ") || !existing.includes(" ") ? diceCoefficient(surname(key), surname(existing)) : 0;
        if (Math.max(whole, bySurname) >= 0.8) {
          target = existing;
          break;
        }
      }
    }
    if (!target) target = key;
    (clusters.get(target) ?? clusters.set(target, []).get(target)!).push(r);
  }

  return clusters;
}

/**
 * The label a cluster shows. An alias-corrected spelling wins outright (the map
 * is a human saying what this answer really is); otherwise the most common raw
 * spelling, ties broken toward the longer one, so "Puka Nacua" beats "nacua".
 */
export function clusterLabel(members: Resolution[]): string {
  const corrected = members.find((m) => m.canonical);
  if (corrected) return corrected.canonical!;
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.display, (counts.get(m.display) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}
