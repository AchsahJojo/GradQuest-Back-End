#!/usr/bin/env python3
"""Build GradQuest school JSON files and run quote checks."""
from __future__ import annotations

import json
import re
import html as htmlmod
from pathlib import Path

ROOT = Path("/workspace/gradquest-program-research-batch2")
SRC = ROOT / "sources"
RESEARCH = ROOT / "research"
CHECKS = ROOT / "checks"
RESEARCH.mkdir(exist_ok=True)
CHECKS.mkdir(exist_ok=True)

INLINE_TAGS = ("span", "strong", "u", "a", "em")


def normalize_page(s: str) -> str:
    # strip scripts/styles/comments first
    s = re.sub(r"(?is)<!--.*?-->", " ", s)
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", s)
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", s)
    s = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", s)
    # inline tags without inserting spaces
    s = re.sub(r"(?is)</?(?:span|strong|u|a|em)(?:\s[^>]*)?>", "", s)
    # remaining (block and other) tags to spaces
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = s.replace("\u00a0", " ").replace("\u202f", " ").replace("\u200b", " ")
    s = s.replace("\ufeff", " ").replace("\u00ad", "")
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    s = s.replace("\u2013", "-").replace("\u2014", "-")  # only for search robustness of pdf dashes? better not if instructions didn't say so
    # Revert emdash conversion - instructions did not ask to convert dashes.
    # I'll keep hyphen conversion out of official normalize and instead avoid dashes in quotes when possible.
    s = re.sub(r"\s+", " ", s)
    return s


# Official normalize (no dash folding)
def normalize(s: str) -> str:
    s = re.sub(r"(?is)<!--.*?-->", " ", s)
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", s)
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", s)
    s = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", s)
    s = re.sub(r"(?is)</?(?:span|strong|u|a|em)(?:\s[^>]*)?>", "", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = (
        s.replace("\u00a0", " ")
        .replace("&nbsp;", " ")
        .replace("\u202f", " ")
        .replace("\u200b", "")
        .replace("\ufeff", "")
        .replace("\u00ad", "")
    )
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    s = re.sub(r"\s+", " ", s)
    return s


# url -> evidence file paths (raw html/pdf-txt/csv preferred)
EVIDENCE: dict[str, list[Path]] = {}


def add_ev(url: str, *names: str) -> None:
    EVIDENCE.setdefault(url, [])
    for n in names:
        p = SRC / n
        if p not in EVIDENCE[url]:
            EVIDENCE[url].append(p)


def load_evidence_text(url: str) -> tuple[str, list[str]]:
    files = EVIDENCE.get(url, [])
    chunks = []
    used = []
    for p in files:
        if not p.exists():
            continue
        used.append(str(p))
        if p.suffix.lower() == ".pdf":
            txt = p.with_suffix(".txt")
            if txt.exists():
                chunks.append(txt.read_text(errors="replace"))
            else:
                chunks.append(p.read_bytes().decode("latin-1", errors="replace"))
        else:
            chunks.append(p.read_text(errors="replace"))
    return "\n".join(chunks), used


def check_quote(url: str, quote: str) -> dict:
    raw, used = load_evidence_text(url)
    if not raw:
        return {"pass": False, "reason": "no evidence loaded for sourceUrl", "files": used}
    page_n = normalize(raw)
    quote_n = normalize(quote)
    if not quote_n:
        return {"pass": False, "reason": "empty quote after normalize", "files": used}
    if len(quote) > 300:
        return {"pass": False, "reason": f"quote length {len(quote)} > 300", "files": used}
    ok = quote_n in page_n
    return {"pass": ok, "reason": "verbatim after normalize" if ok else "quote not found after normalize", "files": used}


# ---------------- evidence map ----------------
ASU = "https://degrees.asu.edu/masters-phd/major/ASU00/ESCOMSCMS/computer-science-ms"
ASU_SCAI = "https://scai.engineering.asu.edu/graduate-computer-science/"
ASU_HB = "https://scai.engineering.asu.edu/wp-content/uploads/sites/31/2026/06/MS-CS-Handbook-2026-27.pdf"
ASU_TA = "https://scai.engineering.asu.edu/teaching-research-assistantships-fellowships-awards/"
ASU_FAC = "https://docs.google.com/spreadsheets/d/1SpL7-42ZH0EuwMNZf515_hpVd2Jy0_yLz6_PM67ZwLQ/edit?gid=0#gid=0"
ASU_ENG = "https://admission.asu.edu/apply/international/graduate/english-proficiency"

add_ev(ASU, "01-asu-start.html")
add_ev(ASU_SCAI, "01-asu-scai-grad-cs.html")
add_ev(ASU_HB, "01-asu-ms-handbook-2026.txt", "01-asu-ms-handbook-2026.pdf")
add_ev(ASU_TA, "01-asu-ta-awards.html")
add_ev(ASU_FAC, "01-asu-ms-faculty-endorsements.csv")
add_ev(ASU_ENG, "01-asu-english-proficiency.html")

CPP_PRO = "https://www.cpp.edu/sci/computer-science/prospective-graduate-students/index.shtml"
CPP_INFO = "https://www.cpp.edu/sci/computer-science/prospective-graduate-students/program-information.shtml"
CPP_ADM = "https://www.cpp.edu/sci/computer-science/prospective-graduate-students/admission-requirements.shtml"
CPP_APP = "https://www.cpp.edu/sci/computer-science/prospective-graduate-students/application-procedures.shtml"
CPP_FAQ = "https://www.cpp.edu/sci/computer-science/prospective-graduate-students/frequently-asked-questions.shtml"
CPP_DEAD = "https://www.cpp.edu/admissions/graduate/masters-explore.shtml"
CPP_FAC = "https://www.cpp.edu/sci/computer-science/faculty-and-staff/permanent-faculty.shtml"
CPP_RES = "https://www.cpp.edu/sci/computer-science/faculty-and-staff/faculty-research-int.shtml"
CPP_DEPT = "https://www.cpp.edu/sci/computer-science/"
CPP_PLAN = "https://www.cpp.edu/sci/computer-science/current-graduate-students/planned-future-course-offerings.shtml"

add_ev(CPP_PRO, "02-cpp-grad-prospective.html")
add_ev(CPP_INFO, "02-cpp-grad-program-info.html")
add_ev(CPP_ADM, "02-cpp-grad-admission.html")
add_ev(CPP_APP, "02-cpp-grad-apply.html")
add_ev(CPP_FAQ, "02-cpp-grad-faq.html")
add_ev(CPP_DEAD, "02-cpp-grad-deadlines.html")
add_ev(CPP_FAC, "02-cpp-faculty-permanent.html")
add_ev(CPP_RES, "02-cpp-faculty-research.html")
add_ev(CPP_DEPT, "02-cpp-cs-dept.html")
add_ev(CPP_PLAN, "02-cpp-grad-planned.html")

for key, fn, url in [
    ("amamra", "02-fac-amamra.html", "https://www.cpp.edu/faculty/aamamra/index.shtml"),
    ("chen", "02-fac-chen.html", "https://www.cpp.edu/faculty/tingtingchen/index.shtml"),
    ("husain", "02-fac-husain.html", "https://www.cpp.edu/faculty/mihusain/index.shtml"),
    ("jamshidi", "02-fac-jamshidi.html", "https://www.cpp.edu/faculty/fjamshidi/index.shtml"),
    ("ji", "02-fac-ji.html", "https://www.cpp.edu/faculty/hji/index.shtml"),
    ("korah", "02-fac-korah.html", "https://www.cpp.edu/faculty/jkorah/index.shtml"),
    ("marin", "02-fac-marin.html", "https://www.cpp.edu/faculty/santanamarin/index.shtml"),
    ("raheja", "02-fac-raheja.html", "https://www.cpp.edu/faculty/raheja/index.shtml"),
    ("salloum", "02-fac-salloum.html", "https://www.cpp.edu/faculty/ssalloum/index.shtml"),
    ("shi", "02-fac-shi.html", "https://www.cpp.edu/faculty/wendyshi/index.shtml"),
    ("steichen", "02-fac-steichen.html", "https://www.cpp.edu/faculty/bsteichen/index.shtml"),
    ("sun", "02-fac-sun.html", "https://www.cpp.edu/faculty/yusun/index.shtml"),
    ("tang", "02-fac-tang.html", "https://www.cpp.edu/faculty/ftang/index.shtml"),
    ("wang", "02-fac-wang.html", "https://www.cpp.edu/faculty/yunshengwang/index.shtml"),
]:
    add_ev(url, fn)

CHICO = "https://www.csuchico.edu/academics/majors-programs/computer-science-ms.shtml"
CHICO_CAT = "https://catalog.csuchico.edu/colleges-departments/college-engineering-computer-science-construction-management/computer-science/computer-science-ms/"
CHICO_DEPT = "https://www.csuchico.edu/academics/college/engineering/departments/computer-science/index.shtml"
CHICO_FAC = "https://www.csuchico.edu/academics/college/engineering/departments/computer-science/faculty-staff.shtml"
CHICO_DIR = "https://apps.csuchico.edu/directory/Department/CSCI"
CHICO_COURSES = "https://catalog.csuchico.edu/colleges-departments/college-engineering-computer-science-construction-management/computer-science/#coursestext"

add_ev(CHICO, "04-chico-start.html")
add_ev(CHICO_CAT, "04-chico-catalog-ms.html")
add_ev(CHICO_DEPT, "04-chico-cs-dept.html")
add_ev(CHICO_FAC, "04-chico-faculty-staff.html")
add_ev(CHICO_DIR, "04-chico-directory.html")
add_ev(CHICO_COURSES, "04-chico-catalog-csci-courses.html")

for uid in [
    "tagibson","oal-saadi","aattarwala","kbuffardi","bcdixon","ktisenegger",
    "bjuliano","bshen2","sbsiewert","ktian","rctillquist","dzeichick","jraigoza",
]:
    add_ev(f"https://apps.csuchico.edu/directory/Employee/{uid}", f"04-fac-{uid}.html")

EB_START = "https://www.csueastbay.edu/cs/degrees-programs1/csms.html"
EB_PRO = "https://www.csueastbay.edu/cs/prospective-students/index.html"
EB_FY = "https://www.csueastbay.edu/cs/first-year-masters-students/index.html"
EB_FAC = "https://www.csueastbay.edu/cs/faculty-staff/index.html"
EB_CAP = "https://www.csueastbay.edu/cs/graduate-capstone/index.html"
EB_692 = "https://www.csueastbay.edu/cs/graduate-capstone/faq-cs-692-capstone-exam.html"
EB_693 = "https://www.csueastbay.edu/cs/graduate-capstone/cs-693-faq.html"
EB_699 = "https://www.csueastbay.edu/cs/graduate-capstone/cs-699-thesis.html"
EB_DEG = "https://www.csueastbay.edu/cs/degrees-programs1/index.html"
EB_RMCS = "https://www.csueastbay.edu/cs/files/docs/ms-cs-cs-concentration-roadmap.pdf"
EB_RMAI = "https://www.csueastbay.edu/cs/files/docs/ms-cs-aiml-concentration-roadmap.pdf"
EB_FIN = "https://www.csueastbay.edu/cs/financial-assistance/index.html"

add_ev(EB_START, "05-csueb-start.html")
add_ev(EB_PRO, "05-csueb-prospective.html")
add_ev(EB_FY, "05-csueb-firstyear-ms.html")
add_ev(EB_FAC, "05-csueb-faculty.html")
add_ev(EB_CAP, "05-csueb-capstone.html")
add_ev(EB_692, "05-csueb-cs692.html")
add_ev(EB_693, "05-csueb-cs693.html")
add_ev(EB_699, "05-csueb-thesis.html")
add_ev(EB_DEG, "05-csueb-degrees.html")
add_ev(EB_RMCS, "05-csueb-roadmap-cs.txt", "05-csueb-roadmap-cs.pdf")
add_ev(EB_RMAI, "05-csueb-roadmap-aiml.txt", "05-csueb-roadmap-aiml.pdf")
add_ev(EB_FIN, "05-csueb-financial.html")

for slug, fn in [
    ("roohparvarfarzan","05-fac-roohparvar.html"),
    ("ertaullevent","05-fac-ertaul.html"),
    ("ericksonvarick","05-fac-erickson.html"),
    ("grewelynne","05-fac-grewe.html"),
    ("daneshyarimoayed","05-fac-daneshyari.html"),
    ("derakhshandehzahra","05-fac-derakhshandeh.html"),
    ("hariprasadyashas","05-fac-hariprasad.html"),
    ("johnsonmatthew","05-fac-johnson.html"),
    ("lihongmin","05-fac-li.html"),
    ("ruanxiaojun","05-fac-ruan.html"),
    ("zhongfay","05-fac-zhong.html"),
]:
    add_ev(f"https://www.csueastbay.edu/directory/profiles/cs/{slug}.html", fn)

F_REQ = "https://www.fullerton.edu/ecs/mse/requirements/"
F_ABOUT = "https://www.fullerton.edu/ecs/mse/about/"
F_HOME = "https://www.fullerton.edu/ecs/mse/"
F_COURSES = "https://www.fullerton.edu/ecs/mse/programs/courses.php"
F_FAC = "https://www.fullerton.edu/ecs/mse/faculty/index.php"
F_FAQ = "https://www.fullerton.edu/ecs/mse/faq.php"
F_COST = "https://www.fullerton.edu/ecs/mse/programs/programcost.php"
F_ENR = "https://www.fullerton.edu/ecs/mse/requirements/how-to-enroll.php"

add_ev(F_REQ, "07-csuf-start.html")
add_ev(F_ABOUT, "07-csuf-about.html")
add_ev(F_HOME, "07-csuf-mse-home.html")
add_ev(F_COURSES, "07-csuf-courses.html")
add_ev(F_FAC, "07-csuf-faculty.html")
add_ev(F_FAQ, "07-csuf-faq.html")
add_ev(F_COST, "07-csuf-cost.html")
add_ev(F_ENR, "07-csuf-enroll.html")


def F(kind, name, detail, url, quote):
    return {"kind": kind, "name": name, "detail": detail, "sourceUrl": url, "quote": quote}


# Facts are defined in the remainder of this file after import of school fact lists.
# We'll attach them below.

SCHOOLS = {}

# ===================== school 1 ASU =====================
SCHOOLS[1] = {
    "schoolId": 1,
    "schoolName": "Arizona State University",
    "programName": "Computer Science, M.S.",
    "pages": [
        {"kind": "overview", "url": ASU},
        {"kind": "admissions", "url": ASU},
        {"kind": "curriculum", "url": ASU},
        {"kind": "faculty", "url": ASU_FAC},
        {"kind": "deadlines", "url": ASU},
    ],
    "facts": [
        F("overview", "On-campus research MS", "The on-campus Computer Science M.S. is described as research-focused training in theory, systems, and applications.", ASU, "The on-campus Master of Science program in computer science provides rigorous, research-focused training in theory, systems and applications, preparing you to advance the frontiers of computing"),
        F("overview", "Distinct from the MCS", "The page distinguishes this research M.S. from the industry-oriented Master of Computer Science.", ASU, "Unlike the industry-oriented Master of Computer Science program, the MS program in computer science emphasizes fundamental and applied research."),
        F("overview", "Location and college", "The degree is listed at the Tempe campus in the Ira A. Fulton Schools of Engineering.", ASU, "Ira A. Fulton Schools of Engineering"),
        F("overview", "30 credit hours", "The program is listed as 30 credit hours.", ASU, "30 credit hours"),
        F("overview", "Thesis or nonthesis option", "Students may choose a thesis or nonthesis culminating experience.", ASU, "You may pursue either a thesis or nonthesis option as your culminating experience and can explore advanced topics such as:"),
        F("overview", "Advanced topic areas", "Listed topic areas include AI, cybersecurity, quantum computing, and related areas.", ASU, "including artificial intelligence, cybersecurity, quantum computing and other novel paradigms."),
        F("overview", "STEM-OPT eligible", "The program page marks the degree as STEM-OPT extension eligible.", ASU, "STEM-OPT extension eligible: Yes"),
        F("overview", "STEM-OPT length", "The page says F-1 students can extend U.S. work experience by 24 months.", ASU, "International students (F1) can extend U.S. work experience by 24 months."),
        F("overview", "Handbook program summary", "The 2026-2027 M.S. handbook describes a 30-credit program with a computing and AI foundation.", ASU_HB, "The Master of Science in Computer Science is a 30-credit hour program that provides students with a comprehensive foundation in computer science and AI"),
        F("overview", "Six concentrations", "The handbook lists a generic program plus five named concentrations.", ASU_HB, "The MS in CS program offers six concentrations:"),
        F("requirement", "Graduate College and Fulton requirements", "Applicants must meet Graduate College and Ira A. Fulton Schools of Engineering requirements.", ASU, "Applicants must fulfill the requirements of both the Graduate College and the Ira A. Fulton Schools of Engineering."),
        F("requirement", "Prior degree field", "Applicants need a bachelor's or master's in computer science, computer engineering, or a closely related area.", ASU, "Applicants are eligible to apply to the program if they have earned a bachelor's or master's degree in computer science, computer engineering or a closely related area from a regionally accredited institution."),
        F("requirement", "GPA 3.25", "The degree page requires a minimum 3.25 GPA in the last 60 hours of the first bachelor's degree or in an applicable master's program.", ASU, "Applicants must have a minimum cumulative GPA of 3.25 (scale is 4.00 = \"A\") in the last 60 hours of their first bachelor's degree program or a minimum cumulative GPA of 3.25 (scale is 4.00 = \"A\") in an applicable master's degree program."),
        F("requirement", "Application materials", "Required materials include the graduate application and fee, official transcripts, a statement of purpose, and proof of English proficiency.", ASU, "All applicants must submit:"),
        F("requirement", "Calculus prerequisite", "Students must have completed two semesters or six credit hours of calculus, equivalent to Calculus I and II, before applying.", ASU, "Before applying to the program, students must have completed two semesters or six credit hours of calculus, equivalent to Calculus I and II."),
        F("requirement", "Discrete math recommended on degree page", "The degree page recommends a discrete math course before admission.", ASU, "Completion of a discrete math course is also recommended before admission."),
        F("requirement", "Discrete math required in handbook", "The 2026-2027 handbook states a background in discrete math is required for admission.", ASU_HB, "A background in discrete math is required for admission"),
        F("requirement", "Deficiency courses", "Assigned additional undergraduate courses may include CSE 230, CSE 310, CSE 330, and CSE 340 or CSE 355.", ASU, "CSE 230 Computer Organization and Assembly Language Programming"),
        F("requirement", "Deficiency grade and timing", "Assigned additional coursework must be completed with a C or higher within two semesters of admission, according to the degree page.", ASU, "Students assigned any additional coursework upon admission must complete those classes with a grade of \"C\" (scale is 4.00 = \"A\") or higher within two semesters of admission."),
        F("requirement", "Letters of recommendation not required", "The SCAI graduate CS page says letters of recommendation are not required for the Computer Science MCS/MS program.", ASU_SCAI, "Letters of Recommendation are not required for students applying to the Computer Science MCS/MS program."),
        F("requirement", "GRE not required", "The 2026-2027 handbook states GRE scores are not required.", ASU_HB, "GRE scores are not required."),
        F("requirement", "Handbook GPA", "The handbook requires a minimum 3.25 GPA in the last 60 undergraduate credit hours.", ASU_HB, "To be considered for the MS program, we require a minimum cumulative GPA of 3.25 in the last 60 credit hours of the undergraduate degree."),
        F("requirement", "English proficiency", "The handbook lists English proficiency minimums, including IELTS 6.5.", ASU_HB, "Applicants demonstrate proficiency by scoring at least 80 (if taken before January 21, 2026) or 4 (if taken on or after January 21, 2026) on the TOEFL iBT, 6.5 on the IELTS, or 105 on the Duolingo English test."),
        F("course", "Program options", "The degree can be completed as a course-based master's, with a thesis, or with the applied project course CSE 593.", ASU, "30 credit hours - course-based master's, or 30 credit hours and a thesis, or 30 credit hours including the required applied project course (CSE 593)"),
        F("course", "Required core areas", "All options require 9 credit hours in the core areas of applications, foundations, and systems.", ASU, "Required Core Areas (9 credit hours)"),
        F("course", "Course-based electives", "The course-based option includes 21 credit hours of electives.", ASU, "Students in the course-based option take 21 credit hours of electives."),
        F("course", "Thesis electives", "Thesis students take 15 credit hours of electives.", ASU, "Students in the thesis option take 15 credit hours of electives."),
        F("course", "Applied project electives", "Applied project students take 18 credit hours of electives.", ASU, "Applied project students take 18 credit hours of electives."),
        F("course", "CSE 593 Applied Project", "The applied project culminating course is CSE 593 (3 credit hours).", ASU, "CSE 593 Applied Project (3)"),
        F("course", "CSE 599 Thesis", "The thesis culminating course is CSE 599 (6 credit hours).", ASU, "CSE 599 Thesis (6)"),
        F("course", "500-level CSE minimum", "At least 24 of the 30 credit hours must be 500-level CSE courses at ASU.", ASU, "At least 24 of these credit hours must be 500-level CSE courses at ASU."),
        F("course", "400-level limit", "Up to six credit hours of 400-level courses may be applied to the plan of study.", ASU, "Up to six credit hours of 400-level courses may be applied to the plan of study."),
        F("course", "AI concentration courses", "The handbook lists CSE 571, CSE 575, CSE 576, and CSE 574 as required AI concentration courses.", ASU_HB, "CSE 571 Artificial Intelligence (3)"),
        F("course", "Cybersecurity concentration course", "The handbook requires CSE 543 Information Assurance and Security in the cybersecurity concentration.", ASU_HB, "CSE 543: Information Assurance and Security (3)"),
        F("deadline", "Fall priority deadline", "The degree page lists a Fall in-person priority deadline of 12/01.", ASU, "12/01"),
        F("deadline", "Spring priority deadline", "The degree page lists a Spring in-person priority deadline of 08/01.", ASU, "08/01"),
        F("deadline", "Priority deadline meaning", "Applications completed before the priority deadline receive priority consideration; later applications are reviewed in order and on a space-available basis.", ASU, "A priority deadline means that applications submitted and completed before the priority deadline will receive priority consideration."),
        F("deadline", "Handbook deadlines", "The 2026-2027 handbook lists December 1 for a Fall start and August 1 for a Spring start.", ASU_HB, "December 1 for Fall start"),
        F("deadline", "SCAI deadline table", "The SCAI graduate CS page lists December 1 for the M.S. or M.C.S. Fall deadline.", ASU_SCAI, "December 1 (MS or MCS) or"),
        F("deadline", "TA application for master's students", "The assistantships page says master's students may apply for Spring 2027 TA, IA, or Grader positions, with a November 7 priority deadline.", ASU_TA, "The application for spring 2027 TA, IA or Grader positions available for graduate students are now open. Priority deadline is November 7."),
        F("deadline", "TA awards emphasis", "The same page states that TA positions are awarded to highly qualified PhD students.", ASU_TA, "TA positions are awarded to highly qualified PhD students."),
        F("faculty", "MS thesis chair list", "A September 2026 list names faculty currently approved to chair a Computer Science M.S. thesis. The FSE faculty directory page did not return a usable name list without JavaScript.", ASU_FAC, "This list below are the faculty who are currently approved to chair a MS thesis for the Computer Science MS programs."),
        F("faculty", "Adil Ahmad", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Ahmad,Adil,Adil.Ahmad@asu.edu,Computer Science,Chair"),
        F("faculty", "Gail-Joon Ahn", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Ahn,Gail-Joon,gahn@asu.edu,Computer Science,Chair"),
        F("faculty", "Chitta Baral", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Baral,Chitta,chitta.baral@asu.edu,Computer Science,Chair"),
        F("faculty", "Rida Bazzi", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Bazzi,Rida,bazzi@asu.edu,Computer Science,Chair"),
        F("faculty", "Hani Ben Amor", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Ben Amor,Hani,Hani.Benamor@asu.edu,Computer Science,Chair"),
        F("faculty", "Kasim Candan", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Candan,Kasim,candan@asu.edu,Computer Science,Chair"),
        F("faculty", "Adam Doupé", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Doupe,Adam,doupe@asu.edu,Computer Science,Chair"),
        F("faculty", "Stephanie Forrest", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Forrest,Stephanie,steph@asu.edu,Computer Science,Chair"),
        F("faculty", "Charles Colbourn", "Named on the Computer Science M.S. thesis-chair list as co-chair; the list has no research blurb.", ASU_FAC, "Colbourn,Charles,Charles.Colbourn@asu.edu,Computer Science,Co-chair"),
        F("faculty", "Ajay Bansal", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Bansal,Ajay,Ajay.Bansal@asu.edu,Computer Science,Chair"),
        F("faculty", "Srividya Bansal", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Bansal,Srividya,Srividya.Bansal@asu.edu,Computer Science,Chair"),
        F("faculty", "Jedidiah Crandall", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Crandall,Jedidiah,jedimaestro@asu.edu,Computer Science,Chair"),
        F("faculty", "Hasan Davulcu", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Davulcu,Hasan,HDavulcu@asu.edu,Computer Science,Chair"),
        F("faculty", "Pooyan Fazli", "Named on the Computer Science M.S. thesis-chair list; the list has no research blurb.", ASU_FAC, "Fazli,Pooyan,pooyan@asu.edu,Computer Science,Chair"),
    ],
    "notes": """# Arizona State University — Computer Science, M.S. (schoolId 1)

## Pages found
- overview, admissions, curriculum, deadlines: https://degrees.asu.edu/masters-phd/major/ASU00/ESCOMSCMS/computer-science-ms
- additional program pages opened because they are clearly this M.S. (or include it beside MCS/PhD): SCAI graduate CS page, 2026-2027 M.S. handbook PDF, assistantships page
- faculty: Computer Science M.S. Faculty Endorsements spreadsheet (list updated September 2026), linked from the SCAI graduate CS page

## Missing / blocked / JS-limited
- The Fulton Schools faculty directory at https://faculty.engineering.asu.edu/directory/scai/computer-science-and-engineering loaded, but the faculty name list is not present in the static HTML (JavaScript-rendered). No individual research profiles were taken from that directory.
- General Graduate Admission and international admission pages were opened; they are university-wide, so program-specific requirements were taken from the degree page, SCAI page, and M.S. handbook instead.

## Scope cautions
- The SCAI graduate CS page also covers MCS and PhD. Facts used from that page are ones that clearly include the M.S. (for example, the letters-of-recommendation footnote for MCS/MS and the December 1 M.S. or M.C.S. deadline).
- The degree page says discrete math is recommended; the 2026-2027 handbook says a background in discrete math is required. Both quotes are kept; no winner was chosen.
- The degree page and handbook also differ slightly on how a prior graduate GPA is described. Both should be checked by a human.
- The assistantships page invites master's students to apply for Spring 2027 TA/IA/Grader roles, and also says TA positions are awarded to highly qualified PhD students. Both statements are quoted.
- Do not confuse this research M.S. with the industry-oriented MCS or MCS Online.
""",
}

json.dump({"ok": True}, open("/tmp/partial_schools_marker.json","w"))
print("school 1 facts", len(SCHOOLS[1]["facts"]))

# ===================== school 2 Cal Poly Pomona =====================
CPP_AMAMRA = "https://www.cpp.edu/faculty/aamamra/index.shtml"
CPP_CHEN = "https://www.cpp.edu/faculty/tingtingchen/index.shtml"
CPP_JI = "https://www.cpp.edu/faculty/hji/index.shtml"
CPP_RAHEJA = "https://www.cpp.edu/faculty/raheja/index.shtml"
CPP_SHI = "https://www.cpp.edu/faculty/wendyshi/index.shtml"
CPP_WANG = "https://www.cpp.edu/faculty/yunshengwang/index.shtml"
CPP_SUN = "https://www.cpp.edu/faculty/yusun/index.shtml"
CPP_TANG = "https://www.cpp.edu/faculty/ftang/index.shtml"
CPP_MARIN = "https://www.cpp.edu/faculty/santanamarin/index.shtml"
CPP_STEICHEN = "https://www.cpp.edu/faculty/bsteichen/index.shtml"

SCHOOLS[2] = {
    "schoolId": 2,
    "schoolName": "Cal Poly Pomona",
    "programName": "Computer Science, M.S. (on-campus)",
    "pages": [
        {"kind": "overview", "url": CPP_PRO},
        {"kind": "admissions", "url": CPP_ADM},
        {"kind": "curriculum", "url": CPP_INFO},
        {"kind": "faculty", "url": CPP_FAC},
        {"kind": "deadlines", "url": CPP_DEAD},
    ],
    "facts": [
        F("overview", "Program aim", "The M.S. is described as deepening hardware and software themes and stressing technical competence and independent work.", CPP_PRO, "The Master of Science program in Computer Science provides an opportunity for students to enhance their understanding of the principal hardware and software themes."),
        F("overview", "Evening classes", "The FAQ says the program offers evening classes across a wide range of computer science topics.", CPP_FAQ, "Evening classes with a wide range of topics in computer science"),
        F("overview", "Department also plans an online M.S.", "The department home page announces an Online Master of Science in Computer Science coming up in Fall 2026; that is a different program from this on-campus M.S.", CPP_DEPT, "Online Master of Science in Computer Science"),
        F("requirement", "Undergraduate CS presumption", "Admission presumes an undergraduate computer science degree or equivalent core coursework; students without that preparation cannot be admitted.", CPP_ADM, "The graduate program is based on the presumption that the student has an undergraduate degree with a major in computer science, or equivalent coursework in the principal computer science and mathematics subjects required"),
        F("requirement", "Admission is competitive", "Meeting minimum requirements does not guarantee admission.", CPP_ADM, "These are minimum requirements for the program admission. Admission is competitive and meeting minimum requirement does not guarantee admission to the program."),
        F("requirement", "Unconditional GPA", "Unconditional admission requires a bachelor's in CS or a closely related field with a GPA of 3.0 or better in all courses or in the most recent 60 semester units.", CPP_ADM, "Applicants seeking unconditional admission must have a bachelor's degree in Computer Science or closely related field with a GPA of 3.0 or better in all courses or the most recent 60 semester units attempted"),
        F("requirement", "Unconditional topic coverage", "Required background includes calculus, probability and statistics, object-oriented programming, discrete structures, data structures, computer organization, algorithms, computer architecture, operating systems, and software engineering.", CPP_ADM, "10-12 semester units including Calculus and Probability and Statistics"),
        F("requirement", "Conditional admission", "Applicants with a bachelor's degree and a GPA above 3.0 who do not meet unconditional requirements may seek conditional admission, with priority given to unconditional admissions first.", CPP_ADM, "Applicants who do not meet unconditional admission but have a bachelor's degree with a GPA above 3.0 may seek conditional admission. However, priority will be given to unconditional admissions first."),
        F("requirement", "International students not conditionally admitted", "International students who need an I-20 will not be conditionally admitted and must meet all requirements before admission.", CPP_ADM, "However, per CSU Admissions and SEVIS Policy, international students attending the University on a visa requiring issuance of an I-20 will NOT be conditionally admitted and must meet all requirements prior to gaining admission to the University."),
        F("requirement", "Conditional students and aid", "Students in conditional standing do not qualify for federal financial aid until they are in unconditional standing.", CPP_ADM, "Students in conditional standing do not qualify for federal financial aid until they are in unconditional standing."),
        F("requirement", "English language requirement", "Applicants whose native language is not English and whose bachelor's instruction was not in English must meet IELTS 6.5 or TOEFL 213 computer / 550 paper / 80 internet.", CPP_ADM, "must have passed the International English Language Testing System (IELTS) exam with a minimum score of 6.5 or the Test of English as a Foreign Language (TOEFL) exam with a minimum score of 213 on the computer-based, or 550 on the paper-based, or 80 on the Internet-based TOEFL."),
        F("requirement", "Supplemental application form", "A program supplemental form is required and applications missing it may be declined without review.", CPP_APP, "This Program Application form is REQUIRED and applications missing this completed form uploaded to Cal State Mentor site may be declined without review."),
        F("requirement", "SOP, resume, letters, unofficial transcript", "Applicants must also submit a statement of purpose, resume/CV, two letters of recommendation, and an unofficial PDF transcript on Cal State Apply.", CPP_APP, "applicants are REQUIRED to submit a statement of purpose (why applying to CPP CS MS program and how it will help to achieve your career objectives), resume/CV, two letters of recommendation and unoffical pdf transcript on Cal State Apply."),
        F("requirement", "GRE not required", "The department does not require the GRE, but recommends it if the major GPA does not meet 3.0.", CPP_FAQ, "The department does not require the GRE. However, it is recommended that you take it if your major GPA does not meet the 3.0 requirement."),
        F("requirement", "GPA to maintain", "A 3.0 GPA or better must be maintained in all upper-division undergraduate and all graduate courses.", CPP_INFO, "A grade point average of 3.0 (B) or better must be maintained in all upper-division undergraduate and all graduate courses."),
        F("requirement", "Transfer unit cap", "No more than 9 semester units of acceptable graduate credit may be transferred from another graduate institution.", CPP_INFO, "No more than 9 semester units of acceptable graduate credit may be transferred from another graduate institution."),
        F("requirement", "Combined transfer limit", "A total limit of 9 semester units of transfer, Extended University, and/or petitioned units may be included on a master's contract, with a 7-year time limit.", CPP_INFO, "A total limit of 9 semester units of transfer, Extended University, and/or units petitioned for graduate credit may be included on a master's contract. The stipulated time limit of 7 years applies to all of the above."),
        F("course", "Total units", "The program requires 30 units in total.", CPP_INFO, "TOTAL UNITS REQUIRED: 30 units"),
        F("course", "CS 5250", "Required course: CS 5250 Advanced Computer Architecture (3 units).", CPP_INFO, "CS 5250 Advanced Computer Architecture (3 units)"),
        F("course", "CS 5300", "Required course: CS 5300 Advanced Algorithm Design and Analysis.", CPP_INFO, "CS 5300 Advanced Algorithm Design and Analysis (3units)"),
        F("course", "CS 5800", "Required course: CS 5800 Advanced Software Engineering (3 units).", CPP_INFO, "CS 5800 Advanced Software Engineering (3 units)"),
        F("course", "CS 6640", "Required course: CS 6640 Graduate Seminar (1 unit).", CPP_INFO, "CS 6640 Graduate Seminar (1 unit)"),
        F("course", "Project option units", "The project path uses CS 6910 Directed Study (1 unit) and CS 6950 Master's Degree Project (1 unit).", CPP_INFO, "CS 6910 Directed Study (1 unit) and"),
        F("course", "CS 6950 project", "The master's project course is CS 6950 (1 unit).", CPP_INFO, "CS 6950 Master's Degree Project (1 unit)"),
        F("course", "Thesis option units", "The thesis path uses CS 6910 Directed Study (2 units) and CS 6960 Master's Degree Thesis (3 units).", CPP_INFO, "CS 6960 Master's Degree Thesis (3 units)"),
        F("course", "Elective units", "Students select 18 elective units with the project option or 15 elective units with the thesis option.", CPP_INFO, "Select 18 units (with Master's Degree Project) or 15 units (with Master's Degree Thesis) from the following list of courses or other courses approved by the Computer Science Graduate Committee:"),
        F("course", "4000-level electives", "M.S. students may use up to 6 semester units of CS 4000-level electives, with listed exclusions, and may not repeat undergraduate classes already taken.", CPP_INFO, "Computer Science MS students can take up to 6 semester units of CS 4000+ levels elective classes to satisfy their elective courses requirement, excluding the following courses: CS 4000, CS 4310, CS 4610, CS 4620, CS 4630, and CS 4800."),
        F("course", "Required courses offered yearly", "Required courses CS 5250, CS 5300, CS 5800, and CS 6640 are offered every year; other CS 5xxx courses every two years.", CPP_INFO, "The required courses CS 5250, CS 5300, CS 5800 and CS 6640 are offered every year. All other graduate courses CS 5xxx are offered every two years."),
        F("course", "Evening graduate courses", "Graduate courses traditionally meet in late afternoons and evenings.", CPP_INFO, "Graduate courses traditionally meet in late afternoons and evenings."),
        F("deadline", "Fall 2027 on-campus CS M.S.", "The university graduate deadlines table lists the on-campus Computer Science M.S. Fall 2027 application deadline as 4/1/2027 and the intent-to-enroll deadline as 7/1/2027.", CPP_DEAD, "Computer Science"),
        F("deadline", "Spring 2027 on-campus CS M.S.", "The same table lists the on-campus Computer Science M.S. Spring 2027 application deadline as 10/1/2026 and the intent-to-enroll deadline as 1/12/2027.", CPP_DEAD, "10/1/2026"),
        F("deadline", "Spring 2027 applications open", "Spring 2027 applications open July 1, 2026.", CPP_DEAD, "Spring 2027 applications open July 1, 2026"),
        F("deadline", "Fall 2027 applications open", "Fall 2027 applications open on August 1, 2026.", CPP_DEAD, "Fall 2027 applications open on August 1, 2026"),
        F("deadline", "International 5/1 rule", "If a program's Fall deadline is after 5/1, international applicants must apply no later than 5/1 for visa timing. The on-campus CS M.S. Fall 2027 deadline is 4/1/2027, which is before that cutoff.", CPP_DEAD, "International applicants: For graduate programs that have a Fall application deadline beyond 5/1, international applicants must submit an application no later than 5/1 to ensure sufficient time to obtain a visa."),
        F("deadline", "Applications accepted except summer", "Applications are accepted semester by semester except Summer, and applicants are encouraged to apply in the initial filing period.", CPP_APP, "Applications are accepted semester by semester except Summer."),
        F("faculty", "Graduate coordinator", "Tingting Chen is listed as Professor and Graduate Coordinator. This is a department-wide faculty listing, not limited to this one program.", CPP_FAC, "Professor & Graduate Coordinator"),
        F("faculty", "Department chair", "Amar Raheja is listed as Professor and Chair on the department permanent faculty page.", CPP_FAC, "Professor & Chair"),
        F("faculty", "Abdelfattah Amamra research", "His faculty profile states research interests in cyber security, big data analysis, and machine learning. Department faculty listing, not program-specific.", CPP_AMAMRA, "Dr. Amamra research intersts include Cyber Security, Big Data Analysis, and Machine Learning."),
        F("faculty", "Tingting Chen research", "Her profile describes current research in data privacy, health informatics, and AI applications in medical systems.", CPP_CHEN, "My current research interests include data privacy, health informatics and AI applications in medical systems."),
        F("faculty", "Hao Ji research", "His profile lists large-scale numerical methods, high-performance computing, machine learning, computer vision, and physically-based animation.", CPP_JI, "His research interests include Large-scale Numerical Methods, High-performance Computing, Machine Learning, Computer Vision, and Physically-based Animation."),
        F("faculty", "Amar Raheja research", "His profile lists image processing, computer vision, and machine learning, with interdisciplinary AI applications.", CPP_RAHEJA, "My research interests are in the area of image processing, computer vision and machine learning."),
        F("faculty", "Wendy Shi research", "Her profile, noting she joined in August 2025, describes HCI, computing education, and data science.", CPP_SHI, "Her research explores the intersection of human-computer interaction, computing education, and data science, with a focus on understanding how technology can support learning, collaboration, and meaningful work."),
        F("faculty", "Yunsheng Wang research", "His profile lists AIoT, connected and autonomous driving, edge computing, cybersecurity, and social networks.", CPP_WANG, "His research interests include Artificial Intelligence of Things (AIoT), connected and autonomous driving, edge computing, cybersecurity, and social networks."),
        F("faculty", "Yu Sun role", "His profile says he directs the Software Engineering and Mobile Cloud Computing Lab (SoftCom Lab).", CPP_SUN, "where he serves as the director of the Software Engineering and Mobile Cloud Computing Lab (SoftCom Lab)."),
        F("faculty", "Daisy Tang research", "Her profile describes doctoral research on multi-robot systems.", CPP_TANG, "performing her research on multi-robot systems."),
        F("faculty", "Ericsson Santana Marin research", "His profile describes research in AI for Threat Intelligence.", CPP_MARIN, "My research focuses on AI for Threat Intelligence (ATI), which develops predictive and adaptive learning models to anticipate emerging threats in adversarial online environments."),
        F("faculty", "Ben Steichen research lab", "His profile says he leads the hapii lab on human-centered, adaptive, and personalized information interaction.", CPP_STEICHEN, "Dr. Steichen leads the hapii lab (human-centered, adaptive, and personalized information interaction), which researches novel information access solutions that support each individual person."),
        F("faculty", "Mohammad Husain expertise (listing)", "The department research-interests page, which is department-wide, lists systems and network security and related areas.", CPP_RES, "Expertise: Systems and network security, digital forensics in embedded systems and cloud computing, smartphone security and social applications, power-aware secure computing"),
        F("faculty", "Brianna Posadas expertise (listing)", "The department research-interests page lists HCI, usable security, accessibility, and applied computing in agriculture, among other areas. No individual cpp.edu/faculty profile page was found (404).", CPP_RES, "Expertise: Human-computer interaction, user-centered design and technology adoption, usable security, accessibility and inclusive design, applied computing in agriculture and other real-world domains, data science and big data analysis, remote sensing (UAVs), computing education"),
        F("faculty", "John Korah expertise (listing)", "The department research-interests page lists parallel and distributed algorithm design, HPC, and related areas.", CPP_RES, "Expertise: Parallel & distributed algorithm design, high performance computing, large & dynamic network analysis, computational social systems, cybersecurity, parallel/distributed information retrieval, modeling & simulation"),
    ],
    "notes": """# Cal Poly Pomona — Computer Science, M.S. (on-campus) (schoolId 2)

## Pages found
- overview: https://www.cpp.edu/sci/computer-science/prospective-graduate-students/index.shtml
- admissions: https://www.cpp.edu/sci/computer-science/prospective-graduate-students/admission-requirements.shtml (plus application procedures and FAQ)
- curriculum: https://www.cpp.edu/sci/computer-science/prospective-graduate-students/program-information.shtml (includes the major-required course list)
- faculty: department permanent faculty and research-interests pages, plus individual faculty profiles
- deadlines: https://www.cpp.edu/admissions/graduate/masters-explore.shtml (university graduate deadline table; use the Computer Science M.S. row, not the online row)

## Missing / blocked
- The assigned 2026-2027 catalog start URL https://catalog.cpp.edu/preview_program.php?catoid=78&poid=24271 returned HTTP 202 with an AWS WAF bot challenge (`x-amzn-waf-action: challenge`). It was not bypassed. Course requirements were taken from the department Program Information page instead of the catalog.
- The department "Course Descriptions" page only points to the university catalog, which was blocked.
- Brianna Posadas's cpp.edu/faculty profile URL returned 404; her research blurb was taken from the department research-interests listing only.

## Scope cautions
- Faculty pages are department-wide, not specific to this one program.
- The department home page announces an Online Master of Science in Computer Science coming in Fall 2026, and the university deadline table has a separate "Computer Science (Online)" row. Facts here are for the on-campus M.S. unless noted.
- The Program Information page mixes semester-unit language with some leftover "quarter" wording (for example, assistantships "from quarter to quarter" and enrollment "during the quarter of graduation"). Treat that page as current department text, but a human should confirm against the 2026-2027 catalog once it is accessible.
- The planned-future-course-offerings page only lists terms through Spring 2026 (this research was run in November 2026), so it was not used as a current schedule.
- Application procedures still mention uploading a form to a "Cal State Mentor site," which may be leftover wording.
""",
}

print("school 2 facts", len(SCHOOLS[2]["facts"]))

# ===================== school 4 CSU Chico =====================
SCHOOLS[4] = {
    "schoolId": 4,
    "schoolName": "California State University, Chico",
    "programName": "Computer Science, M.S.",
    "pages": [
        {"kind": "overview", "url": CHICO},
        {"kind": "admissions", "url": CHICO},
        {"kind": "curriculum", "url": CHICO_CAT},
        {"kind": "faculty", "url": CHICO_FAC},
        {"kind": "deadlines", "url": CHICO},
    ],
    "facts": [
        F("overview", "On-campus delivery", "The program page lists this M.S. as an on-campus graduate program.", CHICO, "On Campus"),
        F("overview", "Open to any discipline", "The program is open to applicants from any discipline and includes a computer science theory foundation plus project-based learning.", CHICO, "Our program is open to applicants from any discipline and combines a strong foundation in computer science theory with practical, project-based learning opportunities."),
        F("overview", "Catalog welcome statement", "The 2026-2027 catalog says the M.S. welcomes students from all undergraduate disciplines, including those without a CS background.", CHICO_CAT, "The Master of Science in Computer Science welcomes students from all undergraduate disciplines. The program is designed to accommodate students with and without a computer science background."),
        F("overview", "Students without a CS background", "The program page says students from any discipline can enter and can take background courses after enrolling.", CHICO, "Students from any discipline can enter the program. Students without background courses can take all courses after enrolling."),
        F("requirement", "30 units", "The 2026-2027 catalog lists 30 total units required.", CHICO_CAT, "Total Units Required: 30"),
        F("requirement", "600-level minimum", "At least 18 of the units required for the degree must be in 600-level courses.", CHICO_CAT, "At least 18 of the units required for the degree in 600-level courses."),
        F("requirement", "Core courses", "Students complete three graduate core courses (nine units): CSCI 608, CSCI 611, or CSCI 612; plus CSCI 630 and CSCI 650.", CHICO_CAT, "Completion of three graduate core courses (nine units): CSCI 608, CSCI 611, or CSCI 612; CSCI 630 and CSCI 650."),
        F("requirement", "CSCI 605 excluded", "CSCI 605 may not be taken to meet program requirements.", CHICO_CAT, "CSCI 605 may not be taken to meet program requirements."),
        F("requirement", "Most common capstone", "The most common culminating experience is the capstone course plan.", CHICO_CAT, "The most common culminating experience for master's students in Computer Science is to demonstrate competency in graduate study by completion of the capstone course using plan (a)."),
        F("requirement", "Capstone course CSCI 693", "The capstone plan is 30 units of in-class coursework including a passing score in CSCI 693, taken in the last 9 units or last semester, with a maximum of three attempts.", CHICO_CAT, "This plan includes 30 units of in-class coursework, including a passing score in the capstone course CSCI 693. CSCI 693 is to be taken as part of the last 9 units, or during the last semester of the graduate program."),
        F("requirement", "Project plan qualifications", "The project plan requires a 3.5 GPA, a faculty nomination, and faculty approval of a project proposal by a 2/3 majority vote.", CHICO_CAT, "maintaining a GPA of 3.5 or above in their post-baccalaureate coursework,"),
        F("requirement", "3.0 GPA to remain in program", "Students must maintain a minimum 3.0 GPA in specified coursework categories.", CHICO_CAT, "Students must maintain a minimum 3.0 grade point average in each of the following three categories: all coursework taken at any accredited institution subsequent to admission to the master's program;"),
        F("requirement", "C-grade limit", "No more than two courses with a grade of C may count toward the approved program.", CHICO_CAT, "In addition, students may not count more than two courses in which they receive a grade of C toward the approved program."),
        F("requirement", "Five-year time limit", "All degree requirements must be completed within five years, and the department says no course validation or program extensions will be granted.", CHICO_CAT, "Due to the rapid changes in the field of computer science, the Department of Computer Science requires all candidates to complete the program within five years, including projects and theses. No course validation will be allowed and no program extensions will be granted."),
        F("requirement", "GRE on program page", "The program page requires the GRE unless the bachelor's degree was awarded by an ABET-accredited program in computer science or a related discipline, and prefers a score of 300 or higher.", CHICO, "The Graduate Record Exam (GRE) is required unless the applicant's bachelor's degree was awarded by an ABET-accredited program in computer science or a related discipline. A GRE score of 300 or higher is preferred."),
        F("requirement", "GRE in catalog", "The 2026-2027 catalog requires a combined GRE verbal and quantitative score of 300 and exempts graduates of an ABET-accredited program in computer science (it does not mention a related discipline).", CHICO_CAT, "Completion of the Graduate Record Examination (GRE) with a combined score of 300 on the verbal and quantitative portions. Graduates of an ABET accredited program in computer science are exempt from this requirement."),
        F("requirement", "Statement of purpose", "A statement of purpose is required; the program page lists a resume as optional.", CHICO, "Statement of purpose, resume (optional)"),
        F("requirement", "Letters of reference in catalog", "The catalog lists submission of two letters of reference among classified-status prerequisites.", CHICO_CAT, "Submission of two letters of reference."),
        F("requirement", "Prerequisite courses for classified status", "Classified status requires completion of program prerequisites equivalent to CSCI 111, 211, 217, 311, 370, 430, and 440, which do not count toward the M.S.", CHICO_CAT, "Courses taken for the purpose of advancement to classified status will not be used towards the MS degree."),
        F("requirement", "CSCI 211 and 311 restriction", "Only courses from ABET-accredited programs may be used for CSCI 211 and CSCI 311.", CHICO_CAT, "Only courses from ABET accredited programs may be used for CSCI 211 and CSCI 311."),
        F("course", "CSCI 608", "Catalog course title: CSCI 608 Data Science for Graduate Studies (3 units).", CHICO_COURSES, "CSCI 608 Data Science for Graduate Studies 3 Units"),
        F("course", "CSCI 611", "Catalog course title: CSCI 611 Applied Machine Learning (3 units).", CHICO_COURSES, "CSCI 611 Applied Machine Learning 3 Units"),
        F("course", "CSCI 612", "Catalog course title: CSCI 612 Applied Computer Vision (3 units).", CHICO_COURSES, "CSCI 612 Applied Computer Vision 3 Units"),
        F("course", "CSCI 630", "Catalog course title: CSCI 630 Software Design and Maintenance (3 units).", CHICO_COURSES, "CSCI 630 Software Design and Maintenance 3 Units"),
        F("course", "CSCI 650", "Catalog course title: CSCI 650 Algorithms and Computability (3 units).", CHICO_COURSES, "CSCI 650 Algorithms and Computability 3 Units"),
        F("course", "CSCI 693", "Catalog course title: CSCI 693 Research Methods in Computer Science (3 units).", CHICO_COURSES, "CSCI 693 Research Methods in Computer Science 3 Units"),
        F("course", "CSCI 699P", "Catalog course title: CSCI 699P Master's Project (3 units).", CHICO_COURSES, "CSCI 699P Master's Project 3 Units"),
        F("course", "CSCI 699T", "Catalog course title: CSCI 699T Master's Thesis (1-6 units).", CHICO_COURSES, "CSCI 699T Master's Thesis 1-6 Units"),
        F("course", "CSCI 605 title", "CSCI 605 is titled Data Structures and Algorithms for Data Science and may not be used to meet CS M.S. program requirements.", CHICO_COURSES, "CSCI 605 Data Structures and Algorithms for Data Science 3 Units"),
        F("course", "Writing proficiency", "Writing proficiency is demonstrated by passing CSCI 693, CSCI 699P, or CSCI 699T.", CHICO_CAT, "Computer science students will demonstrate their writing competence in the English language by successfully passing CSCI 693, CSCI 699P, or CSCI 699T."),
        F("deadline", "Fall deadline", "The program page lists a Fall application deadline of April 1.", CHICO, "Fall: April 1"),
        F("deadline", "Spring deadline", "The program page lists a Spring deadline of December 1, and October 1 for international applicants.", CHICO, "Spring: December 1 (October 1 for international applicants)"),
        F("deadline", "Blended program deadlines", "The blended BS + MS application deadlines are April 1 for fall start and November 1 for spring start; GRE is not required for the blended path.", CHICO_CAT, "Application deadlines: April 1 for fall start, November 1 for spring start."),
        F("faculty", "Department listing", "The department faculty-and-staff page is a department-wide listing and does not include research blurbs.", CHICO_FAC, "Todd Gibson Chair and Professor"),
        F("faculty", "Todd Gibson", "Listed as Chair and Professor; directory profile has no research description.", CHICO_FAC, "Todd Gibson Chair and Professor"),
        F("faculty", "Abbas Attarwala", "Listed as Professor; no research blurb on the department listing.", CHICO_FAC, "Abbas Attarwala Professor"),
        F("faculty", "Kevin Buffardi", "Listed as Professor; no research blurb on the department listing.", CHICO_FAC, "Kevin Buffardi Professor"),
        F("faculty", "Bryan Dixon", "Listed as Professor; no research blurb on the department listing.", CHICO_FAC, "Bryan Dixon Professor"),
        F("faculty", "Ben Juliano", "Listed as Professor; no research blurb on the department listing.", CHICO_FAC, "Ben Juliano Professor"),
        F("faculty", "Bo Shen", "Listed as Associate Professor; no research blurb on the department listing.", CHICO_FAC, "Bo Shen Associate Professor"),
        F("faculty", "Samuel B Siewert", "Listed as Professor; no research blurb on the department listing.", CHICO_FAC, "Samuel B Siewert Professor"),
        F("faculty", "Kun Tian", "Listed as Professor; no research blurb on the department listing.", CHICO_FAC, "Kun Tian Professor"),
        F("faculty", "Richard C Tillquist", "Listed as Associate Professor; no research blurb on the department listing.", CHICO_FAC, "Richard C Tillquist Associate Professor"),
        F("faculty", "David Zeichick", "Listed as Associate Professor; no research blurb on the department listing.", CHICO_FAC, "David Zeichick Associate Professor"),
        F("faculty", "Oleksiy Al-Saadi", "Listed as Assistant Professor; no research blurb on the department listing.", CHICO_FAC, "Oleksiy Al-Saadi Assistant Professor"),
        F("faculty", "Kathleen Isenegger", "Listed as Assistant Professor; no research blurb on the department listing.", CHICO_FAC, "Kathleen Isenegger Assistant Professor"),
        F("faculty", "Jaime Raigoza", "Listed as Interim Associate Dean; no research blurb on the department listing.", CHICO_FAC, "Jaime Raigoza Interim Associate Dean"),
    ],
    "notes": """# California State University, Chico — Computer Science, M.S. (schoolId 4)

## Pages found
- overview, admissions, deadlines: https://www.csuchico.edu/academics/majors-programs/computer-science-ms.shtml
- curriculum: 2026-2027 catalog program page, plus the department catalog course list at #coursestext
- faculty: department Faculty and Staff page and the campus directory department listing

## Missing / limited
- Individual campus-directory employee pages list title and contact information only; none of the opened profiles stated a current research area. Faculty facts therefore have empty research detail, as required when no blurb is present.
- University "How to Apply" domestic and international pages were opened; they are campus-wide graduate instructions, not CS M.S.-specific, so program requirements and deadlines were taken from the program page and catalog.

## Scope cautions
- There is a separate Computer Science M.S. Online program; this research is for the on-campus M.S.
- The program page and the 2026-2027 catalog disagree slightly on the GRE exemption: the program page exempts an ABET-accredited bachelor's in computer science or a related discipline; the catalog exempts graduates of an ABET-accredited program in computer science and does not mention a related discipline. Both quotes are kept.
- The catalog also requires two letters of reference; the program-page requirements list highlights a statement of purpose and an optional resume. A human should confirm the current supplemental list.
- CSCI 608's catalog prerequisite text also mentions admission to the master's in data science and analytics; it remains a listed CS M.S. core option.
- Faculty listings are department-wide, not program-specific.
""",
}

print("school 4 facts", len(SCHOOLS[4]["facts"]))

# ===================== school 5 CSU East Bay =====================
EB_ERTAUL = "https://www.csueastbay.edu/directory/profiles/cs/ertaullevent.html"
EB_GREWE = "https://www.csueastbay.edu/directory/profiles/cs/grewelynne.html"
EB_JOHNSON = "https://www.csueastbay.edu/directory/profiles/cs/johnsonmatthew.html"
EB_ROOH = "https://www.csueastbay.edu/directory/profiles/cs/roohparvarfarzan.html"
EB_HARI = "https://www.csueastbay.edu/directory/profiles/cs/hariprasadyashas.html"
EB_ZHONG = "https://www.csueastbay.edu/directory/profiles/cs/zhongfay.html"
EB_ERICKSON = "https://www.csueastbay.edu/directory/profiles/cs/ericksonvarick.html"

SCHOOLS[5] = {
    "schoolId": 5,
    "schoolName": "California State University, East Bay",
    "programName": "Computer Science, M.S.",
    "pages": [
        {"kind": "overview", "url": EB_PRO},
        {"kind": "admissions", "url": EB_START},
        {"kind": "curriculum", "url": EB_FY},
        {"kind": "faculty", "url": EB_FAC},
        {"kind": "deadlines", "url": EB_FY},
    ],
    "facts": [
        F("overview", "30-unit program", "The prospective-students page describes a 30-unit (10-course) M.S., with 5 required courses, 4 electives, and a capstone.", EB_PRO, "The M.S. Computer Science degree program is 30 units equivalent to 10 courses. Of these, 5 courses (15 units) are required by all students in the program, 4 courses (12 units) are elective courses, and once course is a capstone experience (3-6 units)."),
        F("overview", "Three concentrations", "Applicants select a concentration: Computer Science, Computer Networking, or Artificial Intelligence and Machine Learning.", EB_PRO, "When you apply you will be asked to select a concentration. We currently have three concentrations that allow specialization in a particular area."),
        F("overview", "Typical load", "Enrolled M.S. students typically take 1-4 courses (3-12 units) each semester.", EB_PRO, "Students enrolled in the M.S. graduate program typically take 1-4 courses (3-12 units) each semester, depending on their situation."),
        F("requirement", "Admissions review path", "Applications go first to the university Office of Admissions and are then forwarded to the Computer Science department for an admit or reject decision.", EB_START, "After the Office of Admissions has completed their review, applications are forwarded to the Computer Science department which makes the decision whether to accept or reject the applicant."),
        F("requirement", "GRE required on start page", "The assigned start page still says GRE general test scores are required, with preferred percentiles above the 20th verbal and 60th quantitative.", EB_START, "GRE general test scores are required."),
        F("requirement", "GRE no longer required on prospective page", "The department prospective-students page says GRE scores are no longer required.", EB_PRO, "Please note: GRE scores are no longer required."),
        F("requirement", "Undergraduate GPA 3.0", "Applicants normally need an undergraduate CS or related degree, a 3.0 GPA in all undergraduate work, and a B or better in listed CS and math courses.", EB_START, "must have a grade point average of 3.0 in all undergraduate work, and must have earned a \"B\" or better in the Computer Science and Mathematics courses listed below."),
        F("requirement", "Preferred B+ in important courses", "The start page says the department prefers at least a B+ average in the important courses.", EB_START, "Currently, to be eligible for admission into the M.S. program, we prefer at least a B+ average in the important courses."),
        F("requirement", "International class standing", "For international applicants, the department looks for students who graduated first class or first class with distinction.", EB_START, "For international applicants, we look for students who have graduated first class or first class with distinction."),
        F("requirement", "Conditional admission", "Applicants missing some course prerequisites may be admitted as Conditionally Classified if they have completed at least Data Structures and most lower-division prerequisites.", EB_START, "may be admitted to the program at the discretion of the department as a \"Conditionally Classified Graduate\" student, provided the student's record clearly demonstrates the capability of completing all the course requirements after admission."),
        F("requirement", "Deficiency grades on start page", "The start page says course deficiencies or remediation must be completed with grades of B or better before enrolling in graduate CS courses, and those courses do not count toward the master's degree.", EB_START, "Students must complete any course deficiencies or remediation with grades of \"B\" or better. Course deficiencies or remediation must be completed before enrolling in graduate Computer Science courses."),
        F("requirement", "Prerequisite grade on first-year page", "The first-year master's page says each prerequisite must be passed with a B- or better and does not count toward the M.S. degree.", EB_FY, "Each prerequisite must be passed with a B− or better and does not count toward the MS degree."),
        F("requirement", "Most students conditionally classified", "The first-year page says nearly all incoming students are admitted as Conditionally Classified.", EB_FY, "Nearly all incoming students are admitted as Conditionally Classified, which means your admission letter lists prerequisite or remediation courses to complete in addition to your graduate coursework."),
        F("requirement", "Lower-division CS prerequisites", "Required lower-division equivalents include CS 101, CS 201, CS 211, and CS 221.", EB_START, "CS 101 Computer Science I"),
        F("requirement", "Upper-division CS prerequisites", "Required upper-division equivalents include CS 301, CS 311, CS 321, CS 411, CS 413, and CS 421.", EB_START, "CS 301 Data Structures and Algorithms"),
        F("requirement", "Math prerequisites", "Mathematics admission requirements include MATH 130, MATH 131, MATH 225, and STAT 316.", EB_START, "MATH 130 Calculus I"),
        F("requirement", "Junior college limit", "Junior-college courses may fulfill lower-division but not upper-division admission prerequisites.", EB_START, "Courses from junior colleges can be used to fulfill lower division admission prerequisites (100 and 200 level) but not upper division admission prerequisites (300 or 400 level.)"),
        F("requirement", "Open University note", "Students who lack enough prerequisites may use Open University; the page says Open University students have last registration priority and no student visa is sponsored by that program.", EB_START, "While Open University allows students to take courses before being accepted to the Master's program, Open University students have the last registration priority and no student visa are sponsored by the Open University program."),
        F("requirement", "Graduate GPA", "The first-year page requires 30 units of 600-level coursework, each passed with a C or better, and an overall 3.0 graduate GPA.", EB_FY, "The MS in Computer Science requires 30 units of 600-level coursework, each passed with a C or better and an overall 3.0 graduate GPA."),
        F("course", "Five required core courses", "Every student completes five required core courses: CS 601, CS 611, CS 621, CS 651, and CS 671.", EB_FY, "Every student completes five required core courses: CS 601, CS 611, CS 621, CS 651, and CS 671."),
        F("course", "Capstone options", "The capstone is the Comprehensive Exam (CS 692), a Project (CS 693), or a Thesis (CS 699).", EB_FY, "You also complete a concentration and a capstone — the Comprehensive Exam (CS 692), a Project (CS 693), or a Thesis (CS 699)."),
        F("course", "CS 601 on 2015 roadmap", "A department-hosted Computer Science concentration roadmap lists CS 601 Advanced Algorithms (3 units). The form is dated July 31, 2015.", EB_RMCS, "CS 601        Advanced Algorithms"),
        F("course", "CS 621 title", "The same roadmap lists CS 621 Operating System Design.", EB_RMCS, "CS 621        Operating System Design"),
        F("course", "CS 651 title", "The same roadmap lists CS 651 Web Systems.", EB_RMCS, "CS 651        Web Systems"),
        F("course", "CS 611 title", "The same roadmap lists CS 611 Theory of Computation.", EB_RMCS, "CS 611             Theory of Computation"),
        F("course", "CS 671 title", "The same roadmap lists CS 671 Cybersecurity.", EB_RMCS, "CS 671             Cybersecurity"),
        F("course", "AI/ML concentration courses", "The AI/ML roadmap adds CS 661 Advanced Artificial Intelligence, CS 667 Machine Learning, and CS 663 Computer Vision. The form is dated July 31, 2015.", EB_RMAI, "CS 661      Advanced Artificial Intelligence"),
        F("course", "CS 692 eligibility", "Students must complete the five required courses and have a cumulative GPA of 3.0 before the comprehensive exams, and may not take a required or deficiency course concurrently with CS 692.", EB_692, "and have a cumulative GPA of 3.0."),
        F("course", "CS 692 attempts", "CS 692 is 3 units, graded CR/NC; students must pass all three exams and have a maximum of three attempts.", EB_692, "CS 692 Capstone Exams is a three (3) unit class. Grading is CR/NC. Students need to pass all three exams to earn a credit for the class."),
        F("course", "CS 693 GPA", "The capstone project requires a cumulative GPA of 3.5 or higher and a B or better average in the five required courses.", EB_693, "In addition, the student must have a cumulative GPA of 3.5 or higher."),
        F("course", "CS 699 GPA", "The thesis option also requires a graduate and cumulative GPA of 3.5 or higher after the five required courses.", EB_699, "In addition, the student must have a graduate course GPA and cumulative CSUEB GPA of 3.5 or higher."),
        F("deadline", "Pay fees by the deadline", "The first-year page warns students to pay fees by the deadline, even if waitlisted, or they can be dropped from all classes.", EB_FY, "Pay your fees by the deadline — even if you are waitlisted. Unpaid fees can drop you from all classes."),
        F("deadline", "International full-time enrollment", "F-1 students must enroll in at least 8 units each fall and spring and may take only one fully online course per semester.", EB_FY, "International (F-1) students must enroll in at least 8 units each fall and spring."),
        F("deadline", "Financial aid and prerequisites", "Financial aid is based on degree-applicable 600-level units; prerequisites alone do not establish aid eligibility. The page advises including at least 4 units of 600-level coursework each term.", EB_FY, "Because prerequisites are undergraduate courses that do not count toward the degree, enrolling in prerequisites alone — even a full load — does not establish aid eligibility."),
        F("faculty", "Department listing is department-wide", "The Faculty & Staff page is a department-wide directory, not limited to this M.S. program.", EB_FAC, "CSUEB Computer Science Professors"),
        F("faculty", "Varick Erickson", "Listed as Graduate Coordinator on the department faculty page. His directory profile did not include a research blurb in the extracted text.", EB_FAC, "Erickson, Varick"),
        F("faculty", "Levent Ertaul research", "His directory profile lists cybersecurity and related research areas. The listing is department-wide.", EB_ERTAUL, "Research: Cyber Security & Privacy, Cyber War, Hacking Technoligies, Cyber Security Policies, Computer Networks Security, Cryptology, Wireless Security, Cloud Security, International Governance of Cyber Space"),
        F("faculty", "Lynne Grewe research", "Her directory profile lists computer vision, machine learning and AI, and media in social and mobile applications.", EB_GREWE, "Computer Vision, Machine Learning & Artificial Intelligence, Media in Social and Mobile Applications"),
        F("faculty", "Matt Johnson research", "His directory profile lists genetic algorithms and artificial intelligence.", EB_JOHNSON, "Research: Genetic Algorithms, Artificial Intelligence"),
        F("faculty", "Farzan Roohparvar research", "His directory profile lists system-on-chip design and related areas. The department page also lists him as Interim Department Chair.", EB_ROOH, "Research: System On Chip (SOC) Design"),
        F("faculty", "Yashas Hariprasad research", "His directory profile describes research at the intersection of AI, cybersecurity, digital forensics, and quantum-safe communication.", EB_HARI, "My expertise lies at the convergence of artificial intelligence, cybersecurity, digital forensics, and quantum-safe communication."),
        F("faculty", "Jiaofei Zhong focus", "Her directory profile lists a professional focus in extended reality, data engineering, and STEM education.", EB_ZHONG, "Extended Reality, Data Engineering, STEM Education"),
        F("faculty", "Farzan Roohparvar title", "The department faculty page lists Farzan (Bobby) Roohparvar as Interim Department Chair and Professor.", EB_FAC, "Roohparvar, Farzan (Bobby)- Interim Department Chair"),
        F("faculty", "Levent Ertaul title", "The department faculty page lists Levent Ertaul as Department Chair and Professor.", EB_FAC, "Ertaul, Levent - Department Chair"),
    ],
    "notes": """# California State University, East Bay — Computer Science, M.S. (schoolId 5)

## Pages found
- admissions (start URL): https://www.csueastbay.edu/cs/degrees-programs1/csms.html (this page is mainly M.S. admission prerequisites)
- overview / additional admissions: https://www.csueastbay.edu/cs/prospective-students/index.html
- curriculum: https://www.csueastbay.edu/cs/first-year-masters-students/index.html plus capstone pages and department-hosted concentration roadmaps
- faculty: department Faculty & Staff page and individual directory profiles
- deadlines / funding notes: first-year master's page (fee-payment, F-1 enrollment, aid rules). No CS M.S.-specific application-date table was found on the department site.

## Missing / not used
- catalog.csueastbay.edu was not used, as instructed (that host does not load). Degree-requirement language was taken from department pages and PDFs hosted on www.csueastbay.edu.
- A university Application Deadlines page exists in site navigation but is campus-wide, not a CS M.S. deadline table, so it was not used as a program deadline source.
- Several directory profiles (including some lecturers and some professors) had no research blurb; those names can still be confirmed on the department listing.

## Scope cautions
- The start page says "GRE general test scores are required." The prospective-students page says "GRE scores are no longer required." Both quotes are kept; a human should confirm which is current.
- Prerequisite grade language also differs: the start page says "B or better"; the first-year page says "B- or better."
- The two concentration roadmaps match the five core courses named on the first-year page, but the PDF forms are dated July 31, 2015. Treat course titles as department-posted, and confirm currency without using the blocked catalog.
- The prospective page typo "once course is a capstone" is quoted as written. It also says "Computer Networking Concentration" in one heading and "Computer Networks" on the degrees page.
- Faculty listings and profiles are department-wide, not program-specific.
- The first-year page points to the university catalog for full requirements; that catalog host was not used.
""",
}

print("school 5 facts", len(SCHOOLS[5]["facts"]))

# ===================== school 7 CSU Fullerton online MSE =====================
SCHOOLS[7] = {
    "schoolId": 7,
    "schoolName": "California State University, Fullerton",
    "programName": "Software Engineering, M.S. (online)",
    "pages": [
        {"kind": "overview", "url": F_ABOUT},
        {"kind": "admissions", "url": F_REQ},
        {"kind": "curriculum", "url": F_COURSES},
        {"kind": "faculty", "url": F_FAC},
        {"kind": "deadlines", "url": F_HOME},
    ],
    "facts": [
        F("overview", "Online MSE purpose", "The about page describes the online M.S. in Software Engineering as preparation for careers as software engineers and software project managers.", F_ABOUT, "The Master of Science in Software Engineering (MSE) is an online program that prepares individuals for careers as software engineers and software project managers in industry and government agencies."),
        F("overview", "Process-oriented curriculum", "The curriculum is described as a process-oriented approach grounded in software engineering research, theory, principles, and practice, including CMMI, ISO, agile, Scrum, XP, and architecture/design patterns.", F_ABOUT, "The program emphasizes a comprehensive and thorough process-oriented approach to software development, and its curriculum is fundamentally grounded in software engineering research, theory, principles, and practice"),
        F("overview", "Designed for working professionals", "The program is designed for professionals working in computer science who want graduate education in software engineering.", F_ABOUT, "The program is designed for professionals working in the field of computer science who wish to further their skills and pursue graduate level education in Software Engineering."),
        F("overview", "Culminating practicum project", "The culminating activity is a practicum project on a large-scale software project, not a thesis.", F_ABOUT, "The culminating activity of the M.S. will be a practicum project where each student applies his or her knowledge and skills to a large-scale software project."),
        F("overview", "100% online asynchronous", "The home page states that all courses are 100% online with asynchronous delivery.", F_HOME, "All courses 100% online"),
        F("overview", "No I-20 for this program", "The FAQ says an I-20 cannot be issued because the program is offered entirely online.", F_FAQ, "An I-20 cannot be issued for the MSE program, since it is offered entirely online. U.S. immigration policy prohibits the student visa for entirely online programs."),
        F("overview", "Distinct from on-campus AMSE", "CSUF also offers an on-campus Accelerated M.S. in Software Engineering (AMSE), operated by Extension and International Programs; the online MSE is operated by the Computer Science department.", F_FAQ, "CSUF offers two software engineering programs: the online MSE program and the on-campus Accelerated Master of Science in Software Engineering (AMSE) program."),
        F("overview", "Degree title has no 'Online'", "The FAQ says the word Online will not appear on the diploma; the degree is Master of Science in Software Engineering.", F_FAQ, "No. Although this is a fully online program, the degree itself is a \"Master of Science in Software Engineering.\" The word \"Online\" will not appear on your degree."),
        F("overview", "Program length", "The FAQ says the online MSE regularly takes 22 months; AMSE takes 17 months.", F_FAQ, "Regularly MSE takes 22 months, while AMSE takes 17 months to complete."),
        F("requirement", "University GPA", "Applicants need an acceptable baccalaureate degree with a minimum cumulative GPA of 2.5 for Computer Science undergraduates or 3.0 for other degree holders.", F_REQ, "The applicant must have completed four-year college course of study and hold an acceptable baccalaureate degree with a minimum/cumulative grade point average of 2.5 for applicants having an undergraduate degree in Computer Science or 3.0 for other degree holders."),
        F("requirement", "Transcripts", "An official transcript is required from each university or college attended.", F_REQ, "An official transcript is required from each university or college you have attended."),
        F("requirement", "International English scores", "International students must meet a minimum of 550 paper or 80 TOEFL, 6.5 Academic IELTS, or 58 PTE.", F_REQ, "For international students: a minimum score of 550 (paper) or 80 in TOEFL or 6.5 Academic in IELTS or 58 in PTE."),
        F("requirement", "Software engineering background", "Applicants should have taken an introductory software engineering course equivalent to CPSC 362 or have work experience in software development.", F_REQ, "The applicant should have taken an Introductory Software Engineering course (equivalent with CPSC 362 at CSUF) or should have work experience in software development."),
        F("requirement", "Work-experience alternative", "The FAQ says at least one year of software development experience is expected if the applicant has not completed CPSC 362 or an equivalent course, and a resume should be emailed to the program.", F_FAQ, "To apply, at least one year of experience in software development is expected."),
        F("requirement", "GRE not required", "The FAQ says the GRE is not required.", F_FAQ, "No, we do not require the GRE."),
        F("requirement", "TOEFL/IELTS when needed", "TOEFL/IELTS is needed if the applicant has not earned at least 72 college-level units in the U.S. or another majority English-speaking country.", F_FAQ, "Yes, if you have not earned at least 72 college-level units in the U.S. or another majority English-speaking country. Residency/citizenship is irrelevant to this requirement."),
        F("requirement", "No exit exam or thesis", "There is no exit exam; students complete a terminal project in CPSC 597, and there is no thesis option.", F_FAQ, "No, there is no exit exam. Students are required to complete a significant terminal project as part of the curriculum (CPSC 597). There is no thesis option."),
        F("requirement", "One course per semester costs the same", "Students may take only one course per semester, but it costs the same as taking two, and each course is offered once per year.", F_FAQ, "Yes, but this will cost the same as taking two courses per semester. Also, since MSE offers each course once per year, you will need to wait a year if you miss taking a certain course."),
        F("requirement", "No program-level scholarship", "The FAQ says there is no scholarship at the program level and points to university financial aid.", F_FAQ, "There is no scholarship at the program level. However, you may check the university Financial Aid website for available funding opportunities."),
        F("course", "CPSC 541", "CPSC 541 Systems and Software Standards and Requirements (3 units), prerequisite CPSC 362 or equivalent work experience.", F_COURSES, "CPSC 541 - Systems and Software Standards and Requirements (3 units)"),
        F("course", "CPSC 542", "CPSC 542 Software Verification and Validation (3 units).", F_COURSES, "CPSC 542 - Software Verification and Validation (3 units)"),
        F("course", "CPSC 543", "CPSC 543 Software Maintenance (3 units).", F_COURSES, "CPSC 543 - Software Maintenance (3 units)"),
        F("course", "CPSC 544", "CPSC 544 Advanced Software Process (3 units).", F_COURSES, "CPSC 544 - Advanced Software Process (3 units)"),
        F("course", "CPSC 545", "CPSC 545 Software Design and Architecture (3 units).", F_COURSES, "CPSC 545 - Software Design and Architecture (3 units)"),
        F("course", "CPSC 546", "CPSC 546 Modern Software Management (3 units).", F_COURSES, "CPSC 546 - Modern Software Management (3 units)"),
        F("course", "CPSC 547", "CPSC 547 Software Measurement (3 units).", F_COURSES, "CPSC 547 - Software Measurement (3 units)"),
        F("course", "CPSC 548", "CPSC 548 Professional, Ethical and Legal Issues for Software Engineers (3 units).", F_COURSES, "CPSC 548 - Professional, Ethical and Legal Issues for Software Engineers (3 units)"),
        F("course", "CPSC 589", "CPSC 589 Seminar in Computer Science is the online version offered to MSE students only, used to survey related work and build a project proposal.", F_COURSES, "The online version of CPSC 589, offered to MSE students only. Prepare for the graduate project - survey related work and build a project proposal."),
        F("course", "CPSC 597", "CPSC 597 Project is the online version offered to MSE students only, used to perform the graduate project proposed in CPSC 589.", F_COURSES, "The on-line version of CPSC 597, offered to MSE students only. Perform a graduate project as you proposed in CPSC 589 and write a project report."),
        F("course", "First-year fall schedule", "First year Fall courses are CPSC 541 and CPSC 544, totaling 6 units.", F_COURSES, "CPSC 541"),
        F("course", "Schedule by semester", "The courses page includes a term-by-term schedule with 6 units each term through second-year Spring.", F_COURSES, "Schedule by Semester"),
        F("course", "Second-year spring", "Second year Spring courses are CPSC 543 and CPSC 597, totaling 6 units.", F_COURSES, "Second Year: Spring"),
        F("deadline", "Fall 2026 application window", "The home page says applications for Fall 2026 admission opened on October 1, 2025, with a Cal State Apply deadline of May 1, 2026.", F_HOME, "Applications for Fall 2026 admission are open on October 1, 2025!"),
        F("deadline", "Cal State Apply deadline", "The application deadline is May 1, 2026.", F_HOME, "Application (Cal State Apply) Deadline:"),
        F("deadline", "May 1, 2026", "The home page lists May 1, 2026 as the Cal State Apply deadline.", F_HOME, "May 1, 2026"),
        F("deadline", "Documents deadline", "Required documents are due May 15, 2026.", F_HOME, "Required Documents Deadline:"),
        F("deadline", "May 15, 2026", "The required documents deadline is May 15, 2026.", F_HOME, "May 15, 2026"),
        F("deadline", "Application window on requirements page", "The requirements page says the online application is open from October 1, 2025 to May 1, 2026, with a $70 application fee.", F_REQ, "The online application will be open from October 1, 2025 to May 1, 2026. A $70 application fee will apply and must be paid online."),
        F("deadline", "First come, first served", "The requirements page says results can take weeks or months and advises applying as early as possible because admission is first come, first served.", F_REQ, "Usually it takes a few weeks or months to get the result. First come, first served. Therefore, apply as early as possible."),
        F("deadline", "Enrollment deposit", "The deadline to accept the offer and pay a non-refundable $250 enrollment deposit is listed as TBD.", F_REQ, "The deadline to accept the offer of admission and pay a non-refundable $250 enrollment deposit is TBD."),
        F("deadline", "FAQ cost estimate", "The FAQ estimates roughly $14,000 for a California resident and $26,000 for a non-resident, including international students.", F_FAQ, "The online MSE program costs roughly $14,000 for a California resident, and $26,000 for a non-resident (including international students)."),
        F("deadline", "Cost page dated Fall 2023", "The program cost page calculates totals from Fall 2023 rates: $14,076.81 for California residents and $25,956.81 for non-residents.", F_COST, "based on the rate as of Fall 2023"),
        F("faculty", "Bin Cong", "Program Coordinator and Professor of Computer Science; expertise listed includes CMMI and software architecture and engineering. This is a program faculty listing for the online MSE.", F_FAC, "Bin Cong, Ph.D."),
        F("faculty", "Bin Cong expertise", "His listed expertise includes SEI CMM/CMMI roles, internet and enterprise computing, and software architecture and engineering.", F_FAC, "SEI Authorized CMM Lead Assessor"),
        F("faculty", "Ning Chen", "Professor of Computer Science; expertise includes embedded systems, software testing, and enterprise software architecture.", F_FAC, "Ning Chen, Ph.D."),
        F("faculty", "Ning Chen expertise", "His listed expertise includes embedded systems and wireless sensor networks, software testing and QA, and enterprise software architecture.", F_FAC, "Embedded Systems and Wireless Sensor Network (Linux Kernel, Contiki, TinyOS)"),
        F("faculty", "James Choi", "Professor of Computer Science; expertise includes software development methodology, reverse engineering, and configuration management.", F_FAC, "James Choi, Ph.D."),
        F("faculty", "James Choi expertise", "His listed expertise includes software development methodology, reverse engineering, and configuration management.", F_FAC, "Software Development Methodology"),
        F("faculty", "Christopher Ryu", "Professor of Computer Science; expertise includes software design and architecture plus machine learning and AI.", F_FAC, "Christopher Ryu, Ph.D."),
        F("faculty", "Christopher Ryu expertise", "His listed expertise includes software design and architecture, machine learning, artificial intelligence, and computational finance.", F_FAC, "Software Design and Architecture"),
        F("faculty", "Chang-Hyun Jo", "Professor of Computer Science; expertise includes agile software process and CMMI/ISO and object-oriented and agent-oriented software engineering.", F_FAC, "Chang-Hyun Jo, Ph.D."),
        F("faculty", "Chang-Hyun Jo expertise", "His listed expertise includes agile software process and CMMI/ISO, process assessment, and object-oriented and agent-oriented software engineering.", F_FAC, "Agile Software Process & CMMI/ISO"),
    ],
    "notes": """# California State University, Fullerton — Software Engineering, M.S. (online) (schoolId 7)

## Pages found
- admissions / requirements (start URL): https://www.fullerton.edu/ecs/mse/requirements/
- overview: https://www.fullerton.edu/ecs/mse/about/ and https://www.fullerton.edu/ecs/mse/
- curriculum: https://www.fullerton.edu/ecs/mse/programs/courses.php
- faculty: https://www.fullerton.edu/ecs/mse/faculty/index.php (program faculty listing with expertise; no separate individual profile pages were linked)
- deadlines: program home page and requirements page; cost/funding notes on the FAQ and Program Cost pages

## Missing / blocked
- https://www.fullerton.edu/ecs/future/graduate.php and graduate-admission.php returned HTTP 403 and were not used or bypassed.
- The program handbook link in the site menu returned a 404 at /ecs/mse/handbook.
- Early http:// fetches of /ecs/mse/ and /ecs/mse/about/ (no trailing slash) returned 500; the same paths succeeded over https with a trailing slash.
- The How to Enroll page is present but last published 4/5/22 and still links a Spring 2022 registration guide, so it was not used for current deadline facts.

## Scope cautions
- This is the online Software Engineering M.S., not the on-campus Computer Science M.S. and not the on-campus Accelerated M.S. in Software Engineering (AMSE).
- The program cannot issue an I-20.
- Program Cost figures are explicitly "based on the rate as of Fall 2023." The FAQ gives a rougher current estimate ($14,000 / $26,000). A human should confirm current tuition.
- The enrollment-deposit deadline is listed as TBD.
- Faculty listed on the MSE faculty page are presented as program faculty; they are also identified as Computer Science professors.
""",
}

print("school 7 facts", len(SCHOOLS[7]["facts"]))


def assign_ids(facts):
    out = []
    for i, fact in enumerate(facts, 1):
        item = {"id": f"f{i}", **fact}
        out.append(item)
    return out


def write_school(sid: int) -> dict:
    rec = SCHOOLS[sid]
    facts = assign_ids(rec["facts"])
    checks = []
    kept = []
    dropped = []
    for fact in facts:
        result = check_quote(fact["sourceUrl"], fact["quote"])
        row = {
            "id": fact["id"],
            "kind": fact["kind"],
            "name": fact["name"],
            "sourceUrl": fact["sourceUrl"],
            "quote": fact["quote"],
            "pass": result["pass"],
            "reason": result["reason"],
            "evidenceFiles": result["files"],
        }
        checks.append(row)
        if result["pass"]:
            kept.append(fact)
        else:
            dropped.append(row)

    # re-id kept facts sequentially
    kept = assign_ids([{k: v for k, v in f.items() if k != "id"} for f in kept])

    payload = {
        "schoolId": rec["schoolId"],
        "schoolName": rec["schoolName"],
        "programName": rec["programName"],
        "pages": rec["pages"],
        "facts": kept,
    }
    out_json = RESEARCH / f"school-{sid}.json"
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    check_path = CHECKS / f"school-{sid}.quote-check.json"
    check_doc = {
        "schoolId": sid,
        "schoolName": rec["schoolName"],
        "programName": rec["programName"],
        "factsSubmitted": len(facts),
        "factsPassed": len(kept),
        "factsFailed": len(dropped),
        "checks": checks,
        "droppedFacts": dropped,
    }
    check_path.write_text(json.dumps(check_doc, indent=2, ensure_ascii=False) + "\n")
    notes_path = CHECKS / f"school-{sid}.notes.md"
    notes_path.write_text(rec["notes"] + f"\n\n## Quote check\n- submitted: {len(facts)}\n- passed: {len(kept)}\n- failed and dropped: {len(dropped)}\n")
    return {
        "schoolId": sid,
        "out": str(out_json),
        "check": str(check_path),
        "notes": str(notes_path),
        "submitted": len(facts),
        "passed": len(kept),
        "failed": len(dropped),
        "failed_ids": [d["id"] for d in dropped],
    }


def main():
    summary = []
    for sid in (1, 2, 4, 5, 7):
        result = write_school(sid)
        summary.append(result)
        print(f"school {sid}: {result['passed']}/{result['submitted']} passed, failed={result['failed_ids']}")
    (CHECKS / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
