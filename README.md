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

## Building

No dependencies. Compile with any recent TypeScript compiler:

```
tsc
```

## Status

Early. The format and validation rules above are what I use for my own
grids; see the roadmap for what's still missing.
