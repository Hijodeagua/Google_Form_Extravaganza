import Link from "next/link";
import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { rank } from "@/lib/scoring/tiebreak";
import { resolvePots } from "@/lib/scoring/pots";
import { PotCard, Progress } from "../parts";

export const revalidate = 3600;

export default async function SidePotPage() {
  const data = await loadPool(POOL);

  // The side pot is a subset of the field: only the people who said Yes or Maybe.
  // The model is not in it — nobody is splitting money with the Elo.
  const inPot = data.humans.filter((e) => e.optedIntoSidePot);
  const out = data.humans.filter((e) => !e.optedIntoSidePot);

  const pots = resolvePots(POOL, inPot, data.outcomes);
  const ranked = rank(inPot, POOL.tiebreaks, data.outcomes);

  return (
    <>
      <section className="hero">
        <div className="kicker">Yes and Maybe only</div>
        <h1 className="display">Side pot</h1>
        <p>
          The {inPot.length} {inPot.length === 1 ? "entry" : "entries"} who opted in, scored among themselves. The three
          pots are resolved inside this group, separately from the{" "}
          <Link href="/nfl-futures-26-27" style={{ color: "var(--gold)" }}>
            main standings
          </Link>
          .
        </p>
        <Progress resolved={data.resolvedCount} total={data.totalQuestions} />
      </section>

      {inPot.length === 0 ? (
        <div className="empty">
          <div className="e1">Nobody has opted in yet</div>
          <div className="e2">Answer Yes or Maybe on the side-pot question and you will show up here.</div>
        </div>
      ) : (
        <>
          <div className="pots">
            {pots.map((pot) => (
              <PotCard key={pot.config.id} pot={pot} />
            ))}
          </div>

          <h2 className="section-h">Side-pot table</h2>
          <p className="section-sub">Same scoring, smaller room.</p>
          <div className="tscroll">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Entrant</th>
                  <th>Opted in</th>
                  <th className="num">Points</th>
                  <th className="num">Divisions</th>
                  <th className="num">Awards</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ entrant, rank: position, tied, separatedBy }) => (
                  <tr key={entrant.id}>
                    <td className="rk">{position}</td>
                    <td>
                      <div className="stand-name">
                        <Link className="nm" href={`/nfl-futures-26-27/entrants/${entrant.id}`}>
                          {entrant.name}
                        </Link>
                      </div>
                      {tied && separatedBy && <div className="sep-note">Tied — separated on {separatedBy}</div>}
                    </td>
                    <td className="t-mut">{entrant.sidePotAnswer}</td>
                    <td className="num">
                      <span className={`stand-pts ${entrant.points === 0 ? "zero" : ""}`}>{entrant.points}</span>
                    </td>
                    <td className="num t-mut">{entrant.divisionsCorrect}/8</td>
                    <td className="num t-mut">{entrant.awardsCorrect}/8</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {out.length > 0 && (
        <div className="notice">
          <b>Not in the side pot:</b> {out.map((e) => e.name).join(", ")}. They still compete in the main standings.
        </div>
      )}
      <div className="foot" />
    </>
  );
}
