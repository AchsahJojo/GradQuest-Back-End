/** Public program pages. Keep this set identical to SopAllowlist.java. */
export const ALLOWED_PROGRAM_URLS = [
  "https://www.fullerton.edu/ecs/academics/graduate-admissions.html",
  "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/",
  "https://cse.ucsd.edu/graduate/degree-programs/ms-program",
  // batch2 program_page_url values (schools 1, 2, 4, 5, 7, 8, 9, 13, 14, 23)
  "https://degrees.asu.edu/masters-phd/major/ASU00/ESCOMSCMS/computer-science-ms",
  "https://catalog.cpp.edu/preview_program.php?catoid=78&poid=24271",
  "https://www.csuchico.edu/academics/majors-programs/computer-science-ms.shtml",
  "https://www.csueastbay.edu/cs/degrees-programs1/csms.html",
  "https://www.fullerton.edu/ecs/mse/requirements/",
  "https://www.csulb.edu/hung-family-college-of-engineering/mscs-admissions",
  "https://www.calstatela.edu/ecst/cs/graduate",
  "https://electrical.sdsu.edu/programs/graduate/ms-computer-engineering",
  "https://catalog.sdsu.edu/preview_program.php?catoid=12&poid=12288",
  "https://catalog.unlv.edu/preview_program.php?catoid=52&poid=14606",
] as const;

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

const ALLOWED = new Set(ALLOWED_PROGRAM_URLS.map(normalizeUrl));

export function isAllowlisted(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED.has(normalizeUrl(parsed.toString()));
  } catch {
    return false;
  }
}
