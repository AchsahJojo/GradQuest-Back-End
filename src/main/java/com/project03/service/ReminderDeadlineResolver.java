package com.project03.service;

import com.project03.model.ProgramTerm;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import com.project03.repository.ProgramTermRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Resolves application deadlines for reminder emails using {@code is_international}
 * the same way matching does.
 */
@Component
public class ReminderDeadlineResolver {

    private static final Logger log = LoggerFactory.getLogger(ReminderDeadlineResolver.class);

    private final ProgramTermRepository termRepo;

    public ReminderDeadlineResolver(ProgramTermRepository termRepo) {
        this.termRepo = termRepo;
    }

    public ReminderDeadlineResolution resolve(School school, StudentPreference prefs) {
        LocalDate today = LocalDate.now();
        boolean intl = prefs != null && Boolean.TRUE.equals(prefs.getIsInternational());
        List<ProgramTerm> terms = termRepo.findBySchoolId(school.getId());

        TermPick upcoming = terms.stream()
                .filter(t -> !Boolean.FALSE.equals(t.getAccepting()))
                .map(t -> pick(t, intl))
                .filter(p -> p.deadline() != null && !p.deadline().isBefore(today))
                .min(Comparator.comparing(TermPick::deadline))
                .orElse(null);
        if (upcoming != null) {
            return new ReminderDeadlineResolution(
                    upcoming.deadline(), false, upcoming.termLabel(), upcoming.type());
        }

        TermPick any = terms.stream()
                .map(t -> pick(t, intl))
                .filter(p -> p.deadline() != null)
                .max(Comparator.comparing(TermPick::deadline))
                .orElse(null);
        if (any != null) {
            return new ReminderDeadlineResolution(
                    any.deadline(), false, any.termLabel(), any.type());
        }

        String deadlineStr = school.getApplicationDeadline();
        if (deadlineStr != null && !deadlineStr.trim().isEmpty()) {
            try {
                LocalDate legacy = LocalDate.parse(deadlineStr.trim());
                return new ReminderDeadlineResolution(legacy, false, null, "LEGACY");
            } catch (DateTimeParseException e) {
                log.warn("Invalid legacy application_deadline for school {}: {}", school.getId(), deadlineStr);
            }
        }

        // Term rows exist but no published dates — awareness placeholder (today+14).
        if (!terms.isEmpty()) {
            return new ReminderDeadlineResolution(
                    today.plusDays(ReminderDeadlineResolution.NOTIFY_LEAD_DAYS),
                    true,
                    null,
                    "PLACEHOLDER");
        }
        return null;
    }

    private static TermPick pick(ProgramTerm term, boolean intl) {
        if (intl && term.getInternationalDeadline() != null) {
            return new TermPick(term.getInternationalDeadline(), "INTERNATIONAL", label(term));
        }
        return new TermPick(term.getDomesticDeadline(), "DOMESTIC", label(term));
    }

    private static String label(ProgramTerm term) {
        if (term.getTerm() == null || term.getStartYear() == null) {
            return null;
        }
        String season = term.getTerm().name().charAt(0)
                + term.getTerm().name().substring(1).toLowerCase(Locale.ROOT);
        return season + " " + term.getStartYear();
    }

    private record TermPick(LocalDate deadline, String type, String termLabel) {
        TermPick {
            Objects.requireNonNull(type);
        }
    }
}
