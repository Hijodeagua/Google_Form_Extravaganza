import type { PoolConfig, PotConfig } from "@/lib/pools/types";
import { MINI_POT_TIEBREAKS } from "@/lib/pools/nfl-futures-26-27/config";
import type { Entrant, Outcome } from "./engine";
import { rank, type RankedEntrant } from "./tiebreak";

export type PotState =
  /** The question has not settled yet. */
  | "pending"
  /** Settled and somebody hit it. */
  | "won"
  /** Settled and nobody hit it — the pot rolls over. */
  | "rollover";

export interface PotResult {
  config: PotConfig;
  state: PotState;
  /** Everyone still alive, ranked. Empty on a rollover. */
  contenders: RankedEntrant[];
  /** The single leader, when one is separable. */
  leader: RankedEntrant | null;
  outcome: Outcome | null;
  /** Which tiebreak rule decided it, if any. */
  separatedBy: string | null;
}

/**
 * Resolve the three pots.
 *
 * The mini pots need an explicit no-winner path: if nobody picked the champion,
 * the pot is `rollover` — not "awarded to the closest", and not a crash on an
 * empty array.
 */
export function resolvePots(pool: PoolConfig, entrants: Entrant[], outcomes: Record<string, Outcome>): PotResult[] {
  return pool.pots.map((config) => {
    // The overall pot is the main standings, so it has no gating question.
    if (!config.question) {
      const ranked = rank(entrants, pool.tiebreaks, outcomes);
      return {
        config,
        state: ranked.some((r) => r.entrant.gradedCount > 0) ? "won" : "pending",
        contenders: ranked,
        leader: ranked[0] ?? null,
        outcome: null,
        separatedBy: ranked[0]?.separatedBy ?? null,
      };
    }

    const outcome = outcomes[config.question] ?? null;
    if (!outcome || outcome.pending) {
      return { config, state: "pending", contenders: [], leader: null, outcome, separatedBy: null };
    }

    const hits = entrants.filter((e) => e.picks[config.question]?.grade === "correct");
    if (hits.length === 0) {
      return { config, state: "rollover", contenders: [], leader: null, outcome, separatedBy: null };
    }

    // Main-pot points are irrelevant here: the mini pots break ties on division
    // winners, then combined points, then submission time.
    const ranked = rank(hits, MINI_POT_TIEBREAKS, outcomes, () => 0);
    return {
      config,
      state: "won",
      contenders: ranked,
      leader: ranked[0] ?? null,
      outcome,
      separatedBy: ranked[0]?.separatedBy ?? null,
    };
  });
}
