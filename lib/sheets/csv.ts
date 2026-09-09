/**
 * Minimal RFC 4180 CSV reader. Google's gviz export quotes any field containing
 * a comma ("Carnell Tate, WR, Titans (+600)") and escapes an inner quote by
 * doubling it, so a naive split on commas mangles roughly a third of this
 * sheet's answers. No dependency: this is the only parsing we need.
 */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM; Google emits one and it would poison the first header.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Treat CRLF as one break.
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  // Flush a trailing field/row when the file does not end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty (a trailing newline, or blank sheet rows).
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}
