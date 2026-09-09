import Link from "next/link";
import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { rank } from "@/lib/scoring/tiebreak";
import { resolvePots } from "@/lib/scoring/pots";
import { PotCard, Progress } from "./parts";

export const revalidate = 3600;

export default async function StandingsPage() {
  const data = await loadPool(POOL);
  const ranked = rank(data.entrants, POOL.tiebreaks, data.outcomes);
  const pots = resolvePots(POOL, data.entrants, data.outcomes);
  const preseason = data.resolvedCount === 0;

  const flagged = data.entrants.reduce((n, e) => n + e.flaggedCount, 0);
  const needsFixing = data.entrants.reduce((n, e) => n + e.unresolvedCount, 0);

  return (
    <>
      <section className="hero">
        <div className="kicker">2026-27 season · Super Bowl LXI</div>
        <h1 className="display">Standings</h1>
        <p>
          Sixteen points on offer: <b>eight division winners</b> and <b>eight awards</b>, one point each, plus{" "}
          <b>two bonus points</b> if a Dark Horse MVP pick turns out to be the actual MVP. Ties break on awards
          correct, then combined Super Bowl points, closest without going over.
        </p>
        <div className="meth">
          Seeding, stat leaders and the hot-seat questions are scored and shown, but kept out of the total.
        </div>
        <Progress resolved={data.resolvedCount} total={data.totalQuestions} />
      </section>

      <div className="pots">
        {pots.map((pot) => (
          <PotCard key={pot.config.id} pot={pot} />
        ))}
      </div>

      {data.unavailable && (
        <div className="notice warn">
          <b>Responses could not be read on this render.</b> {data.unavailable} The next hourly revalidation will fill
          the table in.
        </div>
      )}

      {preseason && !data.unavailable && (
        <div className="notice">
          <b>Nothing has been decided yet.</b> Every pick below is locked and every outcome is still open, so the table
          reads 0 across the board — that is the correct answer, not a bug. Points start appearing as outcomes are
          filled into the resolution key. In the meantime, the{" "}
          <Link href="/nfl-futures-26-27/distribution" style={{ color: "var(--gold)" }}>
            pick distribution
          </Link>{" "}
          is the interesting page.
        </div>
      )}

      <h2 className="section-h">The table</h2>
      <p className="section-sub">
        {data.entrants.length} entries, including the model. Tap a name for every pick and how it graded.
      </p>

      <div className="tscroll">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>Entrant</th>
              <th className="num">Points</th>
              <th className="num">Divisions</th>
              <th className="num">Awards</th>
              <th className="num">All correct</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ entrant, rank: position, tied, separatedBy }) => (
              <tr key={entrant.id} className={entrant.isModel ? "is-model" : ""}>
                <td className="rk">{position}</td>
                <td>
                  <div className="stand-name">
                    <Link className="nm" href={`/nfl-futures-26-27/entrants/${entrant.id}`}>
                      {entrant.name}
                    </Link>
                    {entrant.isModel && <span className="badge model">model</span>}
                    {entrant.optedIntoSidePot && <span className="badge pot">side pot</span>}
                    {entrant.flaggedCount > 0 && <span className="badge flag">{entrant.flaggedCount} flagged</span>}
                  </div>
                  {!preseason && tied && separatedBy && (
                    <div className="sep-note">Tied — separated on {separatedBy}</div>
                  )}
                </td>
                <td className="num">
                  <span className={`stand-pts ${entrant.points === 0 ? "zero" : ""}`}>
                    {entrant.points}
                    <small>/{POOL.maxPoints}</small>
                  </span>
                </td>
                <td className="num t-mut">{entrant.divisionsCorrect}/8</td>
                <td className="num t-mut">{entrant.awardsCorrect}/8</td>
                <td className="num t-mut">
                  {entrant.gradedCount === 0 ? (
                    <span className="t-dim">—</span>
                  ) : (
                    <>
                      {entrant.totalCorrect}
                      <span className="t-dim">/{entrant.gradedCount}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(flagged > 0 || needsFixing > 0) && (
        <div className="notice warn">
          <b>
            {flagged} answer{flagged === 1 ? "" : "s"} graded on a judgement call
          </b>
          {needsFixing > 0 && ` and ${needsFixing} that could not be resolved at all`}. Nothing here is scored on a
          guess without saying so —{" "}
          <Link href="/nfl-futures-26-27/admin" style={{ color: "var(--gold)" }}>
            review them
          </Link>
          .
        </div>
      )}
      <div className="foot" />
    </>
  );
}
