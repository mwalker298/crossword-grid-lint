import { computeEntries, type Entry, type Grid } from "./grid.js";

export interface PrintOptions {
  /** Label each entry's start cell with its clue number. Default true. */
  readonly showNumbers?: boolean;
  /** Print filled-in letters. Set false to render an empty solving grid. Default true. */
  readonly showSolution?: boolean;
}

/**
 * Renders a grid as a fixed-width text block. Each cell is three characters
 * wide (two for an optional clue number, one for the letter or a blank dot)
 * so rows line up in a monospace terminal or editor.
 */
export function printGrid(grid: Grid, options: PrintOptions = {}): string {
  const showNumbers = options.showNumbers ?? true;
  const showSolution = options.showSolution ?? true;
  const numberAt = numberPositions(grid, showNumbers);

  const lines: string[] = [];
  if (grid.title) {
    lines.push(grid.title, "");
  }

  for (let row = 0; row < grid.height; row++) {
    const tokens: string[] = [];
    for (let col = 0; col < grid.width; col++) {
      const cell = grid.rows[row][col];
      if (cell.kind === "block") {
        tokens.push("###");
        continue;
      }
      const number = numberAt.get(`${row},${col}`);
      const numberPart = number !== undefined ? String(number).padEnd(2, " ") : "  ";
      const letterPart = showSolution && cell.letter ? cell.letter : ".";
      tokens.push(numberPart + letterPart);
    }
    lines.push(tokens.join(" "));
  }

  return lines.join("\n");
}

function numberPositions(grid: Grid, showNumbers: boolean): Map<string, number> {
  const numberAt = new Map<string, number>();
  if (showNumbers) {
    for (const entry of computeEntries(grid)) {
      numberAt.set(`${entry.row},${entry.col}`, entry.number);
    }
  }
  return numberAt;
}

const BOX_CELL_WIDTH = 3;
const BOX_BLOCK = "█".repeat(BOX_CELL_WIDTH);

function boxBorder(width: number, left: string, mid: string, right: string): string {
  return left + Array(width).fill("─".repeat(BOX_CELL_WIDTH)).join(mid) + right;
}

function centerInCell(text: string): string {
  const pad = BOX_CELL_WIDTH - text.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + text + " ".repeat(pad - left);
}

/**
 * Renders a grid using box-drawing characters instead of the ### / bare-token
 * layout of printGrid(). Each square is two lines tall (clue number, then
 * letter) inside a drawn border, which reads closer to a printed puzzle than
 * the ascii format does.
 */
export function printGridBoxed(grid: Grid, options: PrintOptions = {}): string {
  const showNumbers = options.showNumbers ?? true;
  const showSolution = options.showSolution ?? true;
  const numberAt = numberPositions(grid, showNumbers);

  const lines: string[] = [];
  if (grid.title) {
    lines.push(grid.title, "");
  }

  lines.push(boxBorder(grid.width, "┌", "┬", "┐"));

  for (let row = 0; row < grid.height; row++) {
    const numberCells: string[] = [];
    const letterCells: string[] = [];
    for (let col = 0; col < grid.width; col++) {
      const cell = grid.rows[row][col];
      if (cell.kind === "block") {
        numberCells.push(BOX_BLOCK);
        letterCells.push(BOX_BLOCK);
        continue;
      }
      const number = numberAt.get(`${row},${col}`);
      numberCells.push((number !== undefined ? String(number) : "").padEnd(BOX_CELL_WIDTH, " "));
      const letter = showSolution && cell.letter ? cell.letter : ".";
      letterCells.push(centerInCell(letter));
    }
    lines.push(`│${numberCells.join("│")}│`);
    lines.push(`│${letterCells.join("│")}│`);
    lines.push(
      row < grid.height - 1
        ? boxBorder(grid.width, "├", "┼", "┤")
        : boxBorder(grid.width, "└", "┴", "┘"),
    );
  }

  return lines.join("\n");
}

/**
 * Lists every entry by number, grouped into ACROSS/DOWN sections, with the
 * letters filled in so far and an underscore for each unsolved square. There
 * is no separate clue text in the plain-text grid format (see README), so
 * this is the closest thing to a clue list: it's what you'd check a partial
 * fill against.
 */
export function printEntryList(grid: Grid): string {
  const entries = computeEntries(grid);
  const across = entries.filter((entry) => entry.direction === "across");
  const down = entries.filter((entry) => entry.direction === "down");

  const section = (label: string, list: readonly Entry[]): string[] => [
    label,
    ...list.map((entry) => `${entry.number}. ${entryWord(grid, entry)}`),
  ];

  return [...section("ACROSS", across), "", ...section("DOWN", down)].join("\n");
}

function entryWord(grid: Grid, entry: Entry): string {
  let word = "";
  for (let i = 0; i < entry.length; i++) {
    const row = entry.direction === "across" ? entry.row : entry.row + i;
    const col = entry.direction === "across" ? entry.col + i : entry.col;
    const cell = grid.rows[row][col];
    word += cell.kind === "white" && cell.letter ? cell.letter : "_";
  }
  return word;
}
