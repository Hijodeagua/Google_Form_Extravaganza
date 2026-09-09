/**
 * Turning what people actually typed into something comparable.
 *
 * Every transform here is reversible in the sense that the raw string is always
 * carried alongside and is what gets *displayed*. Normalization only ever feeds
 * comparison. Real values this has to survive, all lifted from the live sheet:
 *
 *   "Buffalo Bills (+1000)"              odds baked into the answer
 *   "Myles Garrett (favorite)"           a non-odds parenthetical
 *   "Carnell Tate, WR, Titans (+600)"    position + team suffix, then odds
 *   "Saquan" / "Garret" / "Aaron Glen"   misspellings
 *   "gibbs" / "nacua"                    bare lowercase surnames
 *   "Tua "                               trailing whitespace
 *   "???" / "Dont know"                  explicit non-answers
 *   "Emmitt Smith or OJ Simpson"         two names, one box
 */

/** Position codes that appear in Form autocomplete strings like ", WR, Titans". */
const POSITIONS = new Set([
  "qb", "rb", "wr", "te", "fb", "ol", "ot", "og", "g", "c",
  "dl", "de", "dt", "edge", "lb", "ilb", "olb", "db", "cb", "s", "fs", "ss",
  "k", "p", "ls", "hc",
]);

/** Generational suffixes, dropped so "Rueben Bain Jr." matches "Rueben Bain". */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Answers that mean "I did not answer", as distinct from "I answered badly". */
const NON_ANSWERS = new Set([
  "", "-", "--", "n a", "na", "none", "no idea", "idk", "i dont know",
  "dont know", "do not know", "unknown", "tbd", "pass", "skip", "?",
]);

/** Strips every trailing parenthetical: "(+1000)", "(favorite)", "(fav)". */
export function stripParentheticals(raw: string): string {
  let out = raw.trim();
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\s*\([^()]*\)\s*$/, "").trim();
  } while (out !== prev && out.length > 0);
  return out;
}

/**
 * Drops a ", POSITION, Team" suffix. Only fires when the segment right after the
 * first comma is a known position code, so a genuinely comma-containing answer is
 * left alone.
 */
export function stripPositionSuffix(raw: string): string {
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length >= 2 && POSITIONS.has(parts[1].toLowerCase().replace(/[^a-z]/g, ""))) {
    return parts[0];
  }
  return raw;
}

/** Raw answer -> the string a human would consider "the actual answer". */
export function displayValue(raw: string): string {
  return stripPositionSuffix(stripParentheticals(raw)).trim();
}

/** Comparison key: lowercase, unaccented, punctuation-free, suffix-free. */
export function canonicalKey(raw: string): string {
  const base = displayValue(raw)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const words = base.split(" ").filter((w) => w && !NAME_SUFFIXES.has(w));
  return words.join(" ");
}

// "???", "..." and other punctuation-only answers normalize to an empty key, so
// they land here alongside the spelled-out ones.
export const isNonAnswer = (raw: string): boolean => NON_ANSWERS.has(canonicalKey(raw));

/**
 * Two-names-in-one-box. Scored zero unless the alias map says otherwise, per the
 * pool rules — "Emmitt Smith or OJ Simpson" is not a pick, it is a joke.
 */
export const isMultiAnswer = (raw: string): boolean => / \bor\b /i.test(` ${displayValue(raw)} `);

/** Last word of a name, used for the surname shortcut ("Rodgers", "nacua"). */
export const surname = (key: string): string => {
  const words = key.split(" ");
  return words[words.length - 1] ?? "";
};

export function parseNumber(raw: string): number | null {
  const m = displayValue(raw).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sørensen–Dice over character bigrams. Chosen over edit distance because it is
 * forgiving of the transposition-and-vowel-swap errors these answers actually
 * contain ("Saquan"/"Saquon", "Puca"/"Puka", "Garret"/"Garrett") without
 * rewarding two short unrelated strings the way a normalized Levenshtein does.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };

  const ma = bigrams(a);
  const mb = bigrams(b);
  let hits = 0;
  let total = 0;
  for (const n of ma.values()) total += n;
  for (const n of mb.values()) total += n;
  for (const [g, n] of ma) hits += Math.min(n, mb.get(g) ?? 0);
  return (2 * hits) / total;
}
