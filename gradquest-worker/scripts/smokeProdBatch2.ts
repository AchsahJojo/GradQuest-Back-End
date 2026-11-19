/**
 * Prod smoke for ASU / SDSU CS / UNLV after remote D1 + deploy.
 * Reads SOP_PROXY_SECRET from .dev.vars; never prints it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const secretFile = join(root, ".dev.vars");
const outPath = join(root, "research", "batch2", "prod-smoke-results.json");
const BASE = "https://gradquest-sop.ajojo.workers.dev";

const RICH = [
  "I built a deep learning model that classified lab images with a convolutional network and computer vision pipeline.",
  "I implemented a distributed computing prototype that replicated a fault-tolerant log across three nodes.",
  "I studied computer security and cybersecurity by writing a sandbox that blocked unexpected system calls and binary analysis tooling.",
  "I trained a computer vision model on satellite photographs of coastlines using machine learning.",
  "I trained a statistical NLP model on short technical abstracts for information retrieval.",
  "I prototyped authenticated encryption for sensor packets using a small cryptography library for information assurance.",
  "I measured operating system scheduling latency on a research kernel for cyber-physical systems.",
  "I designed a relational database schema and tuned its query plans for data-intensive systems.",
  "I completed coursework covering artificial intelligence (CSE-style AI), compilers, and embedded real-time systems.",
  "I worked on wireless computer networks and cyber-physical monitoring for an undergraduate research project.",
].join(" ");

const SCHOOLS = [
  {
    id: 1,
    schoolName: "Arizona State University",
    programName: "Computer Science, M.S.",
    url: "https://degrees.asu.edu/masters-phd/major/ASU00/ESCOMSCMS/computer-science-ms",
  },
  {
    id: 14,
    schoolName: "San Diego State University",
    programName: "Computer Science, M.S.",
    url: "https://catalog.sdsu.edu/preview_program.php?catoid=12&poid=12288",
  },
  {
    id: 23,
    schoolName: "University of Nevada, Las Vegas",
    programName: "Computer Science, M.S.",
    url: "https://catalog.unlv.edu/preview_program.php?catoid=52&poid=14606",
  },
] as const;

function readProxySecret(file: string): string {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?SOP_PROXY_SECRET=(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) throw new Error("Missing SOP_PROXY_SECRET value");
    return value;
  }
  throw new Error("Missing SOP_PROXY_SECRET");
}

function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join("[redacted]") : text;
}

async function postJson(
  pathname: string,
  body: Record<string, unknown>,
  secret: string,
  userId: string,
) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${BASE}/internal/${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-GradQuest-Proxy-Secret": secret,
      },
      body: JSON.stringify({ ...body, userId }),
      signal: AbortSignal.timeout(300_000),
    });
    const text = await response.text();
    if (response.ok) return JSON.parse(text) as Record<string, unknown>;
    last = `${pathname} ${response.status}: ${redact(text, secret).slice(0, 500)}`;
    if (response.status === 503 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 12_000 * attempt));
      continue;
    }
    throw new Error(last);
  }
  throw new Error(last);
}

async function main() {
  const secret = readProxySecret(secretFile);
  const userId = `smoke-prod-${Date.now().toString(36)}`;
  await postJson(
    "resume",
    { filename: "rich.txt", mediaType: "text/plain", text: RICH },
    secret,
    userId,
  );

  const rows = [];
  for (const school of SCHOOLS) {
    const program = await postJson(
      "programs",
      {
        schoolId: school.id,
        schoolName: school.schoolName,
        programName: school.programName,
        url: school.url,
      },
      secret,
      userId,
    );
    const overlap = (await postJson("overlap", { schoolId: school.id }, secret, userId)) as {
      pairs?: { factKind: string; factName: string; factDetail: string }[];
      weak?: boolean;
      verifiedAsOf?: string | null;
    };
    const pairs = overlap.pairs ?? [];
    const row = {
      schoolId: school.id,
      schoolName: school.schoolName,
      programSource: program.source ?? null,
      programVerifiedAsOf: program.verifiedAsOf ?? null,
      factCounts: program.factCounts ?? null,
      weak: Boolean(overlap.weak),
      pairCount: pairs.length,
      verifiedAsOf: overlap.verifiedAsOf ?? null,
      facultyPairs: pairs.filter((p) => p.factKind === "faculty").length,
      coursePairs: pairs.filter((p) => p.factKind === "course").length,
      pairs: pairs.map((p) => ({
        kind: p.factKind,
        name: p.factName,
        detail: (p.factDetail || "").slice(0, 100),
      })),
    };
    rows.push(row);
    console.log(
      `PROD smoke school ${row.schoolId}: pairs=${row.pairCount} weak=${row.weak} fac=${row.facultyPairs} course=${row.coursePairs} asOf=${row.verifiedAsOf}`,
    );
  }

  writeFileSync(outPath, `${JSON.stringify({ userId, rows }, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
