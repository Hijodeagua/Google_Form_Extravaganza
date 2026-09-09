import type { PoolConfig, Question } from "@/lib/pools/types";

/**
 * Header text -> question id, by matching on the *text* rather than the column
 * index. Tre rewords questions between seasons; the columns also move whenever a
 * question is inserted in the middle of the Form. Both are survivable as long as
 * nothing downstream ever says `row[7]`.
 */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ColumnMap {
  /** question id -> column index */
  byQuestion: Record<string, number>;
  name: number;
  timestamp: number;
  sidePot: number | null;
  /** Questions in the config that no header satisfied — surfaced in /admin. */
  missing: Question[];
  /** Headers present in the sheet that no question claimed. */
  unmapped: string[];
}

export function mapColumns(pool: PoolConfig, headerRow: string[]): ColumnMap {
  const headers = headerRow.map(normalizeHeader);
  const claimed = new Set<number>();

  const take = (patterns: string[]): number => {
    const pats = patterns.map(normalizeHeader);
    // Prefer an exact hit, then a containment hit, and never reuse a column —
    // "mvp" would otherwise also claim "super bowl lxi mvp" and "dark horse mvp".
    let idx = headers.findIndex((h, i) => !claimed.has(i) && pats.includes(h));
    if (idx < 0) idx = headers.findIndex((h, i) => !claimed.has(i) && pats.some((p) => h.includes(p)));
    if (idx >= 0) claimed.add(idx);
    return idx;
  };

  // Longest patterns first so "super bowl lxi mvp" claims its column before the
  // bare "mvp" pattern can swallow it.
  const ordered = [...pool.questions].sort(
    (a, b) => Math.max(...b.match.map((m) => m.length)) - Math.max(...a.match.map((m) => m.length)),
  );

  const timestamp = take(pool.timestampColumn);
  const name = take(pool.nameColumn);
  const sidePot = pool.sidePotColumn ? take(pool.sidePotColumn.match) : -1;

  const byQuestion: Record<string, number> = {};
  const missing: Question[] = [];
  for (const question of ordered) {
    const idx = take(question.match);
    if (idx >= 0) byQuestion[question.id] = idx;
    else missing.push(question);
  }

  const unmapped = headerRow.filter((_, i) => !claimed.has(i) && headerRow[i].trim() !== "");

  return { byQuestion, name, timestamp, sidePot: sidePot >= 0 ? sidePot : null, missing, unmapped };
}
