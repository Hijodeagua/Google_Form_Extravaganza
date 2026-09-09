import Link from "next/link";
import { notFound } from "next/navigation";
import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { rank } from "@/lib/scoring/tiebreak";
import { PickRow } from "../../parts";

export const revalidate = 3600;

export default async function EntrantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPool(POOL);
  const entrant = data.entrants.find((e) => e.id === slug);
  if (!entrant) notFound();

  const position = rank(data.entrants, POOL.tiebreaks, data.outcomes).find((r) => r.entrant.id === slug);

  // Questions keep their config order inside each section, so the card reads in
  // the same order as the Form did.
  const sections = POOL.questions.reduce<Record<string, typeof POOL.questions>>((acc, q) => {
    (acc[q.section] ??= []).push(q);
    return acc;
  }, {});

  return (
    <>
      <section className="hero">
        <div className="kicker">
          <Link href="/nfl-futures-26-27" style={{ color: "var(--gold)" }}>
            ← Standings
          </Link>
        </div>
        <h1 className="display">{entrant.name}</h1>
        <p>
          {entrant.isModel ? (
            <>
              The <b>Can Tre Beat Vegas</b> Elo, filling out the same form. It answers only the questions it can
              actually forecast and abstains on the rest, which is why its card has gaps.
            </>
          ) : (
            <>
              Submitted {entrant.submittedAt}
              {entrant.sidePotAnswer && <> · side pot: {entrant.sidePotAnswer}</>}
            </>
          )}
        </p>
      </section>

      <div className="stats">
        <div className="stat accent">
          <div className="l">Points</div>
          <div className="n">
            {entrant.points}
            <span style={{ fontSize: 16, color: "var(--mut-2)" }}>/{POOL.maxPoints}</span>
          </div>
          <div className="s">{position ? `Rank ${position.rank} of ${data.entrants.length}` : ""}</div>
        </div>
        <div className="stat">
          <div className="l">Divisions</div>
          <div className="n">{entrant.divisionsCorrect}</div>
          <div className="s">of 8 correct</div>
        </div>
        <div className="stat">
          <div className="l">Awards</div>
          <div className="n">{entrant.awardsCorrect}</div>
          <div className="s">of 8 correct</div>
        </div>
        <div className="stat">
          <div className="l">All questions</div>
          <div className="n">{entrant.totalCorrect}</div>
          <div className="s">{entrant.gradedCount > 0 ? `of ${entrant.gradedCount} graded` : "nothing graded yet"}</div>
        </div>
      </div>

      {Object.entries(sections).map(([section, questions]) => (
        <div key={section}>
          <h2 className="section-h">{section}</h2>
          <div className="picks">
            {questions.map((question) => {
              const pick = entrant.picks[question.id];
              if (!pick) return null;
              return (
                <PickRow
                  key={question.id}
                  pick={pick}
                  outcome={data.outcomes[question.gradeAgainst ?? question.id]}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="foot" />
    </>
  );
}
