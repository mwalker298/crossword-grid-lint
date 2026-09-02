import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli, type CliIO } from "./cli.js";

const VALID_GRID = `....#
.....
.....
.....
#....`;

// Same block pattern as VALID_GRID, filled in with letters, so --blank has
// something to hide.
const FILLED_GRID = `ABCD#
EFGHI
JKLMN
OPQRS
#TUVW`;

/** In-memory stand-in for real files and stdio, so no test touches disk. */
function fakeIO(files: Record<string, string>): CliIO & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    readFile: (path) => {
      if (!(path in files)) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return files[path];
    },
    writeOut: (text) => out.push(text),
    writeErr: (text) => err.push(text),
  };
}

test("prints usage and exits 1 when no file is given", () => {
  const io = fakeIO({});
  const code = runCli(["node", "cli.js"], io);
  assert.equal(code, 1);
  assert.ok(io.err.join("").startsWith("usage:"));
});

test("prints an error and exits 1 when the file can't be read", () => {
  const io = fakeIO({});
  const code = runCli(["node", "cli.js", "missing.txt"], io);
  assert.equal(code, 1);
  assert.ok(io.err.join("").includes("could not read missing.txt"));
});

test("prints the grid and exits 0 for a valid file", () => {
  const io = fakeIO({ "grid.txt": VALID_GRID });
  const code = runCli(["node", "cli.js", "grid.txt"], io);
  assert.equal(code, 0);
  assert.equal(io.err.length, 0);
  assert.ok(io.out.join("").includes("1 . 2 . 3 . 4 . ###"));
});

test("exits 1 and reports errors for an invalid grid in strict mode", () => {
  const io = fakeIO({ "grid.txt": "..#\n...\n..." });
  const code = runCli(["node", "cli.js", "grid.txt"], io);
  assert.equal(code, 1);
  assert.equal(io.out.length, 0);
  assert.ok(io.err.some((line) => line.startsWith("error:")));
});

test("--lenient downgrades errors to warnings and still prints the grid", () => {
  const io = fakeIO({ "grid.txt": "..#\n...\n..." });
  const code = runCli(["node", "cli.js", "grid.txt", "--lenient"], io);
  assert.equal(code, 0);
  assert.ok(io.err.some((line) => line.startsWith("warning:")));
  assert.ok(io.out.length > 0);
});

test("--blank hides solution letters", () => {
  const io = fakeIO({ "grid.txt": FILLED_GRID });
  const code = runCli(["node", "cli.js", "grid.txt", "--blank"], io);
  assert.equal(code, 0);
  assert.ok(!/[A-Z]/.test(io.out.join("")));
});

test("--no-numbers omits clue numbers", () => {
  const io = fakeIO({ "grid.txt": VALID_GRID });
  const code = runCli(["node", "cli.js", "grid.txt", "--no-numbers"], io);
  assert.equal(code, 0);
  assert.ok(!/\d/.test(io.out.join("")));
});
