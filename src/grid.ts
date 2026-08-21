export type Cell =
  | { readonly kind: "block" }
  | { readonly kind: "white"; readonly letter: string | null };

export interface Grid {
  readonly title: string | null;
  readonly rows: readonly (readonly Cell[])[];
  readonly width: number;
  readonly height: number;
}

export interface GridIssue {
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface ParseOptions {
  readonly lenient?: boolean;
}

export interface ParseResult {
  readonly grid: Grid;
  readonly issues: GridIssue[];
}

export interface Entry {
  readonly number: number;
  readonly direction: "across" | "down";
  readonly row: number;
  readonly col: number;
  readonly length: number;
}

export class GridParseError extends Error {
  readonly issues: GridIssue[];

  constructor(issues: GridIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "GridParseError";
    this.issues = issues;
  }
}

const BLOCK_CHAR = "#";
const BLANK_CHAR = ".";
const MIN_ENTRY_LENGTH = 3;

/**
 * Parses the plain-text grid format described in README.md.
 *
 * Strict mode (the default) rejects anything that would not stand up as a
 * conventional daily crossword: non-square dimensions, asymmetric block
 * patterns, two-letter answers, and squares that are only checked in one
 * direction. Pass { lenient: true } to downgrade those checks to warnings,
 * which is what cryptics, quick grids, and other non-standard shapes need.
 *
 * Malformed input (ragged rows, unrecognized characters) is always rejected,
 * strict or not, because there is no grid to hand back otherwise.
 */
export function parseGrid(source: string, options: ParseOptions = {}): ParseResult {
  const lenient = options.lenient ?? false;
  const hardErrors: GridIssue[] = [];
  const softIssues: GridIssue[] = [];

  let title: string | null = null;
  const gridLines: string[] = [];

  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    if (line.startsWith("%")) {
      const match = /^%\s*title\s*:?\s*(.+)$/i.exec(line);
      if (match) title = match[1].trim();
      continue;
    }
    gridLines.push(line);
  }

  if (gridLines.length === 0) {
    throw new GridParseError([{ severity: "error", message: "grid has no rows" }]);
  }

  const width = gridLines[0].length;
  const rows: Cell[][] = [];

  gridLines.forEach((line, rowIndex) => {
    if (line.length !== width) {
      hardErrors.push({
        severity: "error",
        message: `row ${rowIndex + 1} has length ${line.length}, expected ${width}`,
      });
      return;
    }

    const row: Cell[] = [];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === BLOCK_CHAR) {
        row.push({ kind: "block" });
      } else if (ch === BLANK_CHAR) {
        row.push({ kind: "white", letter: null });
      } else if (/^[A-Za-z]$/.test(ch)) {
        if (ch !== ch.toUpperCase()) {
          if (lenient) {
            softIssues.push({
              severity: "warning",
              message: `normalized lowercase letter at row ${rowIndex + 1}, col ${col + 1}`,
            });
          } else {
            hardErrors.push({
              severity: "error",
              message: `row ${rowIndex + 1}, col ${col + 1}: lowercase letter '${ch}' requires --lenient`,
            });
          }
        }
        row.push({ kind: "white", letter: ch.toUpperCase() });
      } else {
        hardErrors.push({
          severity: "error",
          message: `row ${rowIndex + 1}, col ${col + 1}: unrecognized character '${ch}'`,
        });
        row.push({ kind: "white", letter: null });
      }
    }
    rows.push(row);
  });

  if (hardErrors.length > 0) {
    throw new GridParseError(hardErrors);
  }

  const grid: Grid = { title, rows, width, height: rows.length };

  runStructuralChecks(grid, lenient, softIssues, hardErrors);

  if (hardErrors.length > 0) {
    throw new GridParseError(hardErrors);
  }

  return { grid, issues: softIssues };
}

function runStructuralChecks(
  grid: Grid,
  lenient: boolean,
  softIssues: GridIssue[],
  hardErrors: GridIssue[],
): void {
  const report = (message: string): void => {
    if (lenient) softIssues.push({ severity: "warning", message });
    else hardErrors.push({ severity: "error", message });
  };

  if (grid.width !== grid.height) {
    report(`grid is ${grid.width}x${grid.height}, expected a square grid`);
  }

  if (!hasRotationalSymmetry(grid)) {
    report("block pattern does not have 180-degree rotational symmetry");
  }

  const entries = computeEntries(grid);

  for (const entry of entries) {
    if (entry.length < MIN_ENTRY_LENGTH) {
      report(
        `${entry.direction} entry at row ${entry.row + 1}, col ${entry.col + 1} has length ${entry.length} (minimum ${MIN_ENTRY_LENGTH})`,
      );
    }
  }

  const checkedAcross = new Set<string>();
  const checkedDown = new Set<string>();
  for (const entry of entries) {
    for (let i = 0; i < entry.length; i++) {
      const row = entry.direction === "across" ? entry.row : entry.row + i;
      const col = entry.direction === "across" ? entry.col + i : entry.col;
      (entry.direction === "across" ? checkedAcross : checkedDown).add(`${row},${col}`);
    }
  }

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      if (grid.rows[row][col].kind === "block") continue;
      const key = `${row},${col}`;
      if (!checkedAcross.has(key) || !checkedDown.has(key)) {
        report(`cell at row ${row + 1}, col ${col + 1} is not fully checked (needs both an across and down entry)`);
      }
    }
  }
}

function hasRotationalSymmetry(grid: Grid): boolean {
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const cell = grid.rows[row][col];
      const mirrored = grid.rows[grid.height - 1 - row][grid.width - 1 - col];
      if ((cell.kind === "block") !== (mirrored.kind === "block")) return false;
    }
  }
  return true;
}

/**
 * Standard crossword numbering: a cell gets a number if it starts an across
 * or down entry of length two or more. Used both by validation (to find
 * unchecked squares) and by the printer (to label the grid).
 */
export function computeEntries(grid: Grid): Entry[] {
  const entries: Entry[] = [];
  let nextNumber = 1;

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      if (grid.rows[row][col].kind === "block") continue;

      const startsAcross =
        (col === 0 || grid.rows[row][col - 1].kind === "block") &&
        col + 1 < grid.width &&
        grid.rows[row][col + 1].kind !== "block";
      const startsDown =
        (row === 0 || grid.rows[row - 1][col].kind === "block") &&
        row + 1 < grid.height &&
        grid.rows[row + 1][col].kind !== "block";

      if (!startsAcross && !startsDown) continue;

      const number = nextNumber++;

      if (startsAcross) {
        let length = 0;
        while (col + length < grid.width && grid.rows[row][col + length].kind !== "block") length++;
        entries.push({ number, direction: "across", row, col, length });
      }
      if (startsDown) {
        let length = 0;
        while (row + length < grid.height && grid.rows[row + length][col].kind !== "block") length++;
        entries.push({ number, direction: "down", row, col, length });
      }
    }
  }

  return entries;
}
