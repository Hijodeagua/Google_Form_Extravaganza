import Link from "next/link";
import { POOLS } from "@/lib/pools/registry";
import { loadEdhFindings, loadFightFindings } from "@/lib/surveys/load";

export const revalidate = 3600;

/**
 * The index. Deliberately generic: this repo is a home for form-driven trackers,
 * so a new pool appears here by being added to the registry — NBA futures, the
 * EDH survey and the gingerbread race all land as siblings, not rewrites.
 */
export default async function Home() {
  const [{ data: edh }, { data: fight }] = await Promise.all([loadEdhFindings(), loadFightFindings()]);
  return (
    <>
      <section className="hero">
        <div className="kicker">Google Forms in, standings out</div>
        <h1 className="display">Extravaganza</h1>
        <p>
          Friend-group prediction pools, scored live off the Form responses and graded against a model that filled out
          the same questions. One tracker per pool.
        </p>
      </section>

      <div className="cards">
        <Link href="/edh-survey" className="tcard">
          <div className="tt">The EDH Survey</div>
          <div className="tb">What {edh.responses} Commander players said about how they got here and how they play. Findings only, in two parts.</div>
          <div className="tm">
            <span>
              <b>{edh.responses}</b> responses
            </span>
            <span>
              <b>{edh.parts.reduce((n, p) => n + p.questions.length, 0)}</b> questions
            </span>
            <span>{edh.collected}</span>
          </div>
        </Link>
        <Link href="/fight-survey" className="tcard">
          <div className="tt">Could you beat it in a fight?</div>
          <div className="tb">Fifteen animals, unarmed and then with a knife. Which ones people think they could take, split by gender.</div>
          <div className="tm">
            <span>
              <b>{fight.responses}</b> responses
            </span>
            <span>
              <b>{fight.animals.length}</b> animals
            </span>
            <span>{fight.collected}</span>
          </div>
        </Link>
        {POOLS.map((pool) => (
          <Link key={pool.slug} href={`/${pool.slug}`} className="tcard">
            <div className="tt">{pool.title}</div>
            <div className="tb">{pool.blurb}</div>
            <div className="tm">
              <span>
                <b>{pool.questions.length}</b> questions
              </span>
              <span>
                <b>{pool.maxPoints}</b> points on offer
              </span>
              <span>{pool.season}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="foot" />
    </>
  );
}
