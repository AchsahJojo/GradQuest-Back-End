package com.project03.sop;

import java.util.Set;

/**
 * Public program pages the statement worker may fetch.
 * The phone sends a school id; Spring resolves that id to one of these URLs.
 */
public final class SopAllowlist {

    public static final String CSUF_MS_CS =
            "https://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661";
    public static final String CAL_POLY_SLO_MS_CS =
            "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/";
    public static final String UCSD_CSE_MS =
            "https://cse.ucsd.edu/graduate/degree-programs/ms-program";

    private static final Set<String> URLS = Set.of(
            normalize(CSUF_MS_CS),
            normalize(CAL_POLY_SLO_MS_CS),
            normalize(UCSD_CSE_MS));

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
