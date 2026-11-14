# Verification decisions — November 13, 2026

User decisions applied by hand on this date. `verifiedBy` on every changed fact is `user 2026-11-13`.
Edits are only in `research/school-{id}.merged.json`, or in `research/school-{id}.verified.json` where no merged file existed (schools 1, 4, and 5). Original `school-{id}.json` files were not edited.
UNLV (school 23) and Fullerton MSE (school 7) were left unchanged and unverified, as requested.

## San Diego State University — Computer Engineering, M.S. (schoolId 13)
File: `research/school-13.merged.json`

### Verified (`verified: true`)

- **f23** — GRE not required (department admissions page). Department admissions page: GRE scores are not required. The 2026–2027 catalog program page could not be fetched (AWS WAF), so a catalog GRE statement could not be compared.
- **f3** — 600/700-level unit split. Eighteen of the 30 units should be 600- and 700-numbered courses; the remaining 12 may be 500-, 600-, or 700-level department courses.
- **f26** — Department page Fall 2026 application window. Department admissions page: the application window for Fall 2026 is October 1, 2025 to February 1, 2026. This disagrees in cycle/year with the university master's-degrees page for Fall 2027, quoted separately; both are reported, no winner is chosen.
- **f27** — Department Cal State Apply date for that window. Department page: complete the university Cal State Apply application by February 1, 2026.
- **f28** — Department official documents date. Department page: official test scores and transcripts must be received by February 15, 2026.
- **f29** — Scholarship consideration date. Department page: applications received after January 15 will not be considered for resident tuition-waiver scholarships.

### Rejected (`verified: false`)

- **f70** — GRE scores required on this catalog page. This 2026-2027 catalog admissions list includes official GRE scores. The department admissions page fact f23 quotes 'GRE scores are not required.' Both quotes are kept and no winner is chosen.
  - `rejectedReason`: Rejected by the user: GRE is not required. The department admissions page ('GRE scores are not required') was kept; this 2026-2027 catalog GRE-submission fact was not.
- **f72** — 30 units with at least 15 at the 600 or 700 level. The degree requires 30 units of 500-, 600-, or 700-level courses, including at least 15 units of 600- or 700-level coursework. An earlier department-page fact said 18 of the 30 units should be 600- and 700-numbered courses. Both quotes are kept and no winner is chosen.
  - `rejectedReason`: Rejected by the user: 18 of the 30 units must be at the 600/700 level (department page). This catalog 'at least 15 units' fact was not kept.
- **f30** — University page Fall 2027 Computer Engineering deadlines. University master's-degrees page, Computer Engineering, M.S. section: Fall 2027 Cal State Apply February 1, documents to Graduate Admissions February 15, program application February 15. This is a later cycle than the department page's Fall 2026 window; both are quoted.
  - `rejectedReason`: Rejected by the user: department deadlines win over university deadlines. This university master's-page Fall 2027 Computer Engineering deadline fact was not kept.
- **f31** — University Fall 2027 Cal State Apply date (CompE section). In the Computer Engineering, M.S. section of the university page: Submit Cal State Apply Application: February 1 (under Fall 2027 Deadlines).
  - `rejectedReason`: Rejected by the user: department deadlines win over university deadlines. This university Fall 2027 Cal State Apply / documents fact was not kept.

## San Diego State University — Computer Science, M.S. (schoolId 14)
File: `research/school-14.merged.json`

### Verified (`verified: true`)

- **f45** — Plan A thesis GPA of 3.3 (second statement). In the Advancement to Candidacy paragraph, the same page says selecting Plan A is contingent on a minimum 3.3 GPA in courses applicable to the master's degree and on finding a full-time computer science faculty member to supervise the thesis. The earlier paragraph on this page said 3 GPA. Both sentences are quoted and no winner is chosen.

### Rejected (`verified: false`)

- **f44** — Plan A thesis GPA of 3 (first statement). In the departmental-requirements paragraph, the page says selecting Plan A is contingent on a minimum 3 GPA in courses applicable to the master's degree and on finding a full-time computer science faculty member to supervise the thesis, with faculty resources limiting how many students can be accommodated. A later paragraph on the same page says 3.3 GPA. Both sentences are quoted and no winner is chosen.
  - `rejectedReason`: Rejected by the user: the Plan A thesis GPA is 3.3. This same-page 'minimum 3 GPA' statement was not kept.

## Cal Poly Pomona — Computer Science, M.S. (on-campus) (schoolId 2)
File: `research/school-2.merged.json`

### Verified (`verified: true`)

- **f52** — Major required units. The catalog lists 13 units of major required courses. Earlier department-page facts used a required list without CS 5215 and a different elective-unit split; both sources are kept and no winner is chosen.
- **f53** — CS 5215. Required 3-unit course on the 2026-2027 catalog page. This course was not in the earlier department-page required list; both sources are kept and no winner is chosen.
- **f58** — Major elective unit range. The catalog sets major electives at 12-15 units.
- **f59** — Elective units with project vs thesis. Students select 15 semester units of electives with the Master's Degree Project or 12 semester units with the Master's Degree Thesis. Earlier department-page fact f26 quoted 18 units with the project or 15 with the thesis; both quotes are kept and no winner is chosen.
- **f62** — Option 1 project units. Option 1 requires 1 unit of CS 6910 Directed Research and 1 unit of CS 6950 Master's Degree Project. The catalog titles CS 6910 Directed Research; an earlier department-page fact called it Directed Study. Both quotes are kept and no winner is chosen.
- **f63** — Option 2 thesis units. Option 2 requires 2 units of CS 6910 Directed Research and 3 units of CS 6960 Master's Degree Thesis.
- **f67** — CS 6910. Directed Research, 1-3 units, used in both culminating options.

### Rejected (`verified: false`)

- **f26** — Elective units. Students select 18 elective units with the project option or 15 elective units with the thesis option.
  - `rejectedReason`: Rejected by the user: the 2026-2027 catalog wins. Electives are 15 units with the project or 12 with the thesis, not this department-page 18/15 split.
- **f23** — Project option units. The project path uses CS 6910 Directed Study (1 unit) and CS 6950 Master's Degree Project (1 unit).
  - `rejectedReason`: Rejected by the user: the 2026-2027 catalog wins. CS 6910 is titled Directed Research, not Directed Study as on this department page.
- **f25** — Thesis option units. The thesis path uses CS 6910 Directed Study (2 units) and CS 6960 Master's Degree Thesis (3 units).
  - `rejectedReason`: Rejected by the user: the 2026-2027 catalog wins. CS 6910 is titled Directed Research, not Directed Study as on this department page.

## California State University, Los Angeles — Computer Science, M.S. (schoolId 9)
File: `research/school-9.merged.json`

### Verified (`verified: true`)

- **f50** — 3.0 GPA for conditional admission. Applicants with a bachelor's in Computer Science or a closely related field and an overall GPA of 3.0 or better are considered for conditional admission. An earlier department-page fact quoted similar wording but said 'full admission' instead of 'conditional admission.' Both quotes are kept and no winner is chosen.
- **f54** — 30 units with 18-unit 5000-level core. The degree requires 30 units, including 18 units in 5000-level core courses. This 2026-2027 catalog page is a later official curriculum source than the department curriculum page earlier tagged as 2023-2024; both sources are kept and no winner is chosen.
- **f57** — Core course structure. The 18 core units are met by selecting two courses from each of three areas of study (6 units each).
- **f61** — Directed electives 6 or 12 units. Directed electives are 6 or 12 units: CS 5960 (comprehensive exam) students must select 12 units; CS 5990 (thesis) students select 6 units.
- **f62** — Culminating experience courses. Students select one culminating path: CS 5960 Comprehensive Examination (0 units) or CS 5990 Thesis at 3 units, completed for 6 units. Students who take CS 5960 must complete 12 units of electives.

### Rejected (`verified: false`)

- **f7** — Classified standing GPA. Admission page: a bachelor's in CS or a closely related field with an overall GPA of 3.0 or better is needed for classified graduate standing (full admission).
  - `rejectedReason`: Rejected by the user: the 2026-2027 catalog wins. A 3.0 GPA is 'conditional admission,' not 'full admission' as on this department admissions page.
- **f2** — Research path units. Graduate page: with advisor approval, the research path is 18 units of 4000/5000-level courses plus thesis and project courses.
  - `rejectedReason`: Rejected by the user: the 2026-2027 catalog curriculum wins over this department graduate-page research-path unit split.
- **f3** — Comprehensive path units. Graduate page: the comprehensive path is 24 units of 4000/5000-level courses plus a comprehensive examination.
  - `rejectedReason`: Rejected by the user: the 2026-2027 catalog curriculum wins over this department graduate-page comprehensive-path unit split.

## California State University, East Bay — Computer Science, M.S. (schoolId 5)
File: `research/school-5.verified.json`

### Verified (`verified: true`)

- **f5** — GRE required on start page. The assigned start page still says GRE general test scores are required, with preferred percentiles above the 20th verbal and 60th quantitative.

### Rejected (`verified: false`)

- **f6** — GRE no longer required on prospective page. The department prospective-students page says GRE scores are no longer required.
  - `rejectedReason`: Rejected by the user: GRE is required. This prospective-students page fact ('GRE scores are no longer required') was not kept.

## California State University, Chico — Computer Science, M.S. (schoolId 4)
File: `research/school-4.verified.json`

### Verified (`verified: true`)

- **f16** — GRE in catalog. The 2026-2027 catalog requires a combined GRE verbal and quantitative score of 300 and exempts graduates of an ABET-accredited program in computer science (it does not mention a related discipline).

### Rejected (`verified: false`)

- **f15** — GRE on program page. The program page requires the GRE unless the bachelor's degree was awarded by an ABET-accredited program in computer science or a related discipline, and prefers a score of 300 or higher.
  - `rejectedReason`: Rejected by the user: GRE is required. This program-page exemption wording (ABET-accredited program in computer science or a related discipline) was not kept; the 2026-2027 catalog GRE requirement was kept.

## Arizona State University — Computer Science, M.S. (schoolId 1)
File: `research/school-1.verified.json`

### Verified (`verified: true`)

- **f16** — Discrete math recommended on degree page. The degree page recommends a discrete math course before admission.

### Rejected (`verified: false`)

- **f17** — Discrete math required in handbook. The 2026-2027 handbook states a background in discrete math is required for admission.
  - `rejectedReason`: Rejected by the user: discrete math is 'recommended,' not required. This 2026-2027 handbook 'required for admission' fact was not kept.

## Decisions that could not be mapped cleanly, or facts left unchanged on purpose

- **SDSU Computer Engineering (13), university Spring 2027 deadlines (f32).** The user said department deadlines win over university deadlines. f30 and f31 (university Fall 2027 CompE dates that disagree with the department Fall 2026 window) were rejected. f32 lists Spring 2027 university dates (Cal State Apply August 31; documents and program application September 15) that the department admissions page does not give, so it is not a head-to-head conflict. It was left unchanged and unverified.
- **Cal Poly Pomona (2), department required-course list (f19–f22, f28).** The catalog adds CS 5215 and sets the core at 13 units (f52, f53 verified). f19–f22 still correctly name CS 5250, 5300, 5800, and 6640 as required, which the catalog also requires, so they were left unchanged. f28 is about how often those four courses are offered and was left unchanged; it does omit CS 5215 from 'the required courses.'
- **Cal Poly Pomona (2), catalog CS 6910 listings f96 and f98.** These catalog facts also use the title Directed Research, but they describe the course as a major elective. The culminating-experience facts f62, f63, and f67 were the ones verified for the title. f96 and f98 were left unchanged.
- **Cal State LA (9), 2023–2024 department curriculum page (f11).** This fact only states that the degree requires 30 units, which agrees with the 2026-2027 catalog (f54). It was left unchanged and unverified because it does not conflict. Department unit-path facts that do conflict (f2, f3) were rejected, and catalog curriculum facts f54, f57, f61, and f62 were verified.
- **Cal State LA (9), department fact f4.** This says anyone with a bachelor's and a 3.0 GPA 'may apply.' It does not say 'full admission,' so it was left unchanged. Only f7 ('full admission') was rejected in favor of catalog f50 ('conditional admission').
- **Chico (4), GRE exemption scope.** The user said GRE is required. Both f15 (program page) and f16 (2026-2027 catalog) already say the GRE is required, and they differ only on the exemption: f15 exempts an ABET-accredited bachelor's in computer science or a related discipline; f16 exempts graduates of an ABET-accredited program in computer science and does not mention a related discipline, and it also requires a combined score of 300. Per the instruction to keep the required/not-exempt fact and reject the exemption-wording fact, **f16 was verified and f15 was rejected.** The user did not separately say which exemption wording to trust. f33 (GRE is not required for the blended BS+MS path) is a different path and was left unchanged.
- **UNLV (23) and Fullerton MSE (7)** were left unchanged and unverified, including the open UNLV 700-level credit-rule difference and the Fullerton MSE passed Fall 2026 deadlines.
- **CSULB (8)** had no user decision in this set and was left unchanged.
