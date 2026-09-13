import { permanentRedirect } from "next/navigation";

/**
 * Pick distribution moved to the pool root and became the landing page. Links to
 * the old path were already shared around, so they keep working.
 */
export default function DistributionMoved() {
  permanentRedirect("/nfl-futures-26-27");
}
