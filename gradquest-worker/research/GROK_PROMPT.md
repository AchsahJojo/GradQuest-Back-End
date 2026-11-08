# Grok research prompt — GradQuest program facts

Run this once per school (Cal Poly SLO = school 3, CSU Fullerton = school 6, UC San Diego = school 22).
Fill in `{SCHOOL_NAME}` and `{PROGRAM_NAME}` before running. Paste the whole prompt, including
the instructions and the example, into Grok.

---

You are researching one graduate program for a student writing a statement of purpose.
School: {SCHOOL_NAME}. Program: {PROGRAM_NAME}.

Find these five public page types for this program. If a page type does not exist for this
program specifically (for example, a shared department page), say so instead of guessing:

1. **overview** — the program's own description page
2. **admissions** — admissions / application requirements for this program
3. **curriculum** — degree requirements and the course list
4. **faculty** — a listing of faculty tied to this program or its department, plus up to 15
   individual faculty profile pages that describe a current research area
5. **deadlines** — deadlines, funding, or international-student information for this program

Rules, no exceptions:

- Never use anything you already know about this school. Use only the text on the pages
  above, as they exist today.
- Do not log in, submit a form, or use any page that requires signing in. If a page is
  gated, skip it and say so.
- Every fact you report must include the exact URL you got it from and a word-for-word
  quote from that page, at most 300 characters. If you cannot quote it, do not report it.
- Do not invent a professor, a course, a research area, or a requirement. If a page does
  not clearly state something, leave it out.
- Faculty from a department-wide listing (not specific to this one program) should still
  be reported, but say in `detail` that the listing is department-wide, not program-specific.
- Only include a faculty research blurb if the page states one. If a faculty page lists a
  name with no research description, still report the name as a `faculty` fact, with
  `detail` left empty, rather than skip them.

Return only JSON, in exactly this shape (no prose outside the JSON):

```json
{
  "schoolId": 3,
  "schoolName": "Cal Poly San Luis Obispo",
  "programName": "Computer Science, M.S.",
  "pages": [
    { "kind": "overview", "url": "https://..." },
    { "kind": "admissions", "url": "https://..." },
    { "kind": "curriculum", "url": "https://..." },
    { "kind": "faculty", "url": "https://..." },
    { "kind": "deadlines", "url": "https://..." }
  ],
  "facts": [
    {
      "id": "f1",
      "kind": "course",
      "name": "CSC 530 - Computer Architecture",
      "detail": "Advanced topics in computer architecture, including pipelining and memory hierarchy.",
      "sourceUrl": "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/",
      "quote": "CSC 530 Computer Architecture (4) Advanced topics in computer architecture, including pipelining and memory hierarchy."
    },
    {
      "id": "f2",
      "kind": "faculty",
      "name": "Jane Smith",
      "detail": "Research in distributed systems and fault tolerance.",
      "sourceUrl": "https://cs.calpoly.edu/people/jane-smith",
      "quote": "Jane Smith, Professor. Research interests: distributed systems, fault tolerance."
    }
  ]
}
```

`kind` for each fact must be one of: `"overview"`, `"requirement"`, `"course"`, `"faculty"`, `"deadline"`.

## schoolId values

- Cal Poly San Luis Obispo, Computer Science M.S. → `schoolId: 3`
- CSU Fullerton, Computer Science M.S. → `schoolId: 6`
- UC San Diego, Computer Science and Engineering M.S. → `schoolId: 22`

## After Grok responds

1. Save the JSON as `gradquest-worker/research/school-{schoolId}.json`.
2. Open every URL under `pages` yourself and confirm it is the correct, current, public page
   for this exact program (not a different degree, not a login-walled page). Delete any
   page entry and its dependent facts that fail this check.
