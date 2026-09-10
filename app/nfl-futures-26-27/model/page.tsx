import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { clusterAnswers, pickKey } from "@/lib/resolve/match";
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
      // Cluster the model in with the humans rather than comparing raw keys, so
      // "Garret", "Garrett" and "Myles garret" count as agreeing with the model
      // here exactly as they merge into one slice on the distribution page.
      const answered = humans
        .map((e) => e.picks[question.id]?.resolution)
        .filter((r): r is NonNullable<typeof r> => !!r && pickKey(question.domain, r) !== null);
      const clusters = clusterAnswers([mp.resolution, ...answered], question.domain);

      const modelCluster = [...clusters.values()].find((members) => members.includes(mp.resolution)) ?? [];
      const agreeing = modelCluster.filter((m) => m !== mp.resolution);
      // Consensus = the biggest cluster of human answers.
      const topCount = Math.max(
        0,
        ...[...clusters.values()].map((members) => members.filter((m) => m !== mp.resolution).length),
      );
      const withCrowd = agreeing.length === topCount && topCount > 0;

      return {
        question,
        pick: mp,
        label: mp.resolution.display,
        agreeing: agreeing.length,
        total: answered.length,
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
          The <b>Can Tre Beat Vegas</b> Elo filled out the same form. Team outcomes come from{" "}
          <b>{modelEntry.sourceSnapshot.sims.toLocaleString()} season replays</b> run on{" "}
          {modelEntry.sourceSnapshot.runDate} with {modelEntry.sourceSnapshot.gamesRemaining} of the season&apos;s 272
          games still to play. Player picks are projected from{" "}
          <b>{modelEntry.playerModel.playersProjected.toLocaleString()} players&apos;</b> production over the two prior
          seasons. Every pick is locked in a committed file.
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
            {model.divisionsCorrect}/8 divisions · answers {Object.keys(modelEntry.picks).length} of{" "}
            {Object.keys(modelEntry.picks).length + Object.keys(modelEntry.abstentions).length} questions
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
            {model.points} points, ahead of {beatenByModel} of {humans.length} entries.
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

      <h2 className="section-h">How well does this actually work</h2>
      <p className="section-sub">
        The projection was rebuilt for every season since 2017 using only the two seasons before it, then checked
        against who actually led. That is {modelEntry.playerModel.backtest.cases} cases:{" "}
        {modelEntry.playerModel.backtest.seasons} seasons across {modelEntry.playerModel.backtest.categories} stat
        categories.
      </p>

      <div className="stats">
        <div className="stat accent">
          <div className="l">Exact leader called</div>
          <div className="n">
            {Math.round((modelEntry.playerModel.backtest.exact / modelEntry.playerModel.backtest.cases) * 100)}%
          </div>
          <div className="s">
            {modelEntry.playerModel.backtest.exact} of {modelEntry.playerModel.backtest.cases} backtested seasons
          </div>
        </div>
        <div className="stat model-accent">
          <div className="l">Leader in its top three</div>
          <div className="n">
            {Math.round((modelEntry.playerModel.backtest.topThree / modelEntry.playerModel.backtest.cases) * 100)}%
          </div>
          <div className="s">where most of the signal is</div>
        </div>
        <div className="stat">
          <div className="l">Players projected</div>
          <div className="n">{modelEntry.playerModel.playersProjected.toLocaleString()}</div>
          <div className="s">on a 2026 roster with prior production</div>
        </div>
        <div className="stat">
          <div className="l">Effect of tuning</div>
          <div className="n">3</div>
          <div className="s">picks separate the best and worst settings tried, out of 36</div>
        </div>
      </div>

      <div className="notice warn">
        <b>Read the stat-leader picks as a shortlist, not a call.</b> Naming the exact season leader lands about one
        time in twelve. The useful number is the other one: the player who actually led was inside this model&apos;s top
        three about a third of the time, against roughly one in two hundred for a guess. The runner-ups are listed
        below each pick for that reason.
      </div>

      <h2 className="section-h">How each pick was made</h2>
      <p className="section-sub">
        Not every answer is worth the same trust, so each one carries the method behind it. Team outcomes come from the
        Elo season simulation. Stat leaders are projected from {modelEntry.playerModel.playersProjected.toLocaleString()}{" "}
        players&apos; production over the two prior seasons. Awards are those projections plus a rule of thumb. Where
        there is no statistical basis at all, the model takes the market price rather than inventing one.
      </p>

      <div className="tscroll">
        <table className="data">
          <thead>
            <tr>
              <th>Question</th>
              <th>Pick</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            {POOL.questions.map((question) => {
              const pick = modelEntry.picks[question.id];
              const abstained = modelEntry.abstentions[question.id];
              if (!pick && !abstained) return null;
              return (
                <tr key={question.id}>
                  <td className="t-mut">{question.label}</td>
                  <td style={{ fontWeight: 600 }}>
                    {pick ? (
                      <>
                        <span style={{ color: "var(--model)" }}>{pick.value}</span>{" "}
                        <span className={`badge tier-${pick.tier}`}>{pick.tier}</span>
                        {pick.closeCall && <span className="badge flag" style={{ marginLeft: 6 }}>coin flip</span>}
                      </>
                    ) : (
                      <span className="abstain">
                        <span className="strike">abstained</span>
                      </span>
                    )}
                  </td>
                  <td className="t-mut" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                    {pick ? pick.basis : abstained}
                    {pick?.alternatives && pick.alternatives.length > 0 && (
                      <div className="t-dim" style={{ marginTop: 5 }}>
                        Then: {pick.alternatives.map((a) => `${a.name} (${a.value})`).join(", ")}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="notice model">
        <b>The constants are fitted, not guessed.</b> <code>scripts/fit-projection.ts</code> grid-searches the recency
        weight, the team-strength pull and the durability shrink over{" "}
        {modelEntry.playerModel.backtest.seasons} seasons of held-out history. It also shows how little any of it
        matters: every setting tried lands between one and four correct picks out of{" "}
        {modelEntry.playerModel.backtest.cases}. The values below sit at the plateau rather than at the grid&apos;s
        lucky maximum, which on this little data would be noise.
      </div>

      <div className="notice model">
        <b>The player projections.</b> Two prior seasons of {modelEntry.playerModel.source}, weighted{" "}
        {Math.round((modelEntry.playerModel.seasons["2025"] ?? 0.7) * 100)}/
        {Math.round((modelEntry.playerModel.seasons["2024"] ?? 0.3) * 100)} toward the most recent, converted to a
        per-game rate and projected over {modelEntry.playerModel.games} games. Each player is mapped to his{" "}
        <b>2026</b> roster, so an offseason move follows him. Team strength then lifts the volume gently — a contender
        throws and runs more than a bad team, but a good offence does not change who the player is. A player who missed
        time is not projected over a full season either — the 17-game assumption is shrunk halfway toward what he
        actually managed, because a yards leader has to be on the field. Where the top two projections finish within{" "}
        {Math.round(modelEntry.playerModel.closeCallMargin * 100)}% of each other the pick is marked a{" "}
        <b>coin flip</b> rather than presented as a call. Nothing is re-run at build time: the picks come from a
        committed file so they cannot drift after the fact.
      </div>
      <div className="foot" />
    </>
  );
}
