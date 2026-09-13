import { test } from "node:test";
import assert from "node:assert/strict";
import type { Grid } from "./grid.js";
import { parsePuz, PuzParseError, PuzWriteError, writePuz } from "./puz.js";

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function cstring(text: string): number[] {
  return [...ascii(text), 0];
}

function le16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}

// A 2x2 all-white grid, no blocks:
//   AB
//   CD
// Entries: 1-across "AB", 1-down "AC", 2-down "BD", 3-across "CD" -- four
// clues in the order the numbering scan produces them. The overall and
// header checksums are deliberately left at zero; real .puz files never
// have them (the odds of a real checksum being exactly zero are negligible),
// so that exercises the mismatch-warning path without hand-computing the
// real values.
function buildPuz(): Uint8Array {
  const bytes: number[] = [];
  bytes.push(0, 0); // overall checksum (deliberately wrong)
  bytes.push(...ascii("ACROSS&DOWN\0"));
  bytes.push(0, 0); // CIB checksum (deliberately wrong)
  bytes.push(0, 0, 0, 0); // masked low checksums
  bytes.push(0, 0, 0, 0); // masked high checksums
  bytes.push(...ascii("1.3\0"));
  bytes.push(0, 0); // reserved1c
  bytes.push(0, 0); // scrambled checksum
  bytes.push(...new Array(12).fill(0)); // reserved2c
  bytes.push(2); // width
  bytes.push(2); // height
  bytes.push(...le16(4)); // number of clues
  bytes.push(0, 0); // bitmask
  bytes.push(0, 0); // scrambled tag

  bytes.push(...ascii("ABCD")); // solution
  bytes.push(...ascii("----")); // player state, all unsolved

  bytes.push(...cstring("Test")); // title
  bytes.push(...cstring("Me")); // author
  bytes.push(...cstring("")); // copyright
  bytes.push(...cstring("First across"));
  bytes.push(...cstring("First down"));
  bytes.push(...cstring("Second down"));
  bytes.push(...cstring("Third across"));
  bytes.push(...cstring("")); // notes

  return new Uint8Array(bytes);
}

test("parses a well-formed .puz buffer into a grid plus clue metadata", () => {
  const { grid, author, copyright, notes, clues, issues } = parsePuz(buildPuz());

  assert.equal(grid.width, 2);
  assert.equal(grid.height, 2);
  assert.equal(grid.title, "Test");
  assert.equal(author, "Me");
  assert.equal(copyright, null);
  assert.equal(notes, null);

  const topLeft = grid.rows[0][0];
  assert.equal(topLeft?.kind, "white");
  assert.equal(topLeft?.kind === "white" ? topLeft.letter : null, "A");

  const bottomRight = grid.rows[1][1];
  assert.equal(bottomRight?.kind === "white" ? bottomRight.letter : null, "D");

  assert.deepEqual(clues, ["First across", "First down", "Second down", "Third across"]);

  assert.ok(issues.some((issue) => issue.message.includes("header checksum")));
  assert.ok(issues.some((issue) => issue.message.includes("file checksum")));
});

test("rejects a buffer missing the ACROSS&DOWN magic string", () => {
  const bytes = buildPuz();
  bytes.set(ascii("XXXXXXXXXXX\0"), 0x02);
  assert.throws(() => parsePuz(bytes), PuzParseError);
});

test("rejects a file too short to hold a header", () => {
  assert.throws(() => parsePuz(new Uint8Array(10)), PuzParseError);
});

test("rejects a file shorter than its declared grid size", () => {
  const bytes = buildPuz().subarray(0, 0x34 + 2); // header plus a partial solution
  assert.throws(() => parsePuz(bytes), PuzParseError);
});

// Same 2x2 grid buildPuz() encodes by hand, but as a Grid value so writePuz
// can build the bytes instead.
const SIMPLE_GRID: Grid = {
  title: "Mini",
  width: 2,
  height: 2,
  rows: [
    [
      { kind: "white", letter: "A" },
      { kind: "white", letter: "B" },
    ],
    [
      { kind: "white", letter: "C" },
      { kind: "white", letter: "D" },
    ],
  ],
};

const SIMPLE_CLUES = ["First across", "First down", "Second down", "Third across"];

test("round-trips a grid through writePuz and parsePuz with no issues", () => {
  const bytes = writePuz(SIMPLE_GRID, {
    clues: SIMPLE_CLUES,
    author: "Me",
    copyright: "2026",
    notes: "solve in pen",
  });
  const result = parsePuz(bytes);

  assert.deepEqual(result.issues, []);
  assert.equal(result.grid.width, 2);
  assert.equal(result.grid.height, 2);
  assert.equal(result.grid.title, "Mini");
  assert.equal(result.author, "Me");
  assert.equal(result.copyright, "2026");
  assert.equal(result.notes, "solve in pen");
  assert.deepEqual(result.clues, SIMPLE_CLUES);

  const topLeft = result.grid.rows[0][0];
  assert.equal(topLeft.kind === "white" ? topLeft.letter : null, "A");
  const bottomRight = result.grid.rows[1][1];
  assert.equal(bottomRight.kind === "white" ? bottomRight.letter : null, "D");
});

test("writePuz rejects a clue count that does not match the entry count", () => {
  assert.throws(() => writePuz(SIMPLE_GRID, { clues: ["only one"] }), PuzWriteError);
});

test("writePuz rejects a grid with an unfilled white square", () => {
  const grid: Grid = {
    title: null,
    width: 2,
    height: 2,
    rows: [
      [
        { kind: "white", letter: null },
        { kind: "white", letter: "B" },
      ],
      [
        { kind: "white", letter: "C" },
        { kind: "white", letter: "D" },
      ],
    ],
  };
  assert.throws(() => writePuz(grid, { clues: SIMPLE_CLUES }), PuzWriteError);
});

test("writePuz rejects text with characters outside Latin-1", () => {
  assert.throws(
    () => writePuz(SIMPLE_GRID, { clues: SIMPLE_CLUES, notes: `winter${String.fromCharCode(0x2603)}` }),
    PuzWriteError,
  );
});
