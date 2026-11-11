import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { snapshotSql } from "../src/facts/report";
import type { CheckedResearch } from "../src/facts/verify";

const RESEARCH_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "research");
const CHECKED_FILE = /^school-\d+\.checked\.json$/;

function main(): void {
  let files: string[];
  try {
    files = readdirSync(RESEARCH_DIR)
      .filter((name: string) => CHECKED_FILE.test(name))
      .sort();
  } catch {
    files = [];
  }

  if (files.length === 0) {
    console.log("no files found");
    return;
  }

  const statements: string[] = [];
  for (const file of files) {
    const checked = JSON.parse(readFileSync(join(RESEARCH_DIR, file), "utf8")) as CheckedResearch;
    statements.push(`-- ${checked.schoolName} — ${checked.programName} (${file})`);
    statements.push(snapshotSql(checked));
  }

  const outputPath = join(RESEARCH_DIR, "program_facts.sql");
  writeFileSync(outputPath, `${statements.join("\n\n")}\n`);
  console.log(`wrote ${outputPath} from ${files.length} file(s)`);
}

main();
