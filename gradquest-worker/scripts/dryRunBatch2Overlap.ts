/**
 * Local-only dry run for batch2 enrich: ASU (1) + SDSU CS (14), rich/thin résumés,
 * existing + fresh users. Uses research/eval/wrangler.eval.jsonc (local D1).
 * Never prints SOP_PROXY_SECRET.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8798;
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const configPath = join(root, "research", "eval", "wrangler.eval.jsonc");
const persistTo = join(root, ".wrangler", "state-batch2-dryrun");
const secretFile = join(root, ".dev.vars");
const reportPath = join(root, "research", "batch2", "local-dryrun-results.json");
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

type OverlapBody = {
  pairs?: { factKind: string; factName: string; factDetail: string; reason: string }[];
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
      return JSON.parse(text) as OverlapBody & Record<string, unknown>;
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
  const overlap = await postJson("overlap", { schoolId: school.id }, secret, userId);
  const pairs = overlap.pairs ?? [];
  return {
    userId,
    resume: resumeLabel,
    schoolId: school.id,
    schoolName: school.schoolName,
    weak: Boolean(overlap.weak),
    pairCount: pairs.length,
    verifiedAsOf: overlap.verifiedAsOf ?? null,
    pairs: pairs.map((p) => ({
      kind: p.factKind,
      name: p.factName,
      detail: (p.factDetail || "").slice(0, 120),
      reason: (p.reason || "").slice(0, 160),
    })),
    facultyPairs: pairs.filter((p) => p.factKind === "faculty").length,
    coursePairs: pairs.filter((p) => p.factKind === "course").length,
  };
}

async function main() {
  const secret = readProxySecret(secretFile);
  const oldSqlPath = join(root, "research", "program_facts.old-main.sql");
  const newSqlPath = join(root, "research", "program_facts.sql");
  // Capture main SQL for before baseline without printing secrets.
  const { stdout: oldSql, code: showCode } = await runCapture(
    ["show", "main:gradquest-worker/research/program_facts.sql"],
    secret,
  ).catch(async () => {
    // git show via shell if wrangler isn't the right tool
    return { stdout: "", code: 1, stderr: "" };
  });
  void oldSql;
  void showCode;

  // Prefer git show via spawn of git
  const git = await new Promise<{ stdout: string; code: number }>((resolveGit, reject) => {
    const child = spawn("git", ["show", "main:gradquest-worker/research/program_facts.sql"], {
      cwd: join(root, ".."),
    });
    let stdout = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolveGit({ stdout, code: code ?? 1 }));
  });
  if (git.code !== 0 || !git.stdout.includes("INSERT INTO program_snapshots")) {
    throw new Error("Could not load main program_facts.sql for before baseline");
  }
  writeFileSync(oldSqlPath, git.stdout);

  rmSync(persistTo, { recursive: true, force: true });
  mkdirSync(persistTo, { recursive: true });

  console.log("Applying migrations + old (main) SQL to local D1...");
  await d1Execute({ file: join(root, "migrations", "0001_init.sql") }, secret).catch(() => undefined);
  await d1Execute({ file: join(root, "migrations", "0002_page_cache.sql") }, secret).catch(() => undefined);
  await d1Execute({ file: join(root, "migrations", "0003_program_facts.sql") }, secret).catch(() => undefined);
  await d1Execute({ file: oldSqlPath }, secret);

  let beforeCounts = "";
  beforeCounts = await d1Execute(
    {
      command:
        "SELECT school_id, snapshot_id, verified_at FROM program_snapshots WHERE school_id IN ('1','14') ORDER BY school_id, verified_at",
    },
    secret,
  );
  console.log("Before snapshots (redacted log ok):\n", beforeCounts.slice(0, 500));

  let child: ReturnType<typeof spawn> | undefined;
  const results: Record<string, unknown> = { before: [], afterExisting: [], afterFresh: [] };
  try {
    console.log("Starting wrangler (before / seed existing-user cache)...");
    const started = startDev(secret);
    child = started.child;
    await waitForDev(child, started.logs, secret);

    const beforeRows = [];
    for (const resume of [
      { label: "rich" as const, text: RICH },
      { label: "thin" as const, text: THIN },
    ]) {
      for (const school of SCHOOLS) {
        const row = await runCase(secret, "existing-batch2", resume.label, resume.text, school);
        beforeRows.push(row);
        console.log(
          `BEFORE ${row.userId} ${row.resume} school ${row.schoolId}: pairs=${row.pairCount} weak=${row.weak} fac=${row.facultyPairs} course=${row.coursePairs} asOf=${row.verifiedAsOf}`,
        );
      }
    }
    results.before = beforeRows;

    await stopDev(child);
    child = undefined;

    console.log("Applying new SQL to local D1...");
    await d1Execute({ file: newSqlPath }, secret);
    const afterSnaps = await d1Execute(
      {
        command:
          "SELECT school_id, snapshot_id, verified_at FROM program_snapshots WHERE school_id IN ('1','14') ORDER BY school_id, verified_at DESC",
      },
      secret,
    );
    console.log("After snapshots:\n", afterSnaps.slice(0, 800));

    console.log("Starting wrangler (after)...");
    const started2 = startDev(secret);
    child = started2.child;
    await waitForDev(child, started2.logs, secret);

    const afterExisting = [];
    for (const resume of [
      { label: "rich" as const, text: RICH },
      { label: "thin" as const, text: THIN },
    ]) {
      for (const school of SCHOOLS) {
        const row = await runCase(secret, "existing-batch2", resume.label, resume.text, school);
        afterExisting.push(row);
        console.log(
          `AFTER-EXISTING ${row.resume} school ${row.schoolId}: pairs=${row.pairCount} weak=${row.weak} fac=${row.facultyPairs} course=${row.coursePairs} asOf=${row.verifiedAsOf}`,
        );
      }
    }
    results.afterExisting = afterExisting;

    const afterFresh = [];
    for (const resume of [
      { label: "rich" as const, text: RICH },
      { label: "thin" as const, text: THIN },
    ]) {
      for (const school of SCHOOLS) {
        const row = await runCase(secret, "fresh-batch2", resume.label, resume.text, school);
        afterFresh.push(row);
        console.log(
          `AFTER-FRESH ${row.resume} school ${row.schoolId}: pairs=${row.pairCount} weak=${row.weak} fac=${row.facultyPairs} course=${row.coursePairs} asOf=${row.verifiedAsOf}`,
        );
      }
    }
    results.afterFresh = afterFresh;
  } finally {
    await stopDev(child);
  }

  writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
