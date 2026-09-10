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

/* ------------------------------------------------------------------ pies -- */

export interface Slice {
  key: string;
  label: string;
  count: number;
  names: string[];
  modelPicked: boolean;
  correct: boolean | null;
}

/**
 * Categorical slice colours. The model always takes the cyan so it is findable
 * at a glance across every chart; everything else cycles the rest of the theme's
 * hues in a fixed order, so a given question renders the same way every load.
 */
const MODEL_COLOR = "#41e0ff";
const SLICE_COLORS = ["#2fbf6b", "#ffd23f", "#9b7bff", "#ff9f45", "#4bd6a8", "#ff2e88", "#7f8cff", "#d94f7a", "#c9b458"];

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
};

/** Donut wedge between two angles. A full circle needs two arcs, not one. */
function wedge(cx: number, cy: number, rOuter: number, rInner: number, from: number, to: number): string {
  if (to - from >= 359.999) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `M ${cx} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx - 0.01} ${cy - rInner}`,
      "Z",
    ].join(" ");
  }
  const [x1, y1] = polar(cx, cy, rOuter, to);
  const [x2, y2] = polar(cx, cy, rOuter, from);
  const [x3, y3] = polar(cx, cy, rInner, from);
  const [x4, y4] = polar(cx, cy, rInner, to);
  const large = to - from > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export function PickPie({ slices, total }: { slices: Slice[]; total: number }) {
  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 78;
  const rInner = 44;

  let angle = 0;
  const drawn = slices.map((s, i) => {
    const sweep = total > 0 ? (s.count / total) * 360 : 0;
    const path = wedge(cx, cy, rOuter, rInner, angle, angle + sweep);
    angle += sweep;
    return {
      ...s,
      path,
      color: s.modelPicked ? MODEL_COLOR : SLICE_COLORS[i % SLICE_COLORS.length],
      pct: total > 0 ? (s.count / total) * 100 : 0,
    };
  });

  return (
    <div className="pie-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="pie" role="img" aria-label={drawn.map((d) => `${d.label} ${Math.round(d.pct)}%`).join(", ")}>
        {drawn.map((d) => (
          <path
            key={d.key}
            d={d.path}
            fill={d.color}
            stroke={d.correct === true ? "#f4f1ff" : "rgba(25,23,52,0.85)"}
            strokeWidth={d.correct === true ? 2.5 : 1.5}
          />
        ))}
        <text x={cx} y={cy - 4} className="pie-n">{total}</text>
        <text x={cx} y={cy + 13} className="pie-l">{total === 1 ? "PICK" : "PICKS"}</text>
      </svg>

      <ul className="pie-legend">
        {drawn.map((d) => (
          <li key={d.key}>
            <span className="sw" style={{ background: d.color }} />
            <span className="ln">
              <span className="lname">
                {d.label}
                {d.correct === true && <span className="t-ok"> ✓</span>}
                {d.modelPicked && <span className="badge model" style={{ marginLeft: 7 }}>model</span>}
                {d.count === 1 && total > 2 && <span className="badge" style={{ marginLeft: 7 }}>alone</span>}
              </span>
              <span className="lwho">{d.names.join(", ")}</span>
            </span>
            <span className="lpct">{Math.round(d.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
