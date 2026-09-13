# crossword-grid-lint

A parser and pretty printer for crossword grids stored as plain text.

I keep a folder of crossword grids I've drafted by hand as `.txt` files
(one character per square) and wanted a single tool that could tell me
whether a grid is actually valid before I bother filling in clues, and
that could reformat it consistently. Existing tools mostly assume you're
already working in a GUI editor or a binary format like `.puz`. This
works on the plain text directly.

The core design decision: validation is strict by default. A grid has to
be square, symmetric, fully checked, and free of two-letter answers to
pass. Real puzzles vary a lot, though (cryptics allow unchecked squares,
some grids aren't square, some styles allow short answers), so every
strict check can be downgraded to a warning with `--lenient` instead of
being hardcoded away.

## Grid format

One line per row. `#` is a block, `.` is an empty (unsolved) square, and
any letter is a filled square. An optional `%title:` line above the grid
sets a title.

```
%title: Weekend Special
....#
.....
.....
.....
#....
```

Rows must all be the same length. Lowercase letters are only accepted in
`--lenient` mode (they get folded to uppercase with a warning); anything
else unrecognized in a cell is always a hard error, since there's no
sensible grid to hand back otherwise.

## Library usage

```ts
import { parseGrid, computeEntries, GridParseError } from "./src/grid.js";
import { printGrid } from "./src/printer.js";

const source = `
....#
.....
.....
.....
#....
`;

try {
  const { grid, issues } = parseGrid(source);
  for (const issue of issues) console.warn(issue.message);

  console.log(printGrid(grid));
  console.log(`${computeEntries(grid).length} entries`);
} catch (err) {
  if (err instanceof GridParseError) {
    for (const issue of err.issues) console.error(issue.message);
  } else {
    throw err;
  }
}
```

`printGrid` output for the grid above (each cell is a clue number,
padded, followed by the letter or a `.` if the square is unsolved):

```
1 . 2 . 3 . 4 . ###
5 .   .   .   . 6 .
7 .   .   .   .   .
8 .   .   .   .   .
### 9 .   .   .   .
```

## CLI

```
crossword-grid-lint grid.txt                 # strict validation + pretty print
crossword-grid-lint grid.txt --lenient       # downgrade strict checks to warnings
crossword-grid-lint grid.txt --blank         # hide filled letters
crossword-grid-lint grid.txt --no-numbers    # skip clue numbering
crossword-grid-lint grid.txt --clues         # also print an ACROSS/DOWN entry list
crossword-grid-lint grid.txt --box           # box-drawing layout instead of ### tokens
```

`--box` renders the grid with box-drawing characters and solid blocks
instead of the plain `###` / bare-token layout, which reads closer to a
printed puzzle:

```
┌───┬───┬───┬───┬───┐
│1  │2  │3  │4  │███│
│ . │ . │ . │ . │███│
├───┼───┼───┼───┼───┤
│5  │   │   │   │6  │
│ . │ . │ . │ . │ . │
├───┼───┼───┼───┼───┤
...
└───┴───┴───┴───┴───┘
```

The plain-text format has no field for clue text, so `--clues` prints the
next best thing: every entry by number, spelled out from whatever letters
are filled in so far and an underscore for each square that isn't. It's
meant for checking a fill against, not for solving a puzzle blind:

```
ACROSS
1. ABCD
5. EFGHI
...

DOWN
1. AEJO
...
```

Validation failures are printed to stderr, one per line, and exit with
status 1. In `--lenient` mode the same conditions print as warnings and
the grid still prints on success.

## What strict mode checks

- Grid is square.
- Block pattern has 180-degree rotational symmetry.
- No across or down entry shorter than three letters.
- Every white square is checked in both directions (part of an across
  entry and a down entry of length two or more).

Malformed input — ragged rows, characters that aren't `#`, `.`, or a
letter — is rejected in both modes, since it can't be parsed into a grid
at all.

## Reading and writing .puz files

`src/puz.ts` reads the standard Across Lite `.puz` binary format into the
same `Grid` shape the text parser produces, plus the metadata the plain-text
format has no field for:

```ts
import { readFileSync } from "node:fs";
import { parsePuz } from "./src/puz.js";

const { grid, clues, author, notes, issues } = parsePuz(readFileSync("puzzle.puz"));
for (const issue of issues) console.warn(issue.message);
```

This covers the core layout: the solution grid, title, author, copyright,
clue text, and notes. It does not yet cover rebus squares, scrambled/locked
solutions (a scrambled file parses, but the letters you get back are the
scrambled ones, not the real answers), or the extra sections some files
carry for timers and markup.

`writePuz` goes the other way: a filled-in `Grid` plus clue text becomes a
`.puz` file, ready to open in a solving app.

```ts
import { writeFileSync } from "node:fs";
import { computeEntries } from "./src/grid.js";
import { writePuz } from "./src/puz.js";

const clues = computeEntries(grid).map(() => "TODO"); // one clue per entry, same order
const bytes = writePuz(grid, { clues, author: "Me" });
writeFileSync("puzzle.puz", bytes);
```

The grid passed in must be a complete solution - every white square needs a
letter, since the .puz solution section has no way to represent a blank -
and `clues` must line up one-to-one with `computeEntries(grid)`, in that
order. The player-state section is always written as unsolved, so the file
opens as a fresh puzzle rather than one that is already filled in. Like
`parsePuz`, rebus squares and scrambling are not supported.

## Building

No dependencies. Compile with any recent TypeScript compiler:

```
tsc
```

## Testing

Tests use Node's built-in test runner, so there's nothing to install:

```
npm test
```

## Status

Early. The format and validation rules above are what I use for my own
grids; see the roadmap for what's still missing.

## Roadmap

- A CLI flag to check symmetry/length rules independently of the full
  strict/lenient split.
- Publish to npm with proper `bin` packaging.
