# Grok research prompt — CSU Fullerton re-run (fill admissions/curriculum/deadlines gap)

Paste this whole prompt into Grok. This is a targeted re-run for CSU Fullerton only — the
first pass already found a good overview page and 3 faculty pages (keep those), but the
admissions/curriculum/deadlines pages it tried originally returned 403 errors and were
correctly skipped rather than guessed. Use the two starting points below to find the real
pages this time.

---

You are researching one graduate program for a student writing a statement of purpose.

School: California State University, Fullerton. Program: Computer Science, M.S.

I already have good pages for **overview** and **faculty** — do not re-research those. I need
you to find these three page types specifically:

1. **admissions** — admissions / application requirements for this program. Start from
   `https://admissions.fullerton.edu/` and find the page that covers graduate admissions
   requirements, ideally one that mentions Computer Science or the ECS (Engineering &
   Computer Science) graduate program specifically. If only a general graduate-admissions
   page exists (not program-specific), report that one but say so in `detail`.
2. **curriculum** — degree requirements and the course list for this specific program.
   Start from `https://www.fullerton.edu/graduate/` (a hub page with links to program-specific
   sub-pages) and find the MS Computer Science degree-requirements / curriculum page. Do not
   cite the hub page itself as the source — find the actual program page it links to.
3. **deadlines** — application deadlines, funding, or international-student information for
   this program. Could be on the admissions page, a dedicated deadlines page, or the graduate
   studies site.

Rules, no exceptions:

- Never use anything you already know about this school. Use only the text on the pages
  you find, as they exist today.
- Do not log in, submit a form, or use any page that requires signing in. If a page is
  gated, skip it and say so.
- Every fact you report must include the exact URL you got it from and a word-for-word
  quote from that page, at most 300 characters. If you cannot quote it, do not report it.
- Do not invent a requirement, deadline, or course. If a page does not clearly state
  something, leave it out.
- If you cannot find a program-specific page for one of these three kinds after checking the
  hub pages above, say so explicitly instead of substituting an unrelated page.

Return only JSON, in exactly this shape (no prose outside the JSON):

```json
{
  "schoolId": 6,
  "schoolName": "California State University, Fullerton",
  "programName": "Computer Science, M.S.",
  "pages": [
    { "kind": "admissions", "url": "https://..." },
    { "kind": "curriculum", "url": "https://..." },
    { "kind": "deadlines", "url": "https://..." }
  ],
  "facts": [
    {
      "id": "f100",
      "kind": "requirement",
      "name": "Example requirement name",
      "detail": "Short plain-language summary.",
      "sourceUrl": "https://admissions.fullerton.edu/...",
      "quote": "Exact text copied from the page, at most 300 characters."
    }
  ]
}
```

`kind` for each fact must be one of: `"overview"`, `"requirement"`, `"course"`, `"faculty"`, `"deadline"`.

## After Grok responds

1. Save the JSON as `gradquest-worker/research/school-6-rerun.json` (do NOT overwrite
   `school-6.json` — Achsah will merge the new `pages`/`facts` into the existing file by hand
   after confirming the URLs, same as the original Task 0 Step 3 process).
2. Open every new URL under `pages` yourself and confirm it is the correct, current, public
   page for this exact program (not a different degree, not a login-walled page, not the
   generic hub page). Delete any page entry and its dependent facts that fail this check.
