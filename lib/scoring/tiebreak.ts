import type { TiebreakRule } from "@/lib/pools/types";
import type { Entrant, Outcome } from "./engine";

/**
 * Ordered tiebreaking that reports *which* rule did the separating, so the
 * standings can show "separated on combined points" next to the rows it applied
 * to rather than silently reordering them.
 */

export interface RankedEntrant {
  entrant: Entrant;
  rank: number;
  /** True when this row shares its primary score with another row. */
  tied: boolean;
  /** Label of the rule that broke the tie, if one did. */
  separatedBy: string | null;
}

type Compare = (a: Entrant, b: Entrant) => number;

function comparator(rule: TiebreakRule, outcomes: Record<string, Outcome>): Compare {
  switch (rule.kind) {
    case "bucket-count": {
      const field = rule.bucket === "division" ? "divisionsCorrect" : "awardsCorrect";
      return (a, b) => b[field] - a[field]; // more is better
    }

    case "closest-under": {
      const outcome = outcomes[rule.question];
      // Nothing to compare on until the game is played.
      if (!outcome || outcome.pending || outcome.number === null) return () => 0;
      const actual = outcome.number;

      // Price-is-right: closest without going over wins. When *nobody* is under,
      // that rule cannot separate anyone, so fall back to closest in absolute
      // terms rather than declaring an unbreakable tie.
      const guess = (e: Entrant) => e.picks[rule.question]?.resolution.number ?? null;
      return (a, b) => {
        const ga = guess(a);
        const gb = guess(b);
        if (ga === null && gb === null) return 0;
        if (ga === null) return 1; // no guess sorts last
        if (gb === null) return -1;

        const aUnder = ga <= actual;
        const bUnder = gb <= actual;
        if (aUnder !== bUnder) return aUnder ? -1 : 1;
        return Math.abs(actual - ga) - Math.abs(actual - gb);
      };
    }

    case "earliest-submission":
      return (a, b) => a.submittedAtMs - b.submittedAtMs;
  }
}

/**
 * Rank by points, then walk the configured chain. Entrants sharing a points
 * total are marked `tied`, and the first rule that actually separates them is
 * recorded on every row in that group.
 */
export function rank(entrants: Entrant[], rules: TiebreakRule[], outcomes: Record<string, Outcome>, primary: (e: Entrant) => number = (e) => e.points): RankedEntrant[] {
  const comparators = rules.map((r) => ({ rule: r, cmp: comparator(r, outcomes) }));

  const sorted = [...entrants].sort((a, b) => {
    const byPrimary = primary(b) - primary(a);
    if (byPrimary !== 0) return byPrimary;
    for (const { cmp } of comparators) {
      const d = cmp(a, b);
      if (d !== 0) return d;
    }
    // Fully tied: stable and deterministic on name so renders do not shuffle.
    return a.name.localeCompare(b.name);
  });

  // Group by primary score to find who was actually tied, and on what.
  const out: RankedEntrant[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && primary(sorted[j + 1]) === primary(sorted[i])) j++;

    const group = sorted.slice(i, j + 1);
    let separatedBy: string | null = null;
    if (group.length > 1) {
      for (const { rule, cmp } of comparators) {
        if (group.some((e, k) => k > 0 && cmp(group[k - 1], e) !== 0)) {
          separatedBy = rule.label;
          break;
        }
      }
    }

    group.forEach((entrant, k) => {
      out.push({ entrant, rank: i + k + 1, tied: group.length > 1, separatedBy });
    });
    i = j + 1;
  }

  return out;
}
