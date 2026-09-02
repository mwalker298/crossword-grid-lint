#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { GridParseError, parseGrid } from "./grid.js";
import { printGrid } from "./printer.js";

/**
 * Everything main() needs from the outside world, factored out so tests can
 * run the CLI's argument handling and output formatting without touching a
 * real filesystem or process.stdout/stderr.
 */
export interface CliIO {
  readonly readFile: (path: string) => string;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
}

const nodeIO: CliIO = {
  readFile: (path) => readFileSync(path, "utf8"),
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
};

function usage(): string {
  return "usage: crossword-grid-lint <file> [--lenient] [--blank] [--no-numbers]\n";
}

export function runCli(argv: string[], io: CliIO = nodeIO): number {
  const args = argv.slice(2);
  const lenient = args.includes("--lenient");
  const blank = args.includes("--blank");
  const noNumbers = args.includes("--no-numbers");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    io.writeErr(usage());
    return 1;
  }

  let source: string;
  try {
    source = io.readFile(filePath);
  } catch (err) {
    io.writeErr(`error: could not read ${filePath}: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    const { grid, issues } = parseGrid(source, { lenient });
    for (const issue of issues) {
      io.writeErr(`warning: ${issue.message}\n`);
    }
    io.writeOut(printGrid(grid, { showSolution: !blank, showNumbers: !noNumbers }));
    io.writeOut("\n");
    return 0;
  } catch (err) {
    if (err instanceof GridParseError) {
      for (const issue of err.issues) {
        io.writeErr(`error: ${issue.message}\n`);
      }
      return 1;
    }
    throw err;
  }
}

// Only run against real argv/stdio when this file is the entry point, not
// when a test imports runCli() directly.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  process.exitCode = runCli(process.argv);
}
