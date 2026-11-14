-- Track B: whether a public page says a statement is required.
-- NULL means the catalog did not verify it. Safe to re-run.

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS sop_required boolean;

-- CSUF's catalog now answers bots with a robot check; read the ECS graduate admissions page instead.
UPDATE public.schools
SET program_page_url = 'https://www.fullerton.edu/ecs/academics/graduate-admissions.html'
WHERE id = 6
  AND program_page_url = 'https://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661';

-- Known values from gradquest_combined.csv, re-checked 2026-11-03. Blank stays NULL.
-- Keep in sync with the sop_required column in seed_schools.sql.
UPDATE public.schools SET sop_required = FALSE
WHERE program_page_url IN (
    'https://www.fullerton.edu/ecs/academics/graduate-admissions.html',
    'https://www.csun.edu/engineering-computer-science/computer-science/programs/graduate-programs/ms-computer-science',
    'https://electrical.sdsu.edu/programs/graduate/ms-computer-engineering',
    'https://catalog.sdsu.edu/preview_program.php?catoid=12&poid=12288',
    'https://www.csueastbay.edu/',
    'https://www.fullerton.edu/ecs/mse/requirements/',
    'https://www.csun.edu/engineering-computer-science/computer-science/programs/graduate-programs/ms-software-engineering',
    'https://catalog.csus.edu/colleges/engineering-computer-science/computer-science/ms-in-computer-science/',
    'https://www.sjsu.edu/pdp/programs/msda/requirements/index.html',
    'https://catalog.unlv.edu/preview_program.php?catoid=52&poid=14606'
);

UPDATE public.schools SET sop_required = TRUE
WHERE program_page_url IN (
    'https://degrees.asu.edu/masters-phd/major/ASU00/ESCOMSCMS/computer-science-ms',
    'https://catalog.cpp.edu/preview_program.php?catoid=78&poid=24271',
    'https://www1.cs.ucr.edu/programs/graduate/computer-science-masters',
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

