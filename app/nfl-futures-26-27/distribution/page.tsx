import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { clusterAnswers, clusterLabel } from "@/lib/resolve/match";
import type { Resolution } from "@/lib/resolve/types";
import { Progress } from "../parts";

export const revalidate = 3600;

interface Bar {
  key: string;
  label: string;
  names: string[];
  modelPicked: boolean;
  correct: boolean | null;
}

export default async function DistributionPage() {
  const data = await loadPool(POOL);
  const field = data.humans;

  const sections = POOL.questions.reduce<Record<string, typeof POOL.questions>>((acc, q) => {
    (acc[q.section] ??= []).push(q);
    return acc;
  }, {});

  function bars(questionId: string): { bars: Bar[]; noAnswer: string[] } {
    // Cluster the humans, then work out which cluster each entrant landed in by
    // resolution identity — the cluster map holds the same objects.
    const owner = new Map<Resolution, string>();
    const resolutions: Resolution[] = [];
    const noAnswer: string[] = [];

    for (const e of field) {
      const r = e.picks[questionId]?.resolution;
      if (!r) continue;
      if (!r.team && !r.value) {
        noAnswer.push(e.name);
        continue;
      }
      owner.set(r, e.name);
      resolutions.push(r);
    }

    const modelResolution = data.model?.picks[questionId]?.resolution;
    const modelKey = modelResolution?.team ?? modelResolution?.value ?? null;
    const outcome = data.outcomes[POOL.questions.find((q) => q.id === questionId)?.gradeAgainst ?? questionId];

    const clustered = [...clusterAnswers(resolutions).entries()]
      .map(([key, members]) => {
        const names = members.map((m) => owner.get(m) ?? "");
        // A cluster is the right answer if any of its members graded correct.
        const anyCorrect = field.some(
          (e) => members.includes(e.picks[questionId]?.resolution) && e.picks[questionId]?.grade === "correct",
        );
        return {
          key,
          label: clusterLabel(members),
          names,
          modelPicked: modelKey !== null && key === modelKey,
          correct: outcome && !outcome.pending ? anyCorrect : null,
        };
      })
      .sort((a, b) => b.names.length - a.names.length || a.label.localeCompare(b.label));

    return { bars: clustered, noAnswer };
  }

  return (
    <>
      <section className="hero">
        <div className="kicker">How the room split</div>
        <h1 className="display">Pick distribution</h1>
        <p>
          Every question, and who went with the crowd versus who is out on an island. Spellings are collapsed, so
          &ldquo;Puka Nacua&rdquo;, &ldquo;Puca Nacua&rdquo; and &ldquo;nacua&rdquo; are one bar. The{" "}
          <span style={{ color: "var(--model)" }}>model&apos;s pick</span> is highlighted where it made one.
        </p>
        <Progress resolved={data.resolvedCount} total={data.totalQuestions} />
      </section>

      {Object.entries(sections).map(([section, questions]) => (
        <div key={section}>
          <h2 className="section-h">{section}</h2>
          {questions.map((question) => {
            const { bars: rows, noAnswer } = bars(question.id);
            const total = rows.reduce((n, r) => n + r.names.length, 0);
            const maxCount = Math.max(1, ...rows.map((r) => r.names.length));
            const modelAbstained = data.model?.picks[question.id]?.resolution.status === "abstained";

            return (
              <div key={question.id} className="dist-q">
                <h3>{question.label}</h3>
                <div className="qsub">
                  {total} {total === 1 ? "answer" : "answers"} · {rows.length} distinct
                  {rows.length === 1 && total > 1 && " · unanimous"}
                  {modelAbstained && " · model abstained"}
                </div>

                {rows.length === 0 ? (
                  <div className="t-dim" style={{ fontSize: 13 }}>Nobody answered this one.</div>
                ) : (
                  rows.map((row) => {
                    const share = total ? row.names.length / total : 0;
                    const classes = [
                      "dbar",
                      row.correct === true ? "correct" : "",
                      row.modelPicked ? "has-model" : "",
                      row.names.length === 1 && total > 2 ? "island" : "",
                      share > 0.5 && total > 2 ? "consensus" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <div key={row.key} className={classes}>
                        <div className="dtop">
                          <span className="dname">
                            {row.label}
                            {row.correct === true && <span className="t-ok"> ✓</span>}
                            {row.modelPicked && <span className="badge model" style={{ marginLeft: 8 }}>model</span>}
                            {row.names.length === 1 && total > 2 && (
                              <span className="badge" style={{ marginLeft: 8 }}>alone</span>
                            )}
                          </span>
                          <span className="dcount">
                            {row.names.length} · {Math.round(share * 100)}%
                          </span>
                        </div>
                        <span className="dtrack">
                          <span className="dfill" style={{ width: `${(row.names.length / maxCount) * 100}%` }} />
                        </span>
                        <div className="who">{row.names.join(", ")}</div>
                      </div>
                    );
                  })
                )}

                {noAnswer.length > 0 && (
                  <div className="who" style={{ marginTop: 10 }}>
                    <span className="t-dim">No answer: {noAnswer.join(", ")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="foot" />
    </>
  );
}
