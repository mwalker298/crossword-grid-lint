import { computeEntries, type Cell, type Grid } from "./grid.js";

export interface PuzIssue {
  readonly severity: "warning";
  readonly message: string;
}

export interface PuzParseResult {
  readonly grid: Grid;
  readonly author: string | null;
  readonly copyright: string | null;
  readonly clues: readonly string[];
  readonly notes: string | null;
  readonly issues: PuzIssue[];
}

export class PuzParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PuzParseError";
  }
}

export class PuzWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PuzWriteError";
  }
}

export interface PuzWriteOptions {
  /**
   * One clue per across/down entry, in the same order computeEntries()
   * returns them: row-major scan, across before down for a shared number.
   */
  readonly clues: readonly string[];
  readonly author?: string | null;
  readonly copyright?: string | null;
  readonly notes?: string | null;
}

const MAGIC = "ACROSS&DOWN\0";
const HEADER_LENGTH = 0x34;
const BLOCK_CODE = ".".charCodeAt(0);
const EMPTY_STATE_CODE = "-".charCodeAt(0);

function cksumRegion(bytes: Uint8Array, seed: number): number {
  let cksum = seed;
  for (const byte of bytes) {
    cksum = (cksum & 1) !== 0 ? ((cksum >>> 1) + 0x8000) & 0xffff : cksum >>> 1;
    cksum = (cksum + byte) & 0xffff;
  }
  return cksum;
}

function latin1Decode(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function latin1Encode(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function readCString(bytes: Uint8Array, offset: number): { text: string; next: number } {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return { text: latin1Decode(bytes.subarray(offset, end)), next: end + 1 };
}

/**
 * Parses a .puz (Across Lite) binary crossword file into the same Grid shape
 * the plain-text parser produces, plus the metadata the text format has no
 * room for: author, copyright, clue text, and notes.
 *
 * Only the core layout is supported. Rebus squares, scrambled/locked
 * solutions, and the extra sections that follow the clues and notes (timer
 * state, markup, rebus tables) are not read; a scrambled solution still
 * parses, but its letters are the scrambled ones, not the real answers.
 *
 * Checksum mismatches are reported as warnings rather than treated as fatal,
 * since a hand-edited or slightly nonstandard file is still worth reading.
 */
export function parsePuz(source: Uint8Array): PuzParseResult {
  if (source.length < HEADER_LENGTH) {
    throw new PuzParseError("file is too short to be a .puz puzzle");
  }

  const magic = latin1Decode(source.subarray(0x02, 0x0e));
  if (magic !== MAGIC) {
    throw new PuzParseError(`missing "ACROSS&DOWN" magic string, found ${JSON.stringify(magic)}`);
  }

  const width = source[0x2c];
  const height = source[0x2d];
  const numClues = source[0x2e] | (source[0x2f] << 8);
  const scrambledTag = source[0x32] | (source[0x33] << 8);

  const issues: PuzIssue[] = [];
  if (scrambledTag !== 0) {
    issues.push({
      severity: "warning",
      message: "solution is scrambled; letters read from this file will not be the real answers",
    });
  }

  const cibBytes = source.subarray(0x2c, 0x34);
  const cibChecksum = source[0x0e] | (source[0x0f] << 8);
  if (cksumRegion(cibBytes, 0) !== cibChecksum) {
    issues.push({ severity: "warning", message: "header checksum does not match; file may be corrupted" });
  }

  const gridSize = width * height;
  const solutionStart = HEADER_LENGTH;
  const stateStart = solutionStart + gridSize;
  const stringsStart = stateStart + gridSize;

  if (source.length < stringsStart) {
    throw new PuzParseError("file is shorter than its declared grid size");
  }

  const solution = source.subarray(solutionStart, stateStart);
  const state = source.subarray(stateStart, stringsStart);

  const rows: Cell[][] = [];
  for (let row = 0; row < height; row++) {
    const cells: Cell[] = [];
    for (let col = 0; col < width; col++) {
      const ch = String.fromCharCode(solution[row * width + col]);
      cells.push(ch === "." ? { kind: "block" } : { kind: "white", letter: ch === "-" ? null : ch });
    }
    rows.push(cells);
  }

  let offset = stringsStart;
  const readNext = (): string => {
    const { text, next } = readCString(source, offset);
    offset = next;
    return text;
  };

  const title = readNext();
  const author = readNext();
  const copyright = readNext();
  const clues: string[] = [];
  for (let i = 0; i < numClues; i++) clues.push(readNext());
  const notes = readNext();

  let fileChecksum = cksumRegion(cibBytes, 0);
  fileChecksum = cksumRegion(solution, fileChecksum);
  fileChecksum = cksumRegion(state, fileChecksum);
  if (title.length > 0) fileChecksum = cksumRegion(latin1Encode(`${title}\0`), fileChecksum);
  if (author.length > 0) fileChecksum = cksumRegion(latin1Encode(`${author}\0`), fileChecksum);
  if (copyright.length > 0) fileChecksum = cksumRegion(latin1Encode(`${copyright}\0`), fileChecksum);
  for (const clue of clues) {
    if (clue.length > 0) fileChecksum = cksumRegion(latin1Encode(clue), fileChecksum);
  }
  if (notes.length > 0) fileChecksum = cksumRegion(latin1Encode(`${notes}\0`), fileChecksum);

  const declaredChecksum = source[0x00] | (source[0x01] << 8);
  if (scrambledTag === 0 && fileChecksum !== declaredChecksum) {
    issues.push({ severity: "warning", message: "file checksum does not match; file may be corrupted" });
  }

  const grid: Grid = { title: title.length > 0 ? title : null, rows, width, height };

  return {
    grid,
    author: author.length > 0 ? author : null,
    copyright: copyright.length > 0 ? copyright : null,
    clues,
    notes: notes.length > 0 ? notes : null,
    issues,
  };
}

function assertLatin1(label: string, text: string): void {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) {
      throw new PuzWriteError(`${label} contains a character .puz cannot encode (Latin-1 only): ${JSON.stringify(text)}`);
    }
  }
}

/**
 * Writes a Grid plus clue text into the binary .puz format.
 *
 * The grid must already be a complete solution: every white square needs a
 * letter, since a .puz solution section has no way to represent "blank".
 * The player-state section is written as all unsolved ("-"), so the file
 * opens as a fresh puzzle to fill in rather than a spoiled one.
 *
 * clues must line up one-to-one with computeEntries(grid), in that order,
 * since that is the numbering scan every .puz reader assumes clue order
 * follows. Rebus squares and scrambling are not supported, matching parsePuz.
 */
export function writePuz(grid: Grid, options: PuzWriteOptions): Uint8Array {
  if (grid.width < 1 || grid.width > 0xff || grid.height < 1 || grid.height > 0xff) {
    throw new PuzWriteError(`grid is ${grid.width}x${grid.height}; .puz dimensions must be between 1 and 255`);
  }

  const entries = computeEntries(grid);
  if (options.clues.length !== entries.length) {
    throw new PuzWriteError(
      `expected ${entries.length} clues (one per across/down entry from computeEntries), got ${options.clues.length}`,
    );
  }

  const title = grid.title ?? "";
  const author = options.author ?? "";
  const copyright = options.copyright ?? "";
  const notes = options.notes ?? "";
  assertLatin1("title", title);
  assertLatin1("author", author);
  assertLatin1("copyright", copyright);
  assertLatin1("notes", notes);
  options.clues.forEach((clue, i) => assertLatin1(`clue ${i + 1}`, clue));

  const gridSize = grid.width * grid.height;
  const solution = new Uint8Array(gridSize);
  const state = new Uint8Array(gridSize);
  let index = 0;
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const cell = grid.rows[row][col];
      if (cell.kind === "block") {
        solution[index] = BLOCK_CODE;
        state[index] = BLOCK_CODE;
      } else {
        if (!cell.letter) {
          throw new PuzWriteError(`cell at row ${row + 1}, col ${col + 1} has no letter; .puz requires a complete solution`);
        }
        solution[index] = cell.letter.toUpperCase().charCodeAt(0);
        state[index] = EMPTY_STATE_CODE;
      }
      index++;
    }
  }

  const cib = new Uint8Array(8);
  cib[0] = grid.width;
  cib[1] = grid.height;
  cib[2] = entries.length & 0xff;
  cib[3] = (entries.length >> 8) & 0xff;
  cib[4] = 0x01; // bitmask; 1 is the conventional value for a normal (non-diagramless) puzzle

  const cibChecksum = cksumRegion(cib, 0);

  let fileChecksum = cksumRegion(cib, 0);
  fileChecksum = cksumRegion(solution, fileChecksum);
  fileChecksum = cksumRegion(state, fileChecksum);
  if (title.length > 0) fileChecksum = cksumRegion(latin1Encode(`${title}\0`), fileChecksum);
  if (author.length > 0) fileChecksum = cksumRegion(latin1Encode(`${author}\0`), fileChecksum);
  if (copyright.length > 0) fileChecksum = cksumRegion(latin1Encode(`${copyright}\0`), fileChecksum);
  for (const clue of options.clues) {
    if (clue.length > 0) fileChecksum = cksumRegion(latin1Encode(clue), fileChecksum);
  }
  if (notes.length > 0) fileChecksum = cksumRegion(latin1Encode(`${notes}\0`), fileChecksum);

  const header = new Uint8Array(HEADER_LENGTH);
  header[0x00] = fileChecksum & 0xff;
  header[0x01] = (fileChecksum >> 8) & 0xff;
  header.set(latin1Encode(MAGIC), 0x02);
  header[0x0e] = cibChecksum & 0xff;
  header[0x0f] = (cibChecksum >> 8) & 0xff;
  header.set(latin1Encode("1.3\0"), 0x18);
  header.set(cib, 0x2c);

  const strings = latin1Encode([title, author, copyright, ...options.clues, notes].map((s) => `${s}\0`).join(""));

  const out = new Uint8Array(header.length + solution.length + state.length + strings.length);
  out.set(header, 0);
  out.set(solution, header.length);
  out.set(state, header.length + solution.length);
  out.set(strings, header.length + solution.length + state.length);
  return out;
}
