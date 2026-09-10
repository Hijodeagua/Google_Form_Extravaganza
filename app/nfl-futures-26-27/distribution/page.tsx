import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { clusterAnswers, clusterLabel, pickKey } from "@/lib/resolve/match";
import type { Resolution } from "@/lib/resolve/types";
import { PickPie, Progress, type Slice } from "../parts";

export const revalidate = 3600;

export default async function DistributionPage() {
  const data = await loadPool(POOL);
  const field = data.humans;

  const sections = POOL.questions.reduce<Record<string, typeof POOL.questions>>((acc, q) => {
    (acc[q.section] ??= []).push(q);
    return acc;
  }, {});

  function bars(questionId: string): { bars: Slice[]; noAnswer: string[] } {
    const question = POOL.questions.find((q) => q.id === questionId)!;
    // Cluster the humans, then work out which cluster each entrant landed in by
    // resolution identity — the cluster map holds the same objects.
    const owner = new Map<Resolution, string>();
    const resolutions: Resolution[] = [];
    const noAnswer: string[] = [];

    for (const e of field) {
      const r = e.picks[questionId]?.resolution;
      if (!r) continue;
      if (!pickKey(question.domain, r)) {
        noAnswer.push(e.name);
        continue;
      }
      owner.set(r, e.name);
      resolutions.push(r);
    }

    const modelKey = pickKey(question.domain, data.model?.picks[questionId]?.resolution);
    const outcome = data.outcomes[question.gradeAgainst ?? questionId];

    const clustered = [...clusterAnswers(resolutions, question.domain).entries()]
      .map(([key, members]) => {
        const names = members.map((m) => owner.get(m) ?? "");
        // A cluster is the right answer if any of its members graded correct.
        const anyCorrect = field.some(
          (e) => members.includes(e.picks[questionId]?.resolution) && e.picks[questionId]?.grade === "correct",
        );
        return {
          key,
          label: clusterLabel(members),
          count: names.length,
          names,
          modelPicked: modelKey !== null && key === modelKey,
          correct: outcome && !outcome.pending ? anyCorrect : null,
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return { bars: clustered, noAnswer };
  }

  return (
    <>
      <section className="hero">
        <div className="kicker">How the room split</div>
        <h1 className="display">Pick distribution</h1>
        <p>
          Every question, and who went with the crowd versus who is out on an island. Spellings are collapsed, so
          &ldquo;Puka Nacua&rdquo;, &ldquo;Puca Nacua&rdquo; and &ldquo;nacua&rdquo; are one slice. The{" "}
          <span style={{ color: "var(--model)" }}>model&apos;s pick</span> is highlighted where it made one.
        </p>
        <Progress resolved={data.resolvedCount} total={data.totalQuestions} />
      </section>

      {Object.entries(sections).map(([section, questions]) => (
        <div key={section}>
          <h2 className="section-h">{section}</h2>
          {questions.map((question) => {
            const { bars: rows, noAnswer } = bars(question.id);
            const total = rows.reduce((n, r) => n + r.count, 0);
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
                  <PickPie slices={rows} total={total} />
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
