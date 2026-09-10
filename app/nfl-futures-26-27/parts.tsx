import type { GradedPick, Outcome } from "@/lib/scoring/engine";
import type { PotResult } from "@/lib/scoring/pots";

/**
 * Season progress, read as field position rather than a percentage: the ball
 * starts on its own goal line and the chalk hashes are every ten yards. It is
 * the same number either way, but this is a football pool.
 */
export function Progress({ resolved, total }: { resolved: number; total: number }) {
  const pct = total ? (resolved / total) * 100 : 0;
  const yardLine = Math.round(pct);
  return (
    <div className="progress">
      <div className="ptop">
        <span className="lab">
          <b>{resolved}</b> of {total} outcomes settled
        </span>
        <span className={`lab ${resolved === total && total > 0 ? "done" : ""}`}>
          {resolved === 0 ? "Own goal line" : resolved === total ? "Touchdown" : `${yardLine} yard line`}
        </span>
      </div>
      <div className="yardage">
        <span className="gained" style={{ width: `${pct}%` }} />
        <span className="ball" style={{ left: `${Math.min(Math.max(pct, 2), 98)}%` }} aria-hidden>
          🏈
        </span>
      </div>
    </div>
  );
}

export function PotCard({ pot }: { pot: PotResult }) {
  const label = pot.state === "won" ? "Leader" : pot.state === "rollover" ? "Rolling over" : "Pending";
  return (
    <div className={`pot ${pot.state === "won" ? "is-won" : ""}`}>
      <div className="pt">{pot.config.id === "champ" ? "Main pot" : "Mini pot"}</div>
      <div className="pn">{pot.config.name}</div>
      <div className="pb">{pot.config.blurb}</div>

      {pot.state === "won" && pot.leader ? (
        <>
          <span className="pstate won">{label}</span>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {pot.leader.entrant.name}
            {pot.contenders.length > 1 && (
              <span className="t-dim" style={{ fontWeight: 400 }}> +{pot.contenders.length - 1} still alive</span>
            )}
          </div>
          {pot.separatedBy && <div className="sep-note">Separated on {pot.separatedBy}</div>}
        </>
      ) : pot.state === "rollover" ? (
        <>
          <span className="pstate rollover">Rolling over</span>
          <div className="t-mut" style={{ fontSize: 13 }}>
            Nobody picked {pot.outcome?.display}. The pot carries.
          </div>
        </>
      ) : (
        <>
          <span className="pstate pending">{label}</span>
          <div className="t-dim" style={{ fontSize: 13 }}>Undecided</div>
        </>
      )}
    </div>
  );
}

const GRADE_TEXT: Record<GradedPick["grade"], string> = {
  correct: "✓ Correct",
  wrong: "✗ Missed",
  pending: "Pending",
  void: "Voided",
};

const GRADE_CLASS: Record<GradedPick["grade"], string> = {
  correct: "t-ok",
  wrong: "t-bad",
  pending: "t-pend",
  void: "t-dim",
};

/** One question on the entrant page: what they said, how it graded, what happened. */
export function PickRow({ pick, outcome }: { pick: GradedPick; outcome?: Outcome }) {
  const { resolution, question } = pick;
  const answered = resolution.status !== "abstained" && resolution.display !== "";
  const isModelAbstention = !answered && resolution.note && resolution.raw === "";

  return (
    <div className={`pick ${pick.grade}`}>
      <div className="q">{question.label}</div>

      <div className={`a ${answered ? "" : "none"}`}>
        {isModelAbstention ? (
          <span className="abstain">
            <span className="strike">abstained</span> — {resolution.note}
          </span>
        ) : answered ? (
          <>
            {resolution.canonical ?? resolution.display}
            {/* Show what they actually typed whenever we changed it. */}
            {(resolution.canonical || resolution.display !== resolution.raw.trim()) && (
              <span className="rawnote">typed &ldquo;{resolution.raw.trim()}&rdquo;</span>
            )}
            {resolution.status === "multi" && <span className="rawnote">two answers in one box — scored zero</span>}
          </>
        ) : (
          "no answer"
        )}

        {pick.grade === "wrong" && outcome && !outcome.pending && (
          <span className="actual">Actual: {outcome.display}</span>
        )}
      </div>

      <div className={`g ${GRADE_CLASS[pick.grade]}`}>
        {GRADE_TEXT[pick.grade]}
        {pick.points > 0 && <span className="t-mut"> +{pick.points}</span>}
        {pick.flagged && (
          <div>
            <span className="badge flag">flagged</span>
          </div>
        )}
      </div>
    </div>
  );
}
