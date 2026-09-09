import { NFL_FUTURES_26_27 as POOL } from "@/lib/pools/nfl-futures-26-27/config";
import { loadPool } from "@/lib/load";
import { canonicalKey } from "@/lib/resolve/normalize";

export const revalidate = 3600;

interface Item {
  entrant: string;
  question: string;
  questionId: string;
  raw: string;
  key: string;
  note: string;
  kind: "unresolved" | "multi" | "flagged" | "abstained" | "watch";
}

const KIND_LABEL: Record<Item["kind"], string> = {
  unresolved: "could not resolve",
  multi: "two answers in one box",
  flagged: "graded on a judgement call",
  abstained: "non-answer",
  watch: "worth a look",
};

/**
 * The fix queue. Nothing on this site is scored on a guess without appearing
 * here first — fuzzy spelling matches and team-for-coach readings are graded,
 * but they are graded *loudly*.
 */
export default async function AdminPage() {
  const data = await loadPool(POOL);
  const items: Item[] = [];

  for (const entrant of data.humans) {
    for (const question of POOL.questions) {
      const pick = entrant.picks[question.id];
      if (!pick) continue;
      const r = pick.resolution;

      const kind: Item["kind"] | null =
        r.status === "unresolved" ? "unresolved"
        : r.status === "multi" ? "multi"
        : r.status === "flagged" || pick.flagged ? "flagged"
        : r.status === "abstained" ? "abstained"
        : null;

      if (!kind) continue;
      items.push({
        entrant: entrant.name,
        question: question.label,
        questionId: question.id,
        raw: r.raw.trim(),
        key: canonicalKey(r.raw),
        note: pick.note ?? r.note ?? "",
        kind,
      });
    }
  }

  // A watchlist rather than an error list: a one-word person answer that nobody
  // else gave is not yet wrong, but it is exactly the kind of thing that grades
  // badly once the outcome lands. Surfacing it now beats arguing about it in
  // February.
  const watch: Item[] = [];
  for (const question of POOL.questions) {
    if (question.domain !== "person" && question.domain !== "coach") continue;
    const counts = new Map<string, number>();
    for (const e of data.humans) {
      const v = e.picks[question.id]?.resolution.value;
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const e of data.humans) {
      const r = e.picks[question.id]?.resolution;
      if (!r?.value || r.status !== "resolved" || r.canonical) continue;
      const singleToken = !r.value.includes(" ");
      if (singleToken && counts.get(r.value) === 1) {
        watch.push({
          entrant: e.name,
          question: question.label,
          questionId: question.id,
          raw: r.raw.trim(),
          key: r.value,
          note: "One word, and nobody else said it. Will only match if the outcome's name contains this exact word.",
          kind: "watch",
        });
      }
    }
  }

  const order: Item["kind"][] = ["unresolved", "multi", "flagged", "watch", "abstained"];
  const all = [...items, ...watch].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const counts = order.map((k) => ({ kind: k, n: all.filter((i) => i.kind === k).length }));

  const pendingOutcomes = Object.values(data.outcomes).filter((o) => o.pending && !o.void);

  return (
    <>
      <section className="hero">
        <div className="kicker">Nothing is graded on a guess in silence</div>
        <h1 className="display">Admin</h1>
        <p>
          Everything the resolver could not place, plus everything it did place by judgement rather than by certainty.
          Fix any of these by adding a line to <code>data/nfl-futures-26-27/aliases.json</code> — the key to paste is
          shown on each row.
        </p>
      </section>

      <div className="stats">
        {counts.map(({ kind, n }) => (
          <div key={kind} className={`stat ${kind === "unresolved" && n > 0 ? "accent" : ""}`}>
            <div className="l">{KIND_LABEL[kind]}</div>
            <div className="n">{n}</div>
            <div className="s">
              {n === 0 ? "clear" : kind === "abstained" ? "scored zero, no action" : kind === "watch" ? "no action yet" : "worth a look"}
            </div>
          </div>
        ))}
      </div>

      {data.columns.missing.length > 0 && (
        <div className="notice warn">
          <b>Unmatched questions:</b> {data.columns.missing.map((q) => q.label).join(", ")}. No column in the sheet
          matched these — add the new header wording to that question&apos;s <code>match</code> array in the pool config.
        </div>
      )}
      {data.columns.unmapped.length > 0 && (
        <div className="notice">
          <b>Sheet columns nothing claimed:</b> {data.columns.unmapped.join(" · ")}. Harmless if the Form gained a
          question this tracker does not score.
        </div>
      )}
      {data.superseded.length > 0 && (
        <div className="notice">
          <b>Superseded submissions:</b> {data.superseded.map((s) => `${s.name} (${s.submittedAt})`).join(", ")}. Only
          each person&apos;s most recent entry is scored.
        </div>
      )}

      <h2 className="section-h">Fix queue</h2>
      <p className="section-sub">
        {all.length === 0
          ? "Nothing needs attention."
          : `${all.length} rows across ${data.humans.length} entrants.`}
      </p>

      {all.map((item, i) => (
        <div key={`${item.entrant}-${item.questionId}-${i}`} className="fix">
          <div className="fh">
            <span className={`badge ${item.kind === "unresolved" || item.kind === "multi" ? "flag" : ""}`}>
              {KIND_LABEL[item.kind]}
            </span>
            <span className="fq">{item.question}</span>
            <span className="fw">{item.entrant}</span>
          </div>
          <div className="fr">&ldquo;{item.raw}&rdquo;</div>
          {item.note && <div className="fn">{item.note}</div>}
          <div className="fn">
            Alias key: <code>&quot;{item.key}&quot;: &quot;Correct Name Here&quot;</code>
            {(item.kind === "multi" || item.kind === "watch") && (
              <>
                {" "}
                — put it under <code>byQuestion.{item.questionId}</code> if it should only apply to this question.
              </>
            )}
          </div>
        </div>
      ))}

      <h2 className="section-h">Outcomes still open</h2>
      <p className="section-sub">
        {pendingOutcomes.length} of {data.totalQuestions} waiting on a value in{" "}
        <code>data/nfl-futures-26-27/results-26-27.json</code>.
      </p>
      <div className="tscroll">
        <table className="data">
          <thead>
            <tr>
              <th>Question</th>
              <th>Key</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(data.outcomes).map((o) => (
              <tr key={o.questionId}>
                <td>{o.label}</td>
                <td className="t-dim">
                  <code>{o.questionId}</code>
                </td>
                <td>
                  {o.void ? (
                    <span className="t-dim">voided</span>
                  ) : o.pending ? (
                    <span className="t-pend">pending</span>
                  ) : (
                    <span className="t-ok">
                      {o.display}
                      {o.resolvedAt && <span className="t-dim"> · {o.resolvedAt}</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="notice">
        Sheet last read {new Date(data.fetchedAt).toISOString().replace("T", " ").slice(0, 16)} UTC. Responses
        re-read hourly; if the fetch fails the last good render keeps serving.
      </div>
      <div className="foot" />
    </>
  );
}
