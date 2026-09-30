import { FORMS } from "@/lib/forms";
import { loadEdhFindings } from "@/lib/surveys/load";
import type { Question } from "@/lib/surveys/edh";

/** Re-read the sheet hourly, so new responses land without a deploy. */
export const revalidate = 3600;

/** The one-line takeaway for a question, read off its own numbers. */
function headline(q: Question): string {
  const top = q.items[0];
  switch (q.kind) {
    case "years": {
      const era = q.items.reduce((a, b) => (b.count > a.count ? b : a));
      return `Median ${q.median}. The biggest group, ${era.pct}%, started ${era.label.toLowerCase().replace("before", "before")}.`;
    }
    case "open":
      return q.note ?? "";
    case "scale":
      return `${top.pct}% said ${top.label.replace(/^1, /, "")}.`;
    case "multi":
      return `${top.label} came up most, on ${top.pct}% of cards.`;
    default:
      return `${top.label}, ${top.pct}%.`;
  }
}

export default async function EdhSurveyPage() {
  const { data, source, reason } = await loadEdhFindings();

  return (
    <>
      <section className="hero">
        <div className="kicker">
          {data.responses} responses · {data.collected}
        </div>
        <h1 className="display">{data.title}</h1>
        <p>{data.subtitle}</p>
        {FORMS.edhSurvey && (
          <a className="cta-form" href={FORMS.edhSurvey} target="_blank" rel="noreferrer noopener">
            Fill out the EDH survey →
          </a>
        )}
        {source === "snapshot" && (
          <div className="notice warn">
            <b>Showing the last saved snapshot.</b> The sheet could not be read when this page was built ({reason}). It
            will be re-read on the next refresh.
          </div>
        )}
        <div className="meth">
          High level on purpose. Each question gets its headline and the split behind it. Percentages are of the people
          who answered that question, and spellings of the same thing are folded together.
        </div>
      </section>

      {data.parts.map((part) => (
        <div key={part.id}>
          <h2 className="section-h">{part.title}</h2>
          <p className="section-sub">{part.blurb}</p>

          {part.questions.map((q) => {
            const max = Math.max(1, ...q.items.map((i) => i.count));
            return (
              <div key={q.id} className="dist-q">
                <h3>{q.label}</h3>
                <div className="finding">{headline(q)}</div>
                <div className="qsub">
                  {q.answered} answered
                  {q.distinct && q.kind !== "open" ? ` · ${q.distinct} distinct` : ""}
                  {q.note && q.kind !== "open" ? ` · ${q.note}` : ""}
                </div>

                {q.kind === "open" ? (
                  <div className="who">
                    Named more than once: {q.items.filter((i) => i.count > 1 && i.label !== "Other").map((i) => i.label).join(", ")}.
                  </div>
                ) : (
                  q.items.map((i) => (
                    <div key={i.label} className={`dbar ${i === q.items[0] && q.kind !== "years" && q.kind !== "scale" ? "consensus" : ""}`}>
                      <div className="dtop">
                        <span className="dname">{i.label}</span>
                        <span className="dcount">
                          {i.count} · {i.pct}%
                        </span>
                      </div>
                      <span className="dtrack">
                        <span className="dfill" style={{ width: `${(i.count / max) * 100}%` }} />
                      </span>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="notice">
        <b>About the numbers.</b> Free-text answers were folded together where they clearly meant the same thing, so
        &ldquo;Command Zone&rdquo; and &ldquo;The Command Zone&rdquo; are one bar, and every Tymna partner pairing is
        one bar. Non-answers were dropped before percentages were taken. The sheet is re-read hourly, so new responses fold
        in on their own. Only the counts live in this site; the individual responses never leave the sheet.
      </div>
      <div className="foot" />
    </>
  );
}
