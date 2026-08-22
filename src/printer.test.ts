import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGrid } from "./grid.js";
import { printGrid } from "./printer.js";

const VALID_GRID = `....#
.....
.....
.....
#....`;

// Same block pattern as VALID_GRID, filled in with letters, so the solution
// display can be exercised without touching validation.
const FILLED_GRID = `ABCD#
EFGHI
JKLMN
OPQRS
#TUVW`;

test("matches the layout documented in the README", () => {
  const { grid } = parseGrid(VALID_GRID);
  const output = printGrid(grid);
  const expected = [
    "1 . 2 . 3 . 4 . ###",
    "5 .   .   .   . 6 .",
    "7 .   .   .   .   .",
    "8 .   .   .   .   .",
    "### 9 .   .   .   .",
  ].join("\n");
  assert.equal(output, expected);
});

test("shows solution letters by default", () => {
  const { grid } = parseGrid(FILLED_GRID);
  const output = printGrid(grid);
  assert.ok(output.includes("A"));
  assert.ok(output.includes("W"));
});

test("hides solution letters when showSolution is false", () => {
  const { grid } = parseGrid(FILLED_GRID);
  const output = printGrid(grid, { showSolution: false });
  assert.ok(!/[A-Z]/.test(output));
  assert.ok(output.includes("1 ."));
});

test("omits clue numbers when showNumbers is false", () => {
  const { grid } = parseGrid(FILLED_GRID);
  const output = printGrid(grid, { showNumbers: false });
  assert.ok(!/\d/.test(output));
  assert.ok(output.includes("  A"));
});

test("prints the title above the grid, followed by a blank line", () => {
  const { grid } = parseGrid(`%title: Weekend Special\n${VALID_GRID}`);
  const output = printGrid(grid);
  assert.ok(output.startsWith("Weekend Special\n\n"));
});

test("prints blocks as ###", () => {
  const { grid } = parseGrid(VALID_GRID);
  const output = printGrid(grid);
  const firstLine = output.split("\n")[0];
  assert.ok(firstLine?.endsWith("###"));
});
