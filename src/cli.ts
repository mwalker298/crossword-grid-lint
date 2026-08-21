#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { GridParseError, parseGrid } from "./grid.js";
import { printGrid } from "./printer.js";

function usage(): string {
  return "usage: crossword-grid-lint <file> [--lenient] [--blank] [--no-numbers]\n";
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  const lenient = args.includes("--lenient");
  const blank = args.includes("--blank");
  const noNumbers = args.includes("--no-numbers");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    process.stderr.write(usage());
    return 1;
  }

  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (err) {
    process.stderr.write(`error: could not read ${filePath}: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    const { grid, issues } = parseGrid(source, { lenient });
    for (const issue of issues) {
      process.stderr.write(`warning: ${issue.message}\n`);
    }
    process.stdout.write(printGrid(grid, { showSolution: !blank, showNumbers: !noNumbers }));
    process.stdout.write("\n");
    return 0;
  } catch (err) {
    if (err instanceof GridParseError) {
      for (const issue of err.issues) {
        process.stderr.write(`error: ${issue.message}\n`);
      }
      return 1;
    }
    throw err;
  }
}

process.exitCode = main(process.argv);
