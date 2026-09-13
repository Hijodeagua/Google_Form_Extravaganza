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
