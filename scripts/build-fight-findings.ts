/**
 * Refreshes the committed fallback snapshot `data/fight-survey/findings.json`.
 *
 *   npx tsx scripts/build-fight-findings.ts path/to/answers.csv
 *   npx tsx scripts/build-fight-findings.ts            # fetches the sheet via gviz
 *
 * The live page does not need this: it reads the sheet itself on every hourly
 * revalidation (`lib/surveys/load.ts`). The snapshot only covers `next build`
 * when the sheet is unreachable. Only counts are written.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../lib/sheets/csv";
import { buildFightFindings, FIGHT_SHEET_ID } from "../lib/surveys/fight";

async function main() {
  const arg = process.argv[2];
  let text: string;
  if (arg) text = readFileSync(arg, "utf8");
  else {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${FIGHT_SHEET_ID}/gviz/tq?tqx=out:csv`);
    if (!res.ok) throw new Error(`sheet -> HTTP ${res.status}`);
    text = await res.text();
  }
  const findings = buildFightFindings(parseCsv(text));
  writeFileSync("data/fight-survey/findings.json", JSON.stringify(findings, null, 2) + "\n");
  const { groups, perPerson, animals } = findings;
  process.stdout.write(`${findings.responses} responses (${groups.men} men, ${groups.women} women, ${groups.other} other or not said)\n`);
  process.stdout.write(`median picks: ${perPerson.unarmed.median} unarmed, ${perPerson.knife.median} with a knife\n\n`);
  for (const a of animals) {
    process.stdout.write(`  ${a.label.padEnd(17)} unarmed ${String(a.unarmed.all.pct).padStart(3)}%  (m ${a.unarmed.men.pct}% / w ${a.unarmed.women.pct}%)   knife ${String(a.knife.all.pct).padStart(3)}%  (m ${a.knife.men.pct}% / w ${a.knife.women.pct}%)\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
