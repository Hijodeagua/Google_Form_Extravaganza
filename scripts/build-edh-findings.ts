/**
 * Refreshes the committed fallback snapshot `data/edh-survey/findings.json`.
 *
 *   npx tsx scripts/build-edh-findings.ts path/to/answers.csv
 *   npx tsx scripts/build-edh-findings.ts            # fetches the sheet via gviz
 *
 * The live page does not need this: it reads the sheet itself on every hourly
 * revalidation (`lib/surveys/load.ts`). The snapshot only covers `next build`
 * when the sheet is unreachable. Only counts are written.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../lib/sheets/csv";
import { buildEdhFindings, EDH_SHEET_ID } from "../lib/surveys/edh";

async function main() {
  const arg = process.argv[2];
  let text: string;
  if (arg) text = readFileSync(arg, "utf8");
  else {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${EDH_SHEET_ID}/gviz/tq?tqx=out:csv`);
    if (!res.ok) throw new Error(`sheet -> HTTP ${res.status}`);
    text = await res.text();
  }
  const findings = buildEdhFindings(parseCsv(text));
  writeFileSync("data/edh-survey/findings.json", JSON.stringify(findings, null, 2) + "\n");
  process.stdout.write(`${findings.responses} responses -> ${findings.parts.reduce((n, p) => n + p.questions.length, 0)} questions\n\n`);
  for (const part of findings.parts) {
    process.stdout.write(`${part.title}\n`);
    for (const q of part.questions) {
      const top = q.items.slice(0, 3).map((i) => `${i.label} ${i.pct}%`).join(" · ");
      process.stdout.write(`  ${q.id.padEnd(19)} n=${String(q.answered).padStart(3)}  ${top}${q.median ? `  (median ${q.median})` : ""}\n`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
