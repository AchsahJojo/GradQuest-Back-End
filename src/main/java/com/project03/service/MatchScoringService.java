package com.project03.service;

import com.project03.dto.SchoolMatchResult;
import com.project03.dto.Top5MatchResponse;
import com.project03.model.ProgramTerm;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Track A matching: GRE hard-filter → term filter → weighted 0–100 score.
 * Capstone / requirementType is intentionally not scored.
 */
@Service
public class MatchScoringService {

    public Top5MatchResponse rankTopMatches(List<School> schools, List<ProgramTerm> allTerms,
                                            StudentPreference prefs, LocalDate today) {
        if (today == null) {
            today = LocalDate.now();
        }

        List<ProgramTerm> terms = allTerms != null ? allTerms : List.of();
        List<School> afterGre = schools.stream()
                .filter(s -> passesGreFilter(s, prefs))
                .collect(Collectors.toList());

        boolean termFilterOn = prefs.getDesiredTerm() != null && prefs.getDesiredStartYear() != null;
        List<ScoredCandidate> candidates = new ArrayList<>();
        List<ProgramTerm> failedTermRows = new ArrayList<>();

        for (School school : afterGre) {
            List<ProgramTerm> schoolTerms = terms.stream()
                    .filter(t -> t.getSchool() != null && Objects.equals(t.getSchool().getId(), school.getId()))
                    .collect(Collectors.toList());

            if (!termFilterOn) {
                ScoreParts parts = scoreSchool(school, prefs);
                candidates.add(new ScoredCandidate(school, parts, null, null, null, false));
                continue;
            }

            ProgramTerm matched = findMatchingTerm(schoolTerms, prefs, today);
            if (matched == null) {
                failedTermRows.addAll(schoolTerms);
                continue;
            }

            DeadlineInfo dl = resolveDeadline(matched, prefs);
            List<String> reasons = new ArrayList<>();
            if (dl.deadline == null) {
                reasons.add("Deadline not published — check program page");
            }
            ScoreParts parts = scoreSchool(school, prefs);
            parts.reasons.addAll(0, reasons);
            boolean closingSoon = dl.deadline != null
                    && !dl.deadline.isBefore(today)
                    && !dl.deadline.isAfter(today.plusDays(MatchWeights.CLOSING_SOON_DAYS));
            candidates.add(new ScoredCandidate(school, parts, matched, dl.deadline, dl.type, closingSoon));
        }

        candidates.sort(Comparator
                .comparingDouble((ScoredCandidate c) -> c.parts.score).reversed()
                .thenComparing(c -> costOrMax(c.school))
                .thenComparing(c -> nameKey(c.school), String.CASE_INSENSITIVE_ORDER));

        Top5MatchResponse response = new Top5MatchResponse();
        List<SchoolMatchResult> matches = new ArrayList<>();
        int limit = Math.min(MatchWeights.TOP_N, candidates.size());
        for (int i = 0; i < limit; i++) {
            ScoredCandidate c = candidates.get(i);
            matches.add(SchoolMatchResult.from(
                    c.school, i + 1, round1(c.parts.score), c.parts.reasons,
                    c.matchedTerm, c.deadline, c.deadlineType, c.closingSoon));
        }
        response.setMatches(matches);

        if (matches.isEmpty()) {
            response.setMessage("No programs matched your filters. Try enabling GRE-required schools, "
                    + "widening location, or picking another start term.");
        } else if (matches.size() < MatchWeights.TOP_N) {
            response.setMessage("Showing " + matches.size() + " match"
                    + (matches.size() == 1 ? "" : "es")
                    + " — try enabling GRE, widening location, or another start term.");
        }

        if (termFilterOn && matches.size() < MatchWeights.TOP_N) {
            response.setNextOpenTerm(suggestNextOpenTerm(failedTermRows, prefs, today));
        }

        return response;
    }

    /**
     * GRE preference (not a score):
     * - grePreferred == false (or null) → hard-filter: only gre_policy != REQUIRED
     * - grePreferred == true → GRE-required and non-GRE programs both eligible
     */
    boolean passesGreFilter(School school, StudentPreference prefs) {
        boolean greOk = Boolean.TRUE.equals(prefs.getGrePreferred());
        if (greOk) {
            return true;
        }
        if (school.getGrePolicy() == null) {
            return true; // unknown policy: do not hard-exclude
        }
        return school.getGrePolicy() != School.GrePolicy.REQUIRED;
    }

    ProgramTerm findMatchingTerm(List<ProgramTerm> schoolTerms, StudentPreference prefs, LocalDate today) {
        for (ProgramTerm t : schoolTerms) {
            if (t.getTerm() != prefs.getDesiredTerm()) {
                continue;
            }
            if (!Objects.equals(t.getStartYear(), prefs.getDesiredStartYear())) {
                continue;
            }
            // accepting != false → true or null eligible
            if (Boolean.FALSE.equals(t.getAccepting())) {
                continue;
            }
            DeadlineInfo dl = resolveDeadline(t, prefs);
            if (dl.deadline != null && dl.deadline.isBefore(today)) {
                continue;
            }
            return t;
        }
        return null;
    }

    DeadlineInfo resolveDeadline(ProgramTerm term, StudentPreference prefs) {
        boolean intl = Boolean.TRUE.equals(prefs.getIsInternational());
        if (intl && term.getInternationalDeadline() != null) {
            return new DeadlineInfo(term.getInternationalDeadline(), "INTERNATIONAL");
        }
        return new DeadlineInfo(term.getDomesticDeadline(), "DOMESTIC");
    }

    ScoreParts scoreSchool(School school, StudentPreference prefs) {
        List<Dim> dims = new ArrayList<>();

        // Budget vs domestic full_program_cost (7a)
        if (prefs.getBudget() != null && school.getFullProgramCost() != null) {
            double budget = prefs.getBudget();
            double cost = school.getFullProgramCost().doubleValue();
            double raw;
            List<String> reasons = new ArrayList<>();
            if (cost <= budget) {
                raw = 1.0;
                reasons.add("Fits budget");
            } else {
                double overFrac = (cost - budget) / budget;
                if (overFrac >= MatchWeights.BUDGET_OVER_ZERO_AT) {
                    raw = 0.0;
                    reasons.add("Over budget");
                } else {
                    raw = 1.0 - (overFrac / MatchWeights.BUDGET_OVER_ZERO_AT);
                    reasons.add("Slightly over budget");
                }
            }
            dims.add(new Dim(MatchWeights.BUDGET, raw, reasons));
        }

        // GPA
        if (prefs.getGpa() != null && school.getMinGpa() != null) {
            if (prefs.getGpa() >= school.getMinGpa()) {
                dims.add(new Dim(MatchWeights.GPA, 1.0, List.of("Meets GPA minimum")));
            } else {
                dims.add(new Dim(MatchWeights.GPA, 0.0,
                        List.of("GPA below published minimum")));
            }
        }

        // Location / state
        if (prefs.getState() != null && school.getState() != null) {
            if (prefs.getState().equalsIgnoreCase(school.getState())) {
                dims.add(new Dim(MatchWeights.LOCATION, 1.0, List.of("Matches location")));
            } else {
                dims.add(new Dim(MatchWeights.LOCATION, 0.0, List.of()));
            }
        }

        // Program type (normalize intake labels ↔ catalog codes)
        if (prefs.getProgramType() != null && school.getProgramType() != null) {
            if (programTypesMatch(prefs.getProgramType(), school.getProgramType())) {
                dims.add(new Dim(MatchWeights.PROGRAM_TYPE, 1.0, List.of("Matches program type")));
            } else {
                dims.add(new Dim(MatchWeights.PROGRAM_TYPE, 0.0, List.of()));
            }
        }

        // Modality
        if (prefs.getModality() != null && school.getModality() != null) {
            if (prefs.getModality().name().equals(school.getModality().name())) {
                dims.add(new Dim(MatchWeights.MODALITY, 1.0, List.of()));
            } else {
                dims.add(new Dim(MatchWeights.MODALITY, 0.0, List.of()));
            }
        }

        // Enrollment (null school enrollment → dimension skipped / renormalized)
        if (prefs.getEnrollmentType() != null && school.getEnrollmentType() != null) {
            if (prefs.getEnrollmentType().name().equals(school.getEnrollmentType().name())) {
                dims.add(new Dim(MatchWeights.ENROLLMENT, 1.0, List.of()));
            } else {
                dims.add(new Dim(MatchWeights.ENROLLMENT, 0.0, List.of()));
            }
        }

        int weightSum = dims.stream().mapToInt(d -> d.weight).sum();
        ScoreParts parts = new ScoreParts();
        if (weightSum == 0) {
            parts.score = 0;
            return parts;
        }
        double acc = 0;
        for (Dim d : dims) {
            acc += d.raw * d.weight;
            parts.reasons.addAll(d.reasons);
        }
        // Renormalize to 0–100 based on active weights
        parts.score = (acc / weightSum) * 100.0;
        return parts;
    }

    Top5MatchResponse.NextOpenTermSuggestion suggestNextOpenTerm(
            List<ProgramTerm> failedOrOtherTerms, StudentPreference prefs, LocalDate today) {
        boolean intl = Boolean.TRUE.equals(prefs.getIsInternational());
        return failedOrOtherTerms.stream()
                .filter(t -> !Boolean.FALSE.equals(t.getAccepting()))
                .map(t -> {
                    LocalDate dl = intl && t.getInternationalDeadline() != null
                            ? t.getInternationalDeadline()
                            : t.getDomesticDeadline();
                    return new Object[]{t, dl};
                })
                .filter(pair -> {
                    LocalDate dl = (LocalDate) pair[1];
                    return dl == null || !dl.isBefore(today);
                })
                .sorted(Comparator.comparing(pair -> {
                    ProgramTerm t = (ProgramTerm) pair[0];
                    LocalDate dl = (LocalDate) pair[1];
                    // earliest start, then earliest deadline
                    long key = t.getStartYear() * 10L + termOrder(t.getTerm());
                    return key * 1_000_000_000L + (dl != null ? dl.toEpochDay() : Long.MAX_VALUE / 2);
                }))
                .map(pair -> {
                    ProgramTerm t = (ProgramTerm) pair[0];
                    LocalDate dl = (LocalDate) pair[1];
                    School s = t.getSchool();
                    return new Top5MatchResponse.NextOpenTermSuggestion(
                            t.getTerm().name(),
                            t.getStartYear(),
                            s != null ? s.getName() : null,
                            s != null ? s.getProgramName() : null,
                            dl);
                })
                .findFirst()
                .orElse(null);
    }

    private static int termOrder(ProgramTerm.Term term) {
        if (term == null) return 9;
        return switch (term) {
            case WINTER -> 1;
            case SPRING -> 2;
            case SUMMER -> 3;
            case FALL -> 4;
        };
    }

    static boolean programTypesMatch(String pref, String school) {
        return normalizeProgramType(pref).equals(normalizeProgramType(school));
    }

    static String normalizeProgramType(String raw) {
        if (raw == null) return "";
        String s = raw.trim().toLowerCase(Locale.ROOT);
        if (s.contains("data")) return "MS Data Science";
        if (s.contains("software") || s.equals("ms se") || s.equals("se")) return "MS SE";
        if (s.contains("computer engineering") || s.contains("compe") || s.equals("ms compe")) return "MS CompE";
        if (s.contains("computer science") || s.equals("ms cs") || s.equals("cs") || s.equals("csc")) return "MS CS";
        return s;
    }

    private static double costOrMax(School school) {
        if (school.getFullProgramCost() == null) {
            return Double.MAX_VALUE;
        }
        return school.getFullProgramCost().doubleValue();
    }

    private static String nameKey(School school) {
        return (school.getName() == null ? "" : school.getName())
                + " "
                + (school.getProgramName() == null ? "" : school.getProgramName());
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static final class Dim {
        final int weight;
        final double raw;
        final List<String> reasons;

        Dim(int weight, double raw, List<String> reasons) {
            this.weight = weight;
            this.raw = raw;
            this.reasons = reasons;
        }
    }

    static final class ScoreParts {
        double score;
        List<String> reasons = new ArrayList<>();
    }

    private static final class ScoredCandidate {
        final School school;
        final ScoreParts parts;
        final ProgramTerm matchedTerm;
        final LocalDate deadline;
        final String deadlineType;
        final boolean closingSoon;

        ScoredCandidate(School school, ScoreParts parts, ProgramTerm matchedTerm,
                        LocalDate deadline, String deadlineType, boolean closingSoon) {
            this.school = school;
            this.parts = parts;
            this.matchedTerm = matchedTerm;
            this.deadline = deadline;
            this.deadlineType = deadlineType;
            this.closingSoon = closingSoon;
        }
    }

    private static final class DeadlineInfo {
        final LocalDate deadline;
        final String type;

        DeadlineInfo(LocalDate deadline, String type) {
            this.deadline = deadline;
            this.type = type;
        }
    }
}
