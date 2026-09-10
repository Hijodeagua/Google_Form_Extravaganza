import boardJson from "@/data/nfl-futures-26-27/advanced-board.json";

export const revalidate = 3600;

interface Col { key: string; label: string; dp: number }
interface Row {
  name: string; team: string; position: string;
  projected: number; gamesPlayed: number; expGames: number; teamWins: number;
  cols: Record<string, number>;
}
interface Board { id: string; label: string; stat: string; unit: string; note: string; cols: Col[]; rows: Row[] }

/**
 * The projection's own working. Nothing here picks anything — these are the rate
 * stats behind the stat-leader picks, which raw yardage never shows. Every
 * column is per game across the two prior seasons, weighted the same way the
 * projection weights them.
 */
export default function AdvancedPage() {
  const data = boardJson as unknown as { generatedAt: string; seasons: Record<string, number>; boards: Board[] };
  const weights = Object.entries(data.seasons).sort((a, b) => Number(b[0]) - Number(a[0]));

  return (
    <>
      <section className="hero">
        <div className="kicker">The nerd view</div>
        <h1 className="display">Advanced</h1>
        <p>
          The working behind the stat-leader picks. Every number is <b>per game</b> across{" "}
          {weights.map(([y, w]) => `${y} at ${Math.round(w * 100)}%`).join(" and ")}, the same weighting the projection
          uses. Nothing on this page picks anything — it is here to explain, and to argue with.
        </p>
        <div className="meth">
          Rate stats travel between seasons far better than totals do, so this is where you can tell a real signal from
          a player who simply had the ball a lot on a bad team.
        </div>
      </section>

      {data.boards.map((board) => (
        <div key={board.id}>
          <h2 className="section-h">{board.label}</h2>
          <p className="section-sub">{board.note}</p>

          <div className="tscroll">
            <table className="data adv">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Player</th>
                  <th className="num">Proj</th>
                  <th className="num">G played</th>
                  {board.cols.map((c) => (
                    <th key={c.key} className="num">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.rows.map((r, i) => (
                  <tr key={`${r.name}-${r.team}`} className={i === 0 ? "adv-pick" : ""}>
                    <td className="rk">{i + 1}</td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{r.name}</span>{" "}
                      <span className="t-dim" style={{ fontSize: 12 }}>
                        {r.position} · {r.team}
                      </span>
                      {i === 0 && <span className="badge model" style={{ marginLeft: 8 }}>pick</span>}
                    </td>
                    <td className="num" style={{ color: "var(--neon-y)", fontWeight: 700 }}>
                      {r.projected.toLocaleString()}
                      <span className="t-dim" style={{ fontWeight: 400 }}> {board.unit}</span>
                    </td>
                    <td className="num t-mut">
                      {r.gamesPlayed.toFixed(1)}
                      <span className="t-dim"> / 17</span>
                    </td>
                    {board.cols.map((c) => {
                      const v = r.cols[c.key] ?? 0;
                      return (
                        <td key={c.key} className="num t-mut">
                          {c.dp === 3 ? `${(v * 100).toFixed(1)}%` : v.toFixed(c.dp)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="notice model">
        <b>Reading it.</b> Games played is the honest one: a player at 9 of 17 is being projected over a season he has
        not managed in two years, and the durability term only shrinks that halfway. Where a rate column disagrees with
        the projection, trust the rate — that is usually the projection over-rewarding volume on a team that trailed a
        lot and threw to catch up.
      </div>
      <div className="foot" />
    </>
  );
}
