import type { Cell, Grid } from "./grid.js";

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

const MAGIC = "ACROSS&DOWN\0";
const HEADER_LENGTH = 0x34;

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
