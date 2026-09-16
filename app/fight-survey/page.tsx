import findings from "@/data/fight-survey/findings.json";
import { FORMS } from "@/lib/forms";

export const revalidate = false;

type Group = "all" | "men" | "women";
interface Share { count: number; pct: number }
interface Animal { id: string; label: string; unarmed: Record<Group, Share>; knife: Record<Group, Share> }
interface PerPerson { median: number; mean: number; everything: number; none: number; writeIns: number }
interface Findings {
  title: string; subtitle: string; responses: number; collected: string;
  groups: Record<Group, number> & { other: number };
  perPerson: { unarmed: PerPerson; knife: PerPerson; fewerWithKnife: number; sameWithKnife: number };
  animals: Animal[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function FightSurveyPage() {
  const data = findings as unknown as Findings;
  const { animals, perPerson, groups } = data;

  // The animal the knife helps with most, and the ones almost nobody would fight.
  const biggestJump = animals.reduce((a, b) => (b.knife.all.pct - b.unarmed.all.pct > a.knife.all.pct - a.unarmed.all.pct ? b : a));
  const untouchable = animals.filter((a) => a.knife.all.pct <= 15);
  const easy = animals.filter((a) => a.unarmed.all.pct >= 70);
  const brave = animals.filter((a) => a.unarmed.all.count > 0 && a.unarmed.all.pct <= 5);

  return (
    <>
      <section className="hero">
        <div className="kicker">
          {data.responses} responses · {data.collected}
        </div>
        <h1 className="display">{data.title}</h1>
        <p>{data.subtitle}</p>
        {FORMS.fightSurvey && (
          <a className="cta-form" href={FORMS.fightSurvey} target="_blank" rel="noreferrer noopener">
            Fill out the fight form →
          </a>
        )}
        <div className="meth">
          Each person ticked every animal they think they would beat, once bare handed and once holding a bowie knife.
          Percentages are the share of people who ticked that animal. New responses get folded in when the page is rebuilt.
        </div>
      </section>

      <h2 className="section-h">The headlines</h2>
      <div className="stats">
        <div className="stat">
          <div className="l">Unarmed</div>
          <div className="n">{perPerson.unarmed.median}</div>
          <div className="s">animals the median person thinks they beat bare handed</div>
        </div>
        <div className="stat accent">
          <div className="l">With a knife</div>
          <div className="n">{perPerson.knife.median}</div>
          <div className="s">animals the median person thinks they beat once armed</div>
        </div>
        <div className="stat">
          <div className="l">Biggest knife bump</div>
          <div className="n">+{biggestJump.knife.all.pct - biggestJump.unarmed.all.pct}</div>
          <div className="s">
            points for the {biggestJump.label.toLowerCase()}, {biggestJump.unarmed.all.pct}% to {biggestJump.knife.all.pct}%
          </div>
        </div>
        <div className="stat">
          <div className="l">Ticked everything</div>
          <div className="n">{perPerson.unarmed.everything}</div>
          <div className="s">{perPerson.unarmed.everything === 1 ? "person" : "people"} would fight every animal unarmed, lion and grizzly included</div>
        </div>
      </div>
      <div className="dist-q">
        <div className="finding">
          Nearly everyone takes the {easy.map((a) => a.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")}.
          After that it falls off a cliff.
        </div>
        <div className="qsub">
          {untouchable.map((a) => a.label).join(", ").replace(/, ([^,]*)$/, " and $1")} stay under 15% even with a knife.
          {brave.length > 0 && ` Still, ${brave.map((a) => `${plural(a.unarmed.all.count, "person", "people")} would fight a ${a.label.toLowerCase()}`).join(", ")} with nothing but their hands.`}
          {perPerson.fewerWithKnife > 0 && ` ${plural(perPerson.fewerWithKnife, "person", "people")} ticked fewer animals with a knife than without, which is a choice.`}
        </div>
      </div>

      <h2 className="section-h">Animal by animal</h2>
      <p className="section-sub">Ranked by the unarmed vote. The pale bar is bare hands, the bright bar is with the knife.</p>
      <div className="fight-list">
        {animals.map((a) => (
          <div key={a.id} className="fight-row">
            <div className="fr-name">{a.label}</div>
            <div className="fr-bars">
              <div className="fr-bar">
                <span className="fr-track">
                  <span className="fr-fill unarmed" style={{ width: `${a.unarmed.all.pct}%` }} />
                </span>
                <span className="fr-num">{a.unarmed.all.pct}%</span>
              </div>
              <div className="fr-bar">
                <span className="fr-track">
                  <span className="fr-fill knife" style={{ width: `${a.knife.all.pct}%` }} />
                </span>
                <span className="fr-num">{a.knife.all.pct}%</span>
              </div>
            </div>
          </div>
        ))}
        <div className="fr-legend">
          <span><i className="sw unarmed" /> Unarmed</span>
          <span><i className="sw knife" /> With a knife</span>
        </div>
      </div>

      <h2 className="section-h">Split by gender</h2>
      <p className="section-sub">
        Share of each group who think they would win. {groups.men} men and {groups.women} women answered. The {groups.other} who
        picked something else or preferred not to say are in the overall numbers above but not in this split.
      </p>
      <div className="tscroll">
        <table className="data split">
          <thead>
            <tr>
              <th />
              <th colSpan={2}>Unarmed</th>
              <th colSpan={2}>Knife</th>
            </tr>
            <tr className="sub">
              <th />
              <th>Men</th>
              <th>Women</th>
              <th>Men</th>
              <th>Women</th>
            </tr>
          </thead>
          <tbody>
            {animals.map((a) => (
              <tr key={a.id}>
                <td className="an">{a.label}</td>
                <td className={a.unarmed.men.pct > a.unarmed.women.pct ? "hi" : ""}>{a.unarmed.men.pct}%</td>
                <td className={a.unarmed.women.pct > a.unarmed.men.pct ? "hi" : ""}>{a.unarmed.women.pct}%</td>
                <td className={a.knife.men.pct > a.knife.women.pct ? "hi" : ""}>{a.knife.men.pct}%</td>
                <td className={a.knife.women.pct > a.knife.men.pct ? "hi" : ""}>{a.knife.women.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="notice">
        <b>About the numbers.</b> This is a poll about confidence, not a prediction. Nobody was harmed and no animal was
        consulted. Only the counts live in this site; the individual responses never left the sheet.
      </div>
      <div className="foot" />
    </>
  );
}
