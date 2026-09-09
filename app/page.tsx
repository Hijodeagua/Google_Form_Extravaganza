import Link from "next/link";
import { POOLS } from "@/lib/pools/registry";

export const revalidate = 3600;

/**
 * The index. Deliberately generic: this repo is a home for form-driven trackers,
 * so a new pool appears here by being added to the registry — NBA futures, the
 * EDH survey and the gingerbread race all land as siblings, not rewrites.
 */
export default function Home() {
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
