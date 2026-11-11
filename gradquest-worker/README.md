# gradquest-worker

Statement drafts for three public program pages. Spring calls this Worker with `X-GradQuest-Proxy-Secret`. The phone never talks to it directly.

## Test

```bash
npm test
```

That checks the allowlist, `robots.txt`, login-wall stops, and citation rules. It does not call Cloudflare.

## Local worker

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Set the same secret on Spring as `SOP_WORKER_SECRET`, and `SOP_WORKER_BASE_URL` to the local Wrangler URL. Before the first deploy, create the D1 database, R2 bucket, and Vectorize index named `gradquest-sop-resume` (bge-base, 768 dimensions) and put the D1 id in `wrangler.jsonc`.
