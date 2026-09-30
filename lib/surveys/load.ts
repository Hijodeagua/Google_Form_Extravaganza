import { fetchSheetCsv, SheetUnavailableError } from "@/lib/sheets/fetch";
import { buildEdhFindings, EDH_SHEET_ID, type EdhFindings } from "./edh";
import { buildFightFindings, FIGHT_SHEET_ID, type FightFindings } from "./fight";
import edhSnapshot from "@/data/edh-survey/findings.json";
import fightSnapshot from "@/data/fight-survey/findings.json";

/**
 * Survey findings, live from the sheet.
 *
 * Same contract as the pool loader: read the sheet on every ISR revalidation
 * (hourly), aggregate in memory, never write rows anywhere. If the sheet is
 * unreachable at runtime we throw, so Next keeps serving the last good page.
 * During `next build` a failed fetch must not take the deploy down, so there we
 * fall back to the committed snapshot in `data/` and say so on the page.
 */
export interface SurveyResult<T> {
  data: T;
  /** "sheet" when read live, "snapshot" when the committed fallback was used. */
  source: "sheet" | "snapshot";
  /** Why the snapshot was used, when it was. */
  reason?: string;
}

const building = () => process.env.NEXT_PHASE === "phase-production-build";

async function loadSurvey<T>(sheetId: string, build: (table: string[][]) => T, snapshot: T): Promise<SurveyResult<T>> {
  try {
    const { rows } = await fetchSheetCsv(sheetId);
    return { data: build(rows), source: "sheet" };
  } catch (err) {
    if (!(err instanceof SheetUnavailableError)) throw err;
    if (!building()) throw err;
    return { data: snapshot, source: "snapshot", reason: err.message };
  }
}

export const loadEdhFindings = () =>
  loadSurvey<EdhFindings>(EDH_SHEET_ID, buildEdhFindings, edhSnapshot as unknown as EdhFindings);

export const loadFightFindings = () =>
  loadSurvey<FightFindings>(FIGHT_SHEET_ID, buildFightFindings, fightSnapshot as unknown as FightFindings);
