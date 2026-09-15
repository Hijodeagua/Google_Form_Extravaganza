/**
 * Turns the EDH Survey responses into `data/edh-survey/findings.json`.
 *
 *   npx tsx scripts/build-edh-findings.ts path/to/answers.csv
 *   npx tsx scripts/build-edh-findings.ts            # fetches the sheet via gviz
 *
 * Run by hand and commit the result. The survey closed in January 2025, so
 * there is nothing to revalidate, and committing aggregates rather than rows
 * keeps individual answers out of the repo. Only counts leave this script.
 *
 * The findings are split into two parts, following the shape of the form:
 * Part 1 asks about the player, Part 2 about how they play Commander.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../lib/sheets/csv";

const SHEET_ID = "1naPb5Gwe44dzbJSrMaOnrqxHr_SPsLAfcLqQSzTNU-o";

type Row = Record<string, string>;
interface Item { label: string; count: number; pct: number }
interface Question {
  id: string; label: string; kind: "single" | "multi" | "years" | "scale" | "open";
  answered: number; items: Item[]; note?: string; distinct?: number; median?: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const items = (counts: Map<string, number>, answered: number, keep = 8, otherLabel = "Other"): Item[] => {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // A one-off write-in is not a finding. Anything named only once folds into
  // Other, unless the whole question is one-offs (favourite commander).
  const cut = sorted.filter(([, c]) => c > 1).length > 0 ? sorted.findIndex(([, c]) => c < 2) : sorted.length;
  const limit = Math.min(keep, cut < 0 ? sorted.length : cut);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit).reduce((n, [, c]) => n + c, 0);
  const out = head.map(([label, count]) => ({ label, count, pct: pct(count, answered) }));
  if (tail > 0) out.push({ label: otherLabel, count: tail, pct: pct(tail, answered) });
  return out;
};
const NON_ANSWERS = new Set(["", "none", "n a", "na", "no idea", "idk", "q", "dont know", "not sure", "no", "nope", "no one"]);

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

/** Column lookup by header text, so a reworded question still resolves. */
const col = (rows: Row[], ...needles: string[]): string => {
  const keys = Object.keys(rows[0]);
  const hit = keys.find((k) => needles.every((n) => norm(k).includes(norm(n))));
  if (!hit) throw new Error(`no column matching ${needles.join(" + ")}`);
  return hit;
};

async function main() {
  const rows = await loadRows();
  const N = rows.length;
  const answered = (key: string) => rows.filter((r) => r[key] !== "").length;

  // ---- years ----
  const yearQ = (key: string, id: string, label: string): Question => {
    const years = rows.map((r) => parseInt(r[key], 10)).filter((y) => y >= 1993 && y <= 2026).sort((a, b) => a - b);
    const eras: [string, (y: number) => boolean][] = [
      ["Before 2000", (y) => y < 2000], ["2000 to 2009", (y) => y < 2010], ["2010 to 2014", (y) => y < 2015],
      ["2015 to 2019", (y) => y < 2020], ["2020 to 2022", (y) => y < 2023], ["2023 or later", () => true],
    ];
    const counts = new Map<string, number>();
    for (const y of years) { const era = eras.find(([, f]) => f(y))![0]; counts.set(era, (counts.get(era) ?? 0) + 1); }
    const list = eras.map(([e]) => ({ label: e, count: counts.get(e) ?? 0, pct: pct(counts.get(e) ?? 0, years.length) }));
    return { id, label, kind: "years", answered: years.length, items: list, median: years[Math.floor(years.length / 2)] };
  };

  // ---- single-choice with light normalisation ----
  const singleQ = (key: string, id: string, label: string, canon: (v: string) => string, keep = 8, dropNonAnswers = true): Question => {
    const counts = new Map<string, number>();
    let n = 0;
    for (const r of rows) {
      const v = r[key]; if (!v || (dropNonAnswers && NON_ANSWERS.has(norm(v)))) continue;
      n++; const c = canon(v); counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return { id, label, kind: "single", answered: n, items: items(counts, n, keep), distinct: counts.size };
  };

  const kMagic = col(rows, "first start playing magic");
  const kEdh = col(rows, "first start playing commander");
  const kFirstFmt = col(rows, "first magic format");
  const kFavFmt = col(rows, "favorite magic format");
  const kDecks = col(rows, "how many commander decks");
  const kFavCmd = col(rows, "favorite commander");
  const kStrong = col(rows, "strongest commander");
  const kPower = col(rows, "judge the power level");
  const kChoose = col(rows, "choose a commander");
  const kBuild = col(rows, "build the 99");
  const kCedh = col(rows, "play cedh");
  const kCreator = col(rows, "favorite edh content creator");
  const kShout = col(rows, "shout out");
  const kAgain = col(rows, "answering other commander questions");

  const fmtCanon = (v: string) => {
    const k = norm(v);
    if (k.includes("kitchen") || k.includes("freeform") || k.includes("table top") || k.includes("casual 60")) return "Kitchen table";
    if (k.includes("commander") || k === "edh") return "Commander";
    if (k.includes("limited") || k.includes("draft") || k.includes("sealed")) return "Limited";
    for (const f of ["Standard", "Modern", "Pauper", "Legacy", "Cube", "Pioneer", "Vintage", "Brawl", "Oathbreaker"]) if (k.includes(f.toLowerCase())) return f;
    return v;
  };

  const deckCanon = (v: string) => {
    const k = v.replace(/\.0$/, "");
    if (/^[1-5]$/.test(k)) return `${k} deck${k === "1" ? "" : "s"}`;
    return k === "6-10" ? "6 to 10" : k === "10-20" ? "10 to 20" : k === "20+" ? "20 or more" : v;
  };
  const DECK_ORDER = ["1 deck", "2 decks", "3 decks", "4 decks", "5 decks", "6 to 10", "10 to 20", "20 or more"];

  const strongCanon = (v: string) => {
    const k = norm(v);
    const names: [string, string][] = [
      ["tymna", "Tymna (any partner)"], ["thrasios", "Tymna (any partner)"], ["kraum", "Tymna (any partner)"],
      ["atraxa", "Atraxa"], ["urza", "Urza, Lord High Artificer"], ["yuriko", "Yuriko"], ["kinnan", "Kinnan"],
      ["najeela", "Najeela"], ["rograkh", "Rograkh / Silas"], ["silas", "Rograkh / Silas"], ["kenrith", "Kenrith"],
      ["tivit", "Tivit"], ["magda", "Magda"], ["winota", "Winota"], ["korvold", "Korvold"], ["k rrik", "K'rrik"],
      ["krrik", "K'rrik"], ["sisay", "Sisay"], ["godo", "Godo"], ["talion", "Talion"], ["etali", "Etali"],
      ["edgar", "Edgar Markov"], ["thassa", "Thassa's Oracle"],
    ];
    for (const [needle, label] of names) if (k.includes(needle)) return label;
    return v;
  };

  const chooseCanon = (v: string) => {
    const k = norm(v);
    if (k === "theme") return "Theme";
    if (k.includes("pack")) return "Found the card in a pack";
    if (k.includes("power")) return "Power level";
    if (k.includes("mechanic")) return "Interesting mechanics";
    return "Wrote their own answer";
  };

  const buildCanon = (v: string) => {
    const k = norm(v);
    if (k.includes("scryfall")) return "Search Scryfall";
    if (k.includes("edh rec") || k.includes("edhrec")) return "EDHREC";
    if (k.includes("collection")) return "From my own collection";
    if (k.includes("decklist") || k.includes("online")) return "A decklist found online";
    if (k.includes("all of")) return "All of the above";
    return "Wrote their own answer";
  };

  const creatorCanon = (v: string) => {
    const k = norm(v);
    const names: [string, string][] = [
      ["commander at home", "Commander at Home"], ["tolarian", "Tolarian Community College"],
      ["salubrious", "Salubrious Snail"], ["play to win", "Play to Win"], ["command zone", "The Command Zone"],
      ["maldhound", "Maldhound"], ["trinket mage", "The Trinket Mage"], ["loadingreadyrun", "LoadingReadyRun"],
      ["loading ready run", "LoadingReadyRun"], ["mtg goldfish", "MTGGoldfish"], ["mtggoldfish", "MTGGoldfish"],
      ["game knights", "The Command Zone"], ["extra turns", "Extra Turns"], ["cedh tv", "cEDH TV"],
      ["playing with power", "Playing With Power"], ["commanders herald", "Commander's Herald"],
      ["commander s herald", "Commander's Herald"], ["spice 8 rack", "Spice8Rack"], ["spice8rack", "Spice8Rack"],
      ["nitpicking nerds", "Nitpicking Nerds"], ["mtg muddstah", "MTG Muddstah"], ["muddstah", "MTG Muddstah"],
      ["jumbo commander", "Jumbo Commander"], ["cardboard crack", "Cardboard Crack"], ["shuffle up", "Shuffle Up & Play"],
      ["josh lee kwai", "The Command Zone"], ["rhystic studies", "Rhystic Studies"],
    ];
    for (const [needle, label] of names) if (k.includes(needle)) return label;
    return v.replace(/\s+/g, " ").trim();
  };

  // ---- multi-select, options that themselves contain commas ----
  const POWER_OPTIONS: [string, string][] = [
    ["Does the deck run fast mana (other then sol ring)", "Fast mana beyond Sol Ring"],
    ["Personal history with the player/pilot of the deck", "History with the pilot"],
    ["Personal history with the deck", "History with the deck"],
    ['Theme / Archetype (i.e. "artifacts are broken" or "infect is kill on sight")', "Theme or archetype"],
    ["Number of combos", "Number of combos"],
    ["Number of Tutors", "Number of tutors"],
    ["The Commander", "The commander itself"],
  ];
  const powerQ = (): Question => {
    const counts = new Map<string, number>();
    let n = 0;
    for (const r of rows) {
      let v = r[kPower]; if (!v) continue;
      n++;
      let matched = false;
      for (const [raw, label] of POWER_OPTIONS) {
        if (v.includes(raw)) { counts.set(label, (counts.get(label) ?? 0) + 1); v = v.replace(raw, ""); matched = true; }
      }
      if (v.replace(/[,\s]/g, "") !== "") counts.set("Wrote their own answer", (counts.get("Wrote their own answer") ?? 0) + 1);
      else if (!matched) counts.set("Wrote their own answer", (counts.get("Wrote their own answer") ?? 0) + 1);
    }
    return { id: "power", label: "How do you judge the power level of a deck? (pick two)", kind: "multi", answered: n, items: items(counts, n, 8), note: "Percentages are of respondents, and each picked up to two, so they do not sum to 100." };
  };

  // ---- the cEDH scale ----
  const cedhQ = (): Question => {
    const counts = new Map<string, number>();
    let n = 0;
    for (const r of rows) { const v = parseInt(r[kCedh], 10); if (!v) continue; n++; const k = v >= 5 ? "5 or more" : String(v); counts.set(k, (counts.get(k) ?? 0) + 1); }
    const order = ["1", "2", "3", "4", "5 or more"];
    return {
      id: "cedh", label: "Do you play cEDH? (1 = never)", kind: "scale", answered: n,
      items: order.map((k) => ({ label: k === "1" ? "1, never" : k, count: counts.get(k) ?? 0, pct: pct(counts.get(k) ?? 0, n) })),
      note: "Asked as a scale where 1 means never.",
    };
  };

  const favCmd = singleQ(kFavCmd, "favorite_commander", "Who is your favorite commander?", (v) => v.replace(/\s+/g, " "), 6);
  favCmd.kind = "open";
  favCmd.note = `${favCmd.distinct} different commanders named by ${favCmd.answered} people. Nobody's favourite was named more than three times.`;

  const decks = singleQ(kDecks, "decks", "How many Commander decks do you own?", deckCanon, 8);
  decks.items.sort((a, b) => DECK_ORDER.indexOf(a.label) - DECK_ORDER.indexOf(b.label));

  const again = singleQ(kAgain, "again", "Would you answer another poll like this?", (v) => v, 3, false);

  const findings = {
    title: "The EDH Survey",
    subtitle: "What 358 Commander players said about how they got here and how they play.",
    responses: N,
    collected: "January 2025",
    sheetId: SHEET_ID,
    generatedAt: new Date().toISOString(),
    parts: [
      {
        id: "one", title: "Part one: the players", kicker: "Who answered",
        blurb: "When they started, what they started on, and how deep in they are now.",
        questions: [
          yearQ(kMagic, "start_magic", "What year did you first start playing Magic?"),
          yearQ(kEdh, "start_edh", "What year did you first start playing Commander?"),
          singleQ(kFirstFmt, "first_format", "What was your first Magic format?", fmtCanon, 6),
          singleQ(kFavFmt, "favorite_format", "What is your favorite Magic format?", fmtCanon, 6),
          decks,
        ],
      },
      {
        id: "two", title: "Part two: how they play", kicker: "The format",
        blurb: "What they run, what they fear, how they build, and who they watch.",
        questions: [
          favCmd,
          singleQ(kStrong, "strongest", "Who is the strongest commander in the format?", strongCanon, 8),
          powerQ(),
          singleQ(kChoose, "choose", "How do you usually choose a commander?", chooseCanon, 5),
          singleQ(kBuild, "build", "How do you usually build the 99?", buildCanon, 6),
          cedhQ(),
          singleQ(kCreator, "creator", "Favorite EDH content creator?", creatorCanon, 8),
          singleQ(kShout, "shoutout", "A creator that deserves a shout-out?", creatorCanon, 6),
          again,
        ],
      },
    ],
  };

  writeFileSync("data/edh-survey/findings.json", JSON.stringify(findings, null, 2) + "\n");
  process.stdout.write(`${N} responses -> ${findings.parts.reduce((n, p) => n + p.questions.length, 0)} questions\n\n`);
  for (const part of findings.parts) {
    process.stdout.write(`${part.title}\n`);
    for (const q of part.questions) {
      const top = q.items.slice(0, 3).map((i) => `${i.label} ${i.pct}%`).join(" · ");
      process.stdout.write(`  ${q.id.padEnd(19)} n=${String(q.answered).padStart(3)}  ${top}${q.median ? `  (median ${q.median})` : ""}\n`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
