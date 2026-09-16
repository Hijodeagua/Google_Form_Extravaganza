/**
 * Turns the "Could you beat it in a fight?" responses into
 * `data/fight-survey/findings.json`.
 *
 *   npx tsx scripts/build-fight-findings.ts path/to/answers.csv
 *   npx tsx scripts/build-fight-findings.ts            # fetches the sheet via gviz
 *
 * Run by hand and commit the result. Only counts leave this script: the page
 * shows, for each animal, how many people think they would win unarmed and
 * how many think they would win with a knife, overall and split by gender.
 *
 * The form is two multi-select questions over the same fifteen animals.
 * Google joins the picks with ", " and none of the option names contain a
 * comma, so known options are matched by name and anything left over is a
 * write-in.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../lib/sheets/csv";

const SHEET_ID = "1jvDUnZAW1UUEYSnmCoSFjZA_ZzaPKs6enx04rll1eNs";

/** The options on the form, in the order the form lists them. */
const ANIMALS: [string, string][] = [
  ["Rat", "Rat"], ["House Cat", "House cat"], ["Goose", "Goose"], ["Medium Sized Dog", "Medium sized dog"],
  ["Large Dog", "Large dog"], ["Eagle", "Eagle"], ["Kangaroo", "Kangaroo"], ["Chimpanzee", "Chimpanzee"],
  ["King Cobra", "King cobra"], ["Wolf", "Wolf"], ["Crocodile", "Crocodile"], ["Gorilla", "Gorilla"],
  ["Grizzly Bear", "Grizzly bear"], ["Elephant", "Elephant"], ["Lion", "Lion"],
];

type Row = Record<string, string>;
type Group = "all" | "men" | "women";
interface Share { count: number; pct: number }
interface Animal { id: string; label: string; unarmed: Record<Group, Share>; knife: Record<Group, Share> }

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function loadRows(): Promise<Row[]> {
  const arg = process.argv[2];
  let text: string;
  if (arg) text = readFileSync(arg, "utf8");
  else {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`);
    if (!res.ok) throw new Error(`sheet -> HTTP ${res.status}`);
    text = await res.text();
  }
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const col = (rows: Row[], ...needles: string[]): string => {
  const keys = Object.keys(rows[0]);
  const hit = keys.find((k) => needles.every((n) => norm(k).includes(norm(n))));
  if (!hit) throw new Error(`no column matching ${needles.join(" + ")}`);
  return hit;
};

/** Which of the known animals a cell names, plus whether anything else was written in. */
function picks(cell: string): { ids: Set<string>; writeIn: boolean } {
  const ids = new Set<string>();
  let rest = cell;
  // Longest names first so "Large Dog" cannot be eaten by a shorter match.
  for (const [raw, label] of [...ANIMALS].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`(^|, )${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=, |$)`, "i");
    if (re.test(rest)) { ids.add(norm(label)); rest = rest.replace(re, "$1"); }
  }
  return { ids, writeIn: rest.replace(/[,\s]/g, "") !== "" };
}

function genderOf(v: string): Group | "other" {
  const k = norm(v);
  if (k === "male" || k === "man") return "men";
  if (k === "female" || k === "woman") return "women";
  return "other";
}

async function main() {
  const rows = await loadRows();
  const N = rows.length;
  const kGender = col(rows, "gender");
  const kUnarmed = col(rows, "unarmed");
  const kKnife = col(rows, "knife");

  const people = rows.map((r) => ({
    group: genderOf(r[kGender]),
    unarmed: picks(r[kUnarmed]),
    knife: picks(r[kKnife]),
  }));
  const groups: Record<Group, number> & { other: number } = {
    all: N, men: people.filter((p) => p.group === "men").length,
    women: people.filter((p) => p.group === "women").length, other: people.filter((p) => p.group === "other").length,
  };
  const share = (weapon: "unarmed" | "knife", id: string, g: Group): Share => {
    const pool = g === "all" ? people : people.filter((p) => p.group === g);
    const count = pool.filter((p) => p[weapon].ids.has(id)).length;
    return { count, pct: pct(count, pool.length) };
  };

  const animals: Animal[] = ANIMALS.map(([, label]) => {
    const id = norm(label);
    const by = (weapon: "unarmed" | "knife") => ({ all: share(weapon, id, "all"), men: share(weapon, id, "men"), women: share(weapon, id, "women") });
    return { id, label, unarmed: by("unarmed"), knife: by("knife") };
  }).sort((a, b) => b.unarmed.all.count - a.unarmed.all.count || b.knife.all.count - a.knife.all.count);

  const perPerson = (weapon: "unarmed" | "knife") => {
    const counts = people.map((p) => p[weapon].ids.size);
    return {
      median: median(counts),
      mean: Math.round((counts.reduce((a, b) => a + b, 0) / N) * 10) / 10,
      everything: counts.filter((c) => c === ANIMALS.length).length,
      none: counts.filter((c) => c === 0).length,
      writeIns: people.filter((p) => p[weapon].writeIn).length,
    };
  };

  const findings = {
    title: "Could you beat it in a fight?",
    subtitle: "Fifteen animals, two questions. Which ones would you beat with your bare hands, and which ones would you beat with a knife.",
    responses: N,
    collected: "Open since 2021",
    sheetId: SHEET_ID,
    generatedAt: new Date().toISOString(),
    groups,
    perPerson: {
      unarmed: perPerson("unarmed"),
      knife: perPerson("knife"),
      fewerWithKnife: people.filter((p) => p.knife.ids.size < p.unarmed.ids.size).length,
      sameWithKnife: people.filter((p) => p.knife.ids.size === p.unarmed.ids.size).length,
    },
    animals,
  };

  writeFileSync("data/fight-survey/findings.json", JSON.stringify(findings, null, 2) + "\n");
  process.stdout.write(`${N} responses (${groups.men} men, ${groups.women} women, ${groups.other} other or not said)\n`);
  process.stdout.write(`median picks: ${findings.perPerson.unarmed.median} unarmed, ${findings.perPerson.knife.median} with a knife\n\n`);
  for (const a of animals) {
    process.stdout.write(`  ${a.label.padEnd(17)} unarmed ${String(a.unarmed.all.pct).padStart(3)}%  (m ${a.unarmed.men.pct}% / w ${a.unarmed.women.pct}%)   knife ${String(a.knife.all.pct).padStart(3)}%  (m ${a.knife.men.pct}% / w ${a.knife.women.pct}%)\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
