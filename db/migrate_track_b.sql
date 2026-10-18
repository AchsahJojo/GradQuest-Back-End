-- Track B: whether a public page says a statement is required.
-- NULL means the catalog did not verify it. Safe to re-run.

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS sop_required boolean;

-- Known values from gradquest_combined.csv. Blank stays NULL.
UPDATE public.schools SET sop_required = FALSE
WHERE program_page_url IN (
    'https://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661',
    'https://www.csun.edu/engineering-computer-science/computer-science/programs/graduate-programs/ms-computer-science',
    'https://electrical.sdsu.edu/programs/graduate/ms-computer-engineering',
    'https://catalog.sdsu.edu/preview_program.php?catoid=11&poid=11044'
);

UPDATE public.schools SET sop_required = TRUE
WHERE program_page_url IN (
    'https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/',
    'https://www.csuchico.edu/academics/majors-programs/computer-science-ms.shtml',
    'https://www.sjsu.edu/msse/admissions/admission-requirements.php',
    'https://www.scu.edu/engineering/academic-programs/department-of-computer-engineering/graduate/ms-in-computer-science-and-engineering/',
    'https://mcs.ics.uci.edu/',
    'https://www.cs.ucla.edu/graduate-requirements/',
    'https://cse.ucsd.edu/graduate/degree-programs/ms-program',
    'https://www.usfca.edu/arts-sciences/programs/graduate/computer-science',
    'https://viterbigradadmission.usc.edu/programs/masters/msprograms/computer-science/ms-computer-science/'
);

