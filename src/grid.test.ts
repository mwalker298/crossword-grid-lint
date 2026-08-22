import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEntries, GridParseError, parseGrid } from "./grid.js";

// The grid from the README example: square, symmetric, fully checked, no
// entry under three letters. Used as the baseline "this should just work"
// fixture for both this file and printer.test.ts.
const VALID_GRID = `....#
.....
.....
.....
#....`;

test("parses a valid strict grid with no issues", () => {
  const { grid, issues } = parseGrid(VALID_GRID);
  assert.equal(issues.length, 0);
  assert.equal(grid.width, 5);
  assert.equal(grid.height, 5);
  assert.equal(grid.rows[0][4]?.kind, "block");
  assert.equal(grid.rows[4][0]?.kind, "block");
});

test("reads an optional title line above the grid", () => {
  const { grid } = parseGrid(`%title: Weekend Special\n${VALID_GRID}`);
  assert.equal(grid.title, "Weekend Special");
});

test("has no title when none is given", () => {
  const { grid } = parseGrid(VALID_GRID);
  assert.equal(grid.title, null);
});

test("rejects ragged rows", () => {
  assert.throws(() => parseGrid("...\n....\n..."), GridParseError);
});

test("rejects characters that are not a block, blank, or letter", () => {
  try {
    parseGrid("..X\n...\n...");
    assert.fail("expected parseGrid to throw");
  } catch (err) {
    assert.ok(err instanceof GridParseError);
    assert.ok(err.issues.some((issue) => issue.message.includes("unrecognized character")));
  }
});

test("rejects lowercase letters in strict mode", () => {
  try {
    parseGrid("abc\ndef\nghi");
    assert.fail("expected parseGrid to throw");
  } catch (err) {
    assert.ok(err instanceof GridParseError);
    assert.ok(err.issues.some((issue) => issue.message.includes("requires --lenient")));
  }
});

test("folds lowercase letters to uppercase with a warning in lenient mode", () => {
  const { grid, issues } = parseGrid("abc\ndef\nghi", { lenient: true });
  const cell = grid.rows[0][0];
  assert.equal(cell?.kind, "white");
  assert.equal(cell?.kind === "white" ? cell.letter : null, "A");
  assert.ok(issues.some((issue) => issue.message.includes("normalized lowercase letter")));
});

test("strict mode rejects a non-square grid", () => {
  try {
    parseGrid("....\n....");
    assert.fail("expected parseGrid to throw");
  } catch (err) {
    assert.ok(err instanceof GridParseError);
    assert.ok(err.issues.some((issue) => issue.message.includes("expected a square grid")));
  }
});

test("lenient mode downgrades a non-square grid to a warning", () => {
  const { issues } = parseGrid("....\n....", { lenient: true });
  assert.ok(issues.some((issue) => issue.message.includes("expected a square grid")));
});

test("strict mode rejects an asymmetric block pattern", () => {
  try {
    parseGrid("..#\n...\n...");
    assert.fail("expected parseGrid to throw");
  } catch (err) {
    assert.ok(err instanceof GridParseError);
    assert.ok(
      err.issues.some((issue) => issue.message.includes("180-degree rotational symmetry")),
    );
  }
});

test("strict mode rejects entries shorter than three letters", () => {
  try {
    // Blocks at (0,2) and (2,0) are symmetric, so this isolates the length
    // check from the symmetry check.
    parseGrid("..#\n...\n#..");
    assert.fail("expected parseGrid to throw");
  } catch (err) {
    assert.ok(err instanceof GridParseError);
    assert.ok(err.issues.some((issue) => issue.message.includes("minimum 3")));
  }
});

test("strict mode rejects squares that are only checked in one direction", () => {
  // Rows 0, 2, 4 are open (across entries of length 5); rows 1 and 3 are
  // solid blocks, so no down entry can ever span the open rows.
  const source = ".....\n#####\n.....\n#####\n.....";
  try {
    parseGrid(source);
    assert.fail("expected parseGrid to throw");
  } catch (err) {
    assert.ok(err instanceof GridParseError);
    assert.ok(err.issues.some((issue) => issue.message.includes("not fully checked")));
  }
});

test("computeEntries numbers and sizes entries the way a standard grid does", () => {
  const { grid } = parseGrid(VALID_GRID);
  const entries = computeEntries(grid);
  assert.equal(entries.length, 10);

  const byKey = new Map(entries.map((entry) => [`${entry.number}-${entry.direction}`, entry]));

  const oneAcross = byKey.get("1-across");
  assert.equal(oneAcross?.row, 0);
  assert.equal(oneAcross?.col, 0);
  assert.equal(oneAcross?.length, 4);

  const oneDown = byKey.get("1-down");
  assert.equal(oneDown?.length, 4);

  // (0,4) is a block, so column 4's down entry starts one row down, under
  // its own number rather than sharing 1's.
  const sixDown = byKey.get("6-down");
  assert.equal(sixDown?.row, 1);
  assert.equal(sixDown?.col, 4);
  assert.equal(sixDown?.length, 4);

  const nineAcross = byKey.get("9-across");
  assert.equal(nineAcross?.row, 4);
  assert.equal(nineAcross?.col, 1);
  assert.equal(nineAcross?.length, 4);
});
