package com.project03.sop;

import java.util.Set;

/**
 * Public program pages the statement worker may fetch.
 * The phone sends a school id; Spring resolves that id to one of these URLs.
 * Keep this set identical to gradquest-worker/src/allowlist.ts.
 */
public final class SopAllowlist {

    public static final String CSUF_MS_CS =
            "https://www.fullerton.edu/ecs/academics/graduate-admissions.html";
    public static final String CAL_POLY_SLO_MS_CS =
            "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/";
    public static final String UCSD_CSE_MS =
            "https://cse.ucsd.edu/graduate/degree-programs/ms-program";

    private static final Set<String> URLS = Set.of(
            normalize(CSUF_MS_CS),
            normalize(CAL_POLY_SLO_MS_CS),
            normalize(UCSD_CSE_MS),
            // batch2 program_page_url values (schools 1, 2, 4, 5, 7, 8, 9, 13, 14, 23)
            normalize("https://degrees.asu.edu/masters-phd/major/ASU00/ESCOMSCMS/computer-science-ms"),
            normalize("https://catalog.cpp.edu/preview_program.php?catoid=78&poid=24271"),
            normalize("https://www.csuchico.edu/academics/majors-programs/computer-science-ms.shtml"),
            normalize("https://www.csueastbay.edu/cs/degrees-programs1/csms.html"),
            normalize("https://www.fullerton.edu/ecs/mse/requirements/"),
            normalize("https://www.csulb.edu/hung-family-college-of-engineering/mscs-admissions"),
            normalize("https://www.calstatela.edu/ecst/cs/graduate"),
            normalize("https://electrical.sdsu.edu/programs/graduate/ms-computer-engineering"),
            normalize("https://catalog.sdsu.edu/preview_program.php?catoid=12&poid=12288"),
            normalize("https://catalog.unlv.edu/preview_program.php?catoid=52&poid=14606"));

    private SopAllowlist() {}

    public static boolean contains(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        return URLS.contains(normalize(url));
    }

    public static String normalize(String url) {
        String trimmed = url.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    static {
        // Trailing-slash variants still match the set above.
        if (!contains(CSUF_MS_CS) || !contains(CAL_POLY_SLO_MS_CS + "/") || !contains(UCSD_CSE_MS)) {
            throw new IllegalStateException("SOP allowlist failed to normalize");
        }
    }
}
