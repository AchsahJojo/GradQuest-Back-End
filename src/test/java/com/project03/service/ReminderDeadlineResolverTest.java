package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.project03.model.ProgramTerm;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import com.project03.repository.ProgramTermRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReminderDeadlineResolverTest {

    private final ProgramTermRepository termRepo = mock(ProgramTermRepository.class);
    private final ReminderDeadlineResolver resolver = new ReminderDeadlineResolver(termRepo);

    @Test
    @DisplayName("international students use international_deadline when present")
    void prefersInternationalDeadline() {
        School school = school(1L);
        ProgramTerm term = term(ProgramTerm.Term.FALL, 2027,
                LocalDate.of(2027, 1, 15), LocalDate.of(2026, 12, 15));
        when(termRepo.findBySchoolId(1L)).thenReturn(List.of(term));

        StudentPreference prefs = new StudentPreference();
        prefs.setIsInternational(true);

        ReminderDeadlineResolution resolution = resolver.resolve(school, prefs);

        assertThat(resolution.deadlineDate()).isEqualTo(LocalDate.of(2026, 12, 15));
        assertThat(resolution.deadlineType()).isEqualTo("INTERNATIONAL");
        assertThat(resolution.placeholder()).isFalse();
        assertThat(resolution.notifyAt()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(resolution.termLabel()).isEqualTo("Fall 2027");
    }

    @Test
    @DisplayName("domestic path uses domestic_deadline")
    void prefersDomesticDeadline() {
        School school = school(2L);
        ProgramTerm term = term(ProgramTerm.Term.SPRING, 2027,
                LocalDate.of(2027, 2, 1), LocalDate.of(2026, 12, 1));
        when(termRepo.findBySchoolId(2L)).thenReturn(List.of(term));

        ReminderDeadlineResolution resolution = resolver.resolve(school, null);

        assertThat(resolution.deadlineDate()).isEqualTo(LocalDate.of(2027, 2, 1));
        assertThat(resolution.deadlineType()).isEqualTo("DOMESTIC");
        assertThat(resolution.termLabel()).isEqualTo("Spring 2027");
    }

    @Test
    @DisplayName("missing published dates yield placeholder today+14 with no notify_at")
    void placeholderWhenNoDates() {
        School school = school(3L);
        ProgramTerm term = term(ProgramTerm.Term.FALL, 2027, null, null);
        when(termRepo.findBySchoolId(3L)).thenReturn(List.of(term));

        ReminderDeadlineResolution resolution = resolver.resolve(school, null);

        assertThat(resolution.placeholder()).isTrue();
        assertThat(resolution.deadlineDate()).isEqualTo(LocalDate.now().plusDays(14));
        assertThat(resolution.notifyAt()).isNull();
        assertThat(resolution.deadlineType()).isEqualTo("PLACEHOLDER");
    }

    private static School school(long id) {
        School school = new School("Test U", School.SchoolType.PUBLIC, "CA", "MS CS");
        school.setId(id);
        return school;
    }

    private static ProgramTerm term(ProgramTerm.Term season, int year,
                                    LocalDate domestic, LocalDate intl) {
        ProgramTerm term = new ProgramTerm();
        term.setTerm(season);
        term.setStartYear(year);
        term.setAccepting(true);
        term.setDomesticDeadline(domestic);
        term.setInternationalDeadline(intl);
        return term;
    }
}
