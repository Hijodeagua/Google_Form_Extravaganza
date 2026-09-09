import { parseCsv } from "./csv";

/**
 * Reads a link-shared Google Sheet as CSV through the gviz endpoint.
 *
 * Why gviz and not the Sheets API: while the sheet stays link-shared this needs
 * no auth at all, which means no secret in the repo and no service account to
 * rotate. `tqx=out:csv` is the visualization query endpoint; it honours "anyone
 * with the link can view" and returns text/csv.
 *
 * ---------------------------------------------------------------------------
 * FALLBACK PATH, for the day the sheet is locked down
 * ---------------------------------------------------------------------------
 * When link sharing is turned off, this endpoint stops returning CSV and starts
 * returning a Google sign-in page (HTTP 200, text/html) — which is exactly what
 * `looksLikeHtml` below is guarding against. To restore it:
 *
 *   1. Create a GCP service account, enable the Google Sheets API, and share the
 *      sheet with the service account's email as a Viewer.
 *   2. Put the JSON key in a Vercel env var `GOOGLE_SHEETS_CREDENTIALS`
 *      (the whole JSON blob, single line). Never commit it.
 *   3. Add `googleapis` and swap `fetchSheetCsv` for a call to
 *      `sheets.spreadsheets.values.get({ spreadsheetId, range: "A:ZZ" })`,
 *      returning `res.data.values` in place of `parseCsv(text)`. Everything
 *      downstream already takes `string[][]`, so nothing else changes.
 *
 * Not built now — the sheet is public and adding a credential we do not need is
 * how repos end up with secrets in them.
 */

/** Revalidate hourly. Responses trickle in; nobody needs sub-hour freshness. */
export const SHEET_REVALIDATE_SECONDS = 3600;

export interface SheetFetch {
  rows: string[][];
  fetchedAt: string;
  /** True when we are rendering from ISR's last good page rather than a fresh pull. */
  stale: boolean;
  error?: string;
}

const csvUrl = (sheetId: string) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

/**
 * A locked-down or deleted sheet answers with an HTML sign-in page, not a 404,
 * so status alone is not enough to tell success from failure.
 */
const looksLikeHtml = (body: string) => /^\s*<(!doctype|html|head|meta)/i.test(body);

export class SheetUnavailableError extends Error {}

/**
 * Fetches and parses the sheet, or throws.
 *
 * Throwing is deliberate. Next's ISR keeps serving the last successfully
 * rendered page when a revalidation render fails, so a thrown error here means
 * readers keep seeing the last good standings instead of an empty table — the
 * "last good snapshot" behaviour, without ever writing sheet contents into the
 * repo (which the project rules forbid).
 */
export async function fetchSheetCsv(sheetId: string): Promise<SheetFetch> {
  let res: Response;
  try {
    res = await fetch(csvUrl(sheetId), {
      next: { revalidate: SHEET_REVALIDATE_SECONDS },
      headers: { accept: "text/csv,*/*" },
    });
  } catch (cause) {
    throw new SheetUnavailableError(`Sheet fetch failed: ${(cause as Error).message}`);
  }

  if (!res.ok) throw new SheetUnavailableError(`Sheet fetch returned HTTP ${res.status}`);

  const body = await res.text();
  if (looksLikeHtml(body)) {
    throw new SheetUnavailableError(
      "Sheet returned HTML, not CSV — link sharing is probably off. See the service-account fallback in lib/sheets/fetch.ts.",
    );
  }

  const rows = parseCsv(body);
  if (rows.length < 1) throw new SheetUnavailableError("Sheet returned no rows");

  return { rows, fetchedAt: new Date().toISOString(), stale: false };
}
