import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import modelJson from "@/data/nfl-futures-26-27/model-picks.v1.json";

export const revalidate = 3600;

interface Pick {
  value: string; team: string; confidence: number; basis: string;
  runnerUp: { value: string; team: string; confidence: number };
}
interface ModelDoc {
  version: string; asOf: string;
  simulation: { sims: number; gamesPlayed: number; gamesRemaining: number; week: string; method: string; file: string; repo: string };
  picks: Record<string, Pick>;
}

const DIVISIONS = ["afc_east", "afc_north", "afc_south", "afc_west", "nfc_east", "nfc_north", "nfc_south", "nfc_west"];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
};

/**
 * The model's entry. Nine picks and nothing else: the eight division winners and
 * the Super Bowl champion, because those are what a season simulation actually
 * produces. Everything is read from a committed file — nothing is simulated at
 * build time, so the picks cannot drift after the date they were locked.
 */
export default function ModelPage() {
  const model = modelJson as unknown as ModelDoc;
  const label = (id: string) => POOL.questions.find((q) => q.id === id)?.label ?? id;
  const champ = model.picks.sb_champ;

  return (
    <>
      <section className="hero">
        <div className="kicker">
          Model {model.version} · as of {fmtDate(model.asOf)}
        </div>
        <h1 className="display">Tre model picks</h1>
        <p>
          The <b>Can Tre Beat Vegas</b> Elo, playing the rest of the season out{" "}
          <b>{model.simulation.sims.toLocaleString()} times</b> and picking whatever won most often. Each replay plays
          every remaining game and then the entire bracket, wild card through a neutral-site Super Bowl, with the
          ratings updating inside the replay as results land.
        </p>
        <div className="meth">
          Locked {model.asOf}, {model.simulation.week}, with {model.simulation.gamesPlayed} of 272 games played. Nine
          picks only — division winners and the champion — because those are what the simulation produces. It does not
          guess at awards or stat leaders.
        </div>
      </section>

      <div className="champ-card">
        <div className="cc-l">Super Bowl LXI champion</div>
        <div className="cc-team">{champ.value}</div>
        <div className="cc-pct">
          {pct(champ.confidence)}
          <span className="cc-sub">of {model.simulation.sims.toLocaleString()} simulated seasons</span>
        </div>
        <div className="cc-next">
          Next best: {champ.runnerUp.value} on {pct(champ.runnerUp.confidence)}
        </div>
      </div>

      <h2 className="section-h">Division winners</h2>
      <p className="section-sub">
        The share of full playthroughs each team won its division. A low number is not a weak pick — it is a close
        division.
      </p>

      <div className="divs">
        {DIVISIONS.map((id) => {
          const p = model.picks[id];
          if (!p) return null;
          return (
            <div key={id} className="div-card">
              <div className="dc-l">{label(id)}</div>
              <div className="dc-team">{p.value}</div>
              <div className="dc-bar" aria-hidden>
                <span style={{ width: `${Math.max(p.confidence * 100, 3)}%` }} />
              </div>
              <div className="dc-row">
                <span className="dc-pct">{pct(p.confidence)}</span>
                <span className="dc-next">
                  over {p.runnerUp.value} · {pct(p.runnerUp.confidence)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="notice model">
        <b>What a percentage here means.</b> Seattle at {pct(champ.confidence)} is not a prediction that they will win.
        It means that across {model.simulation.sims.toLocaleString()} complete replays of this season they finished
        holding the trophy in {pct(champ.confidence)} of them, which is the highest of any team and still says they
        lose far more often than they win. The division numbers read the same way.
      </div>
      <div className="foot" />
    </>
  );
}
