package com.project03.service;

/**
 * Single config for Track A weighted matching (0–100 scale).
 * Tune here without hunting through scoring logic.
 */
public final class MatchWeights {

    public static final int BUDGET = 30;
    public static final int GPA = 25;
    public static final int LOCATION = 20;
    public static final int PROGRAM_TYPE = 15;
    public static final int MODALITY = 5;
    public static final int ENROLLMENT = 5;

    /** Linear budget falloff reaches 0 at this fraction over budget (0.5 = 50% over). */
    public static final double BUDGET_OVER_ZERO_AT = 0.50;

    /** Deadline within this many days → closingSoon on the match card. */
    public static final int CLOSING_SOON_DAYS = 30;

    /** How many ranked programs to return (dashboard list). */
    public static final int TOP_N = 10;

    private MatchWeights() {
    }
}
