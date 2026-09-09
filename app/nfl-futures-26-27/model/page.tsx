import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { Progress } from "../parts";

export const revalidate = 3600;

export default async function ModelPage() {
  const data = await loadPool(POOL);
  const { model, modelEntry, humans } = data;
  if (!model) return null;

  const fieldAvg = humans.length ? humans.reduce((n, e) => n + e.points, 0) / humans.length : 0;
  const fieldBest = humans.reduce((best, e) => (e.points > best ? e.points : best), 0);
  const beatenByModel = humans.filter((e) => model.points > e.points).length;

  // Where the model sided with the crowd and where it went its own way. Computed
  // over every question the model actually answered.
  const rows = POOL.questions
    .map((question) => {
      const mp = model.picks[question.id];
      if (!mp || mp.resolution.status === "abstained") return null;
      const modelKey = mp.resolution.team ?? mp.resolution.value;

      const answers = humans
        .map((e) => ({ entrant: e, r: e.picks[question.id]?.resolution }))
        .filter((a) => a.r && (a.r.team || a.r.value));

      const agreeing = answers.filter((a) => (a.r!.team ?? a.r!.value) === modelKey);
      // Consensus = the single most popular human answer for this question.
      const tally = new Map<string, number>();
      for (const a of answers) {
        const k = a.r!.team ?? a.r!.value!;
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
      const topCount = Math.max(0, ...tally.values());
      const withCrowd = (tally.get(modelKey ?? "") ?? 0) === topCount && topCount > 0;

      return {
        question,
        pick: mp,
        label: mp.resolution.display,
        agreeing: agreeing.length,
        total: answers.length,
        withCrowd,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const diverging = rows.filter((r) => !r.withCrowd);
  const graded = model.gradedCount > 0;
  const modelAhead = model.points > fieldBest;

  return (
    <>
      <section className="hero">
        <div className="kicker">Machine against the room</div>
        <h1 className="display">Model vs field</h1>
        <p>
          The <b>Can Tre Beat Vegas</b> Elo filled out the same form. Its picks come from{" "}
          <b>{modelEntry.sourceSnapshot.sims.toLocaleString()} season replays</b> taken at 0-0 with all{" "}
          {modelEntry.sourceSnapshot.gamesRemaining} games still to play, and were locked and committed on{" "}
          {modelEntry.sourceSnapshot.runDate} — the same deadline everyone else had.
        </p>
        <div className="meth">
          Version {modelEntry.version} · generated {new Date(modelEntry.generatedAt).toISOString().slice(0, 10)} · never
          regenerated at build time
        </div>
        <Progress resolved={data.resolvedCount} total={data.totalQuestions} />
      </section>

      <div className="vs">
        <div className="vs-side model">
          <div className="l">The model</div>
          <div className="big">{model.points}</div>
          <div className="s">
            {model.divisionsCorrect}/8 divisions · abstained on {Object.keys(modelEntry.abstentions).length} questions
          </div>
        </div>
        <div className="vs-mid">versus</div>
        <div className="vs-side field">
          <div className="l">Best human</div>
          <div className="big">{fieldBest}</div>
          <div className="s">
            {humans.length} entries · {fieldAvg.toFixed(1)} average
          </div>
        </div>
      </div>

      {graded ? (
        <div className={`verdict ${modelAhead ? "win" : "lose"}`}>
          <div className="vt">
            {modelAhead
              ? `THE MODEL IS BEATING EVERY HUMAN`
              : model.points === fieldBest
                ? `THE MODEL IS TIED FOR THE LEAD`
                : `${fieldBest - model.points} POINT${fieldBest - model.points === 1 ? "" : "S"} BEHIND THE LEADER`}
          </div>
          <div className="vs2">
            {model.points} points, ahead of {beatenByModel} of {humans.length} entries. It gave up{" "}
            {Object.keys(modelEntry.abstentions).length} questions without answering.
          </div>
        </div>
      ) : (
        <div className="notice model">
          <b>Nothing is graded yet</b>, so the scoreboard above reads 0 to 0. The comparison worth reading today is
          below: where the Elo sided with the room, and where it did not.
        </div>
      )}

      <h2 className="section-h">Where the model broke from the room</h2>
      <p className="section-sub">
        {diverging.length} of {rows.length} answered questions put the model against the most popular human pick.
      </p>

      <div className="tscroll">
        <table className="data">
          <thead>
            <tr>
              <th>Question</th>
              <th>Model</th>
              <th className="num">Field agrees</th>
              <th>Stance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.question.id}>
                <td className="t-mut">{row.question.label}</td>
                <td style={{ fontWeight: 600, color: "var(--model)" }}>
                  {row.label}
                  {row.pick.grade === "correct" && <span className="t-ok"> ✓</span>}
                  {row.pick.grade === "wrong" && <span className="t-bad"> ✗</span>}
                </td>
                <td className="num t-mut">
                  {row.agreeing}/{row.total}
                </td>
                <td>
                  <span className={`badge ${row.withCrowd ? "" : "flag"}`}>
                    {row.withCrowd ? "with the crowd" : "contrarian"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-h">What it refused to answer</h2>
      <p className="section-sub">
        The Elo rates teams, not players. Rather than invent a confident pick it takes the zero, and those zeros are
        counted against it in the standings like anyone else&apos;s blank.
      </p>
      <div className="picks">
        {Object.entries(modelEntry.abstentions).map(([id, why]) => {
          const question = POOL.questions.find((q) => q.id === id);
          return (
            <div key={id} className="pick">
              <div className="q">{question?.label ?? id}</div>
              <div className="a none">
                <span className="abstain">
                  <span className="strike">abstained</span> — {why}
                </span>
              </div>
              <div className="g t-dim">0 pts</div>
            </div>
          );
        })}
      </div>

      <div className="notice model">
        <b>How these picks were made.</b> Division winners, conference titles, the two 1 seeds and the Super Bowl
        champion are the highest-probability team in{" "}
        {modelEntry.sourceSnapshot.sims.toLocaleString()} simulated seasons. Most wins and worst record are the highest
        and lowest expected win totals. Nothing was re-run for this page — the picks are read from a committed file so
        they cannot drift after the fact.
      </div>
      <div className="foot" />
    </>
  );
}
