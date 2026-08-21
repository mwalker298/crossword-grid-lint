import { computeEntries, type Grid } from "./grid.js";

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

  const numberAt = new Map<string, number>();
  if (showNumbers) {
    for (const entry of computeEntries(grid)) {
      numberAt.set(`${entry.row},${entry.col}`, entry.number);
    }
  }

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
