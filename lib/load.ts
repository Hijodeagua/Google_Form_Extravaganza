import type { PoolConfig } from "@/lib/pools/types";
import { fetchSheetCsv, SheetUnavailableError } from "@/lib/sheets/fetch";
import { mapColumns, type ColumnMap } from "@/lib/sheets/headers";
import { canonicalKey } from "@/lib/resolve/normalize";
import { resolveAnswer, type AliasMap, type ResolverContext, type TeamEntity } from "@/lib/resolve/match";
import type { Resolution } from "@/lib/resolve/types";
import { readOutcome, scoreEntrant, type Entrant, type Outcome } from "@/lib/scoring/engine";

import entitiesJson from "@/data/nfl-futures-26-27/entities.json";
import aliasesJson from "@/data/nfl-futures-26-27/aliases.json";
import resultsJson from "@/data/nfl-futures-26-27/results-26-27.json";
import modelJson from "@/data/nfl-futures-26-27/model-picks.v1.json";

export interface ModelEntry {
  entrantId: string;
  displayName: string;
  version: string;
  generatedAt: string;
  sourceSnapshot: { repo: string; file: string; runDate: string; week: string; sims: number; gamesRemaining: number };
  picks: Record<string, { value: string; team?: string; confidence: number | null; basis: string }>;
  abstentions: Record<string, string>;
}

export interface PoolData {
  pool: PoolConfig;
  entrants: Entrant[];
  /** Everyone except the model — the "field". */
  humans: Entrant[];
  model: Entrant | null;
  modelEntry: ModelEntry;
  outcomes: Record<string, Outcome>;
  resolvedCount: number;
  totalQuestions: number;
  columns: ColumnMap;
  fetchedAt: string;
  /** Entries superseded by a later submission from the same name. */
  superseded: { name: string; submittedAt: string }[];
  /**
   * The sheet could not be read on this render. Only ever true during a build
   * that has no cached page to fall back on — see `loadPool`.
   */
  unavailable: string | null;
}

export const slugify = (name: string) =>
  canonicalKey(name).replace(/\s+/g, "-") || "entrant";

/** Google Forms writes "9/9/2026 13:20:46" — US month/day, 24h clock, no zone. */
function parseTimestamp(raw: string): number {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, mo, d, y, h, mi, s] = m;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

const ctx: ResolverContext = {
  teams: entitiesJson.teams as TeamEntity[],
  aliases: { global: aliasesJson.global, byQuestion: aliasesJson.byQuestion } as AliasMap,
};

export const resolverContext = ctx;

/** Reads the hand-edited resolution key into graded-ready outcomes. */
function readOutcomes(pool: PoolConfig): Record<string, Outcome> {
  const entries = resultsJson.outcomes as Record<string, Record<string, unknown>>;
  const outcomes: Record<string, Outcome> = {};
  for (const question of pool.questions) {
    if (question.gradeAgainst) continue; // graded against another question's outcome
    outcomes[question.id] = readOutcome(question, entries[question.id], ctx);
  }
  return outcomes;
}

/** Builds the model's synthetic entry from the committed, versioned picks file. */
function buildModelEntrant(pool: PoolConfig, outcomes: Record<string, Outcome>, entry: ModelEntry): Entrant {
  const resolutions: Record<string, Resolution> = {};

  for (const question of pool.questions) {
    const pick = entry.picks[question.id];
    if (pick) {
      resolutions[question.id] = {
        raw: pick.value,
        display: pick.value,
        value: pick.team ?? canonicalKey(pick.value),
        team: pick.team ?? null,
        status: "resolved",
        method: "exact",
        confidence: 1,
        note: pick.basis,
      };
    } else {
      // An abstention is a real answer here, rendered as such — not a blank.
      resolutions[question.id] = {
        raw: "",
        display: "abstained",
        value: null,
        status: "abstained",
        method: "none",
        confidence: 0,
        note: entry.abstentions[question.id] ?? "No signal",
      };
    }
  }

  return scoreEntrant(
    pool,
    {
      id: "model",
      name: entry.displayName,
      submittedAt: entry.generatedAt,
      submittedAtMs: Date.parse(entry.generatedAt),
      isModel: true,
      sidePotAnswer: null,
      optedIntoSidePot: false,
    },
    resolutions,
    outcomes,
  );
}

/**
 * The one server-side entry point: pull the sheet, map its headers, resolve every
 * answer, read the hand-edited outcomes, and score everyone including the model.
 *
 * Throws `SheetUnavailableError` when the sheet cannot be read, which is what
 * makes ISR keep serving the last good render (see lib/sheets/fetch.ts).
 */
export async function loadPool(pool: PoolConfig): Promise<PoolData> {
  const modelEntry = modelJson as unknown as ModelEntry;

  let rows: string[][];
  let fetchedAt: string;
  try {
    ({ rows, fetchedAt } = await fetchSheetCsv(pool.sheetId, pool.publishedCsvUrl));
  } catch (err) {
    if (!(err instanceof SheetUnavailableError)) throw err;

    // At runtime, rethrowing is the point: the ISR revalidation render fails and
    // Next keeps serving the last good page, which is the "fall back to the last
    // snapshot" behaviour without ever committing sheet contents.
    //
    // During the initial production build there is no last good page to fall
    // back to, and a throw would take the whole deploy down over a transient
    // network blip. So the build degrades to a responses-less render instead —
    // still a valid page, and the first revalidation fills it in.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw err;

    const outcomes = readOutcomes(pool);
    const model = buildModelEntrant(pool, outcomes, modelEntry);
    const settled = Object.values(outcomes).filter((o) => !o.pending && !o.void);
    return {
      pool,
      entrants: [model],
      humans: [],
      model,
      modelEntry,
      outcomes,
      resolvedCount: settled.length,
      totalQuestions: Object.keys(outcomes).length,
      columns: { byQuestion: {}, name: -1, timestamp: -1, sidePot: null, missing: [], unmapped: [] },
      fetchedAt: new Date().toISOString(),
      superseded: [],
      unavailable: (err as Error).message,
    };
  }

  const columns = mapColumns(pool, rows[0] ?? []);
  const body = rows.slice(1);

  const outcomes = readOutcomes(pool);

  // Latest submission per person wins; earlier ones are reported, not scored.
  const latest = new Map<string, { row: string[]; at: number; raw: string }>();
  const superseded: PoolData["superseded"] = [];

  for (const row of body) {
    const name = (row[columns.name] ?? "").trim();
    if (!name) continue;
    const at = parseTimestamp(row[columns.timestamp] ?? "");
    const key = canonicalKey(name);
    const prev = latest.get(key);
    if (prev && prev.at >= at) {
      superseded.push({ name, submittedAt: row[columns.timestamp] ?? "" });
      continue;
    }
    if (prev) superseded.push({ name, submittedAt: prev.raw });
    latest.set(key, { row, at, raw: row[columns.timestamp] ?? "" });
  }

  const humans: Entrant[] = [...latest.values()].map(({ row, at, raw }) => {
    const name = (row[columns.name] ?? "").trim();
    const resolutions: Record<string, Resolution> = {};
    for (const question of pool.questions) {
      const idx = columns.byQuestion[question.id];
      const answer = idx === undefined ? "" : (row[idx] ?? "");
      resolutions[question.id] = resolveAnswer(answer, question.domain, question.id, ctx);
    }

    const sidePotAnswer = columns.sidePot === null ? null : (row[columns.sidePot] ?? "").trim();
    const optedIn =
      !!sidePotAnswer && !!pool.sidePotColumn?.optedIn.includes(canonicalKey(sidePotAnswer));

    return scoreEntrant(
      pool,
      { id: slugify(name), name, submittedAt: raw, submittedAtMs: at, isModel: false, sidePotAnswer, optedIntoSidePot: optedIn },
      resolutions,
      outcomes,
    );
  });

  const model = buildModelEntrant(pool, outcomes, modelEntry);
  const settled = Object.values(outcomes).filter((o) => !o.pending && !o.void);

  return {
    pool,
    entrants: [...humans, model],
    humans,
    model,
    modelEntry,
    outcomes,
    resolvedCount: settled.length,
    totalQuestions: Object.keys(outcomes).length,
    columns,
    fetchedAt,
    superseded,
    unavailable: null,
  };
}
