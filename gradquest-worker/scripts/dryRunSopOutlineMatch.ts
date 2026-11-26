/**
 * Local-only dry run for SOP outline + match rules: ASU (1) + SDSU CS (14), rich/thin.
 * Uses research/eval/wrangler.eval.jsonc (local D1). Never prints secrets.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8799;
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const configPath = join(root, "research", "eval", "wrangler.eval.jsonc");
const persistTo = join(root, ".wrangler", "state-sop-outline-dryrun");
const secretFile = join(root, ".dev.vars");
const reportPath = join(root, "research", "batch2", "sop-outline-match-dryrun.json");
const wranglerBin = join(root, "node_modules", ".bin", "wrangler");

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
const THIN =
  "I studied computer science as an undergraduate. I completed several class projects. I am interested in graduate school.";

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
] as const;

type OverlapPair = {
  pairId?: string;
  factKind?: string;
  factName?: string;
  factDetail?: string;
  subtitle?: string;
  researchVerified?: boolean;
  resumeQuotes?: string[];
  resumeText?: string;
  reason?: string;
  score?: number;
};

type OverlapBody = {
  pairs?: OverlapPair[];
  visibleCount?: number;
  weak?: boolean;
  verifiedAsOf?: string | null;
  error?: string;
};

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

function runCapture(
  args: string[],
  secret: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(wranglerBin, args, {
      cwd: root,
      env: { ...process.env, SOP_PROXY_SECRET: secret },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ stdout, stderr, code: code ?? 1 }));
  });
}

async function d1Execute(fileOrCommand: { file?: string; command?: string }, secret: string) {
  const args = [
    "d1",
    "execute",
    "gradquest-sop",
    "--local",
    "--persist-to",
    persistTo,
    "--config",
    configPath,
  ];
  if (fileOrCommand.file) args.push("--file", fileOrCommand.file);
  if (fileOrCommand.command) args.push("--command", fileOrCommand.command);
  const { stdout, stderr, code } = await runCapture(args, secret);
  if (code !== 0) {
    throw new Error(`d1 execute failed: ${redact(`${stderr}\n${stdout}`, secret).slice(-2500)}`);
  }
  return stdout;
}

function startDev(secret: string) {
  let logs = "";
  const child = spawn(
    wranglerBin,
    ["dev", "--config", configPath, "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persistTo],
    {
      cwd: root,
      detached: true,
      env: { ...process.env, SOP_PROXY_SECRET: secret },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const append = (chunk: Buffer) => {
    logs = `${logs}${chunk.toString()}`.slice(-16000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return { child, logs: () => logs };
}

async function waitForDev(child: ReturnType<typeof spawn>, logs: () => string, secret: string) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited ${child.exitCode}: ${redact(logs(), secret).slice(-2000)}`);
    }
    if (/not authenticated|Failed to fetch auth|You must be logged in/i.test(logs())) {
      throw new Error(`wrangler auth failed: ${redact(logs(), secret).slice(-2000)}`);
    }
    if (logs().includes(`http://127.0.0.1:${PORT}`)) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(2000) });
        const body = await response.text();
        if (response.status === 404 && body.includes("Not found")) return;
      } catch {
        // not ready
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not listen: ${redact(logs(), secret).slice(-2000)}`);
}

async function stopDev(child: ReturnType<typeof spawn> | undefined) {
  if (!child?.pid) return;
  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      resolveStop();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  });
}

async function postJson(pathname: string, body: Record<string, unknown>, secret: string, userId: string) {
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${PORT}/internal/${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-GradQuest-Proxy-Secret": secret,
      },
      body: JSON.stringify({ ...body, userId }),
      signal: AbortSignal.timeout(300_000),
    });
    const text = await response.text();
    if (response.ok) {
      return JSON.parse(text) as Record<string, unknown>;
    }
    lastError = `${pathname} failed ${response.status}: ${redact(text, secret).slice(0, 800)}`;
    if (response.status === 503 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 15_000 * attempt));
      continue;
    }
    throw new Error(lastError);
  }
  throw new Error(lastError);
}

async function runCase(
  secret: string,
  userId: string,
  resumeLabel: "rich" | "thin",
  resumeText: string,
  school: (typeof SCHOOLS)[number],
) {
  await postJson(
    "resume",
    { filename: `${resumeLabel}.txt`, mediaType: "text/plain", text: resumeText },
    secret,
    userId,
  );
  await postJson(
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
  const overlap = (await postJson("overlap", { schoolId: school.id }, secret, userId)) as OverlapBody;
  const pairs = overlap.pairs ?? [];
  const pairIds = pairs.map((p) => p.pairId).filter((id): id is string => typeof id === "string");
  const draft = (await postJson(
    "draft",
    {
      schoolId: school.id,
      schoolName: school.schoolName,
      programName: school.programName,
      mode: "opening",
      pairIds,
    },
    secret,
    userId,
  )) as { paragraph?: string; label?: string };

  const sampleCards = pairs.slice(0, 3).map((p) => ({
    pairId: p.pairId,
    kind: p.factKind,
    name: p.factName,
    subtitle: p.subtitle ?? "",
    researchVerified: p.researchVerified,
    quotes: (p.resumeQuotes ?? (p.resumeText ? [p.resumeText] : [])).slice(0, 3),
  }));

  return {
    userId,
    resume: resumeLabel,
    schoolId: school.id,
    schoolName: school.schoolName,
    weak: Boolean(overlap.weak),
    pairCount: pairs.length,
    visibleCount: overlap.visibleCount ?? 8,
    verifiedAsOf: overlap.verifiedAsOf ?? null,
    facultyPairs: pairs.filter((p) => p.factKind === "faculty").length,
    coursePairs: pairs.filter((p) => p.factKind === "course").length,
    thinFacultyCards: pairs.filter((p) => p.factKind === "faculty" && p.researchVerified === false).length,
    sampleCards,
    outlinePreview: (draft.paragraph ?? "").slice(0, 900),
    outlineLabel: draft.label ?? "",
    outlineHasSections: /Opening|Preparation & Experience|Goals & Program Fit|Conclusion/.test(
      draft.paragraph ?? "",
    ),
    outlineLooksLikeProseEssay: /\bI am applying to\b/.test(draft.paragraph ?? ""),
  };
}

async function main() {
  const secret = readProxySecret(secretFile);
  const sqlPath = join(root, "research", "program_facts.sql");
  if (!existsSync(sqlPath)) throw new Error(`Missing ${sqlPath}`);

  rmSync(persistTo, { recursive: true, force: true });
  mkdirSync(persistTo, { recursive: true });
  mkdirSync(join(root, "research", "batch2"), { recursive: true });

  console.log("Applying migrations + program_facts.sql to local D1...");
  await d1Execute({ file: join(root, "migrations", "0001_init.sql") }, secret).catch(() => undefined);
  await d1Execute({ file: join(root, "migrations", "0002_page_cache.sql") }, secret).catch(() => undefined);
  await d1Execute({ file: join(root, "migrations", "0003_program_facts.sql") }, secret).catch(() => undefined);
  await d1Execute({ file: sqlPath }, secret);

  let child: ReturnType<typeof spawn> | undefined;
  const rows = [];
  try {
    console.log("Starting local wrangler...");
    const started = startDev(secret);
    child = started.child;
    await waitForDev(child, started.logs, secret);

    for (const resume of [
      { label: "rich" as const, text: RICH },
      { label: "thin" as const, text: THIN },
    ]) {
      for (const school of SCHOOLS) {
        const row = await runCase(secret, "sop-outline-dryrun", resume.label, resume.text, school);
        rows.push(row);
        console.log(
          `${row.resume} school ${row.schoolId}: pairs=${row.pairCount} weak=${row.weak} fac=${row.facultyPairs} course=${row.coursePairs} thinFac=${row.thinFacultyCards} outlineSections=${row.outlineHasSections}`,
        );
      }
    }
  } finally {
    await stopDev(child);
  }

  writeFileSync(reportPath, `${JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2)}\n`);
  console.log(`wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
