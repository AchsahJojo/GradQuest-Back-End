package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.project03.dto.Top5MatchResponse;
import com.project03.model.ProgramTerm;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

class MatchScoringServiceTest {

    private final MatchScoringService service = new MatchScoringService();
    private final LocalDate today = LocalDate.of(2026, 10, 17);

    private static School school(long id, String name, String state, String programType,
                                 Double minGpa, School.GrePolicy gre, double cost) {
        School s = new School();
        s.setId(id);
        s.setName(name);
        s.setState(state);
        s.setType(School.SchoolType.PUBLIC);
        s.setProgramName(name + " MS");
        s.setProgramType(programType);
        s.setMinGpa(minGpa);
        s.setGrePolicy(gre);
        s.setFullProgramCost(BigDecimal.valueOf(cost));
        s.setModality(School.Modality.IN_PERSON);
        s.setEnrollmentType(School.EnrollmentType.FULL_TIME);
        return s;
    }

    private static ProgramTerm term(School school, ProgramTerm.Term t, int year,
                                    Boolean accepting, LocalDate domestic, LocalDate intl) {
        ProgramTerm pt = new ProgramTerm();
        pt.setSchool(school);
        pt.setTerm(t);
        pt.setStartYear(year);
        pt.setAccepting(accepting);
        pt.setDomesticDeadline(domestic);
        pt.setInternationalDeadline(intl);
        return pt;
    }

    private static StudentPreference prefs() {
        StudentPreference p = new StudentPreference();
        p.setBudget(20000.0);
        p.setState("CA");
        p.setProgramType("Computer Science");
        p.setGpa(3.2);
        p.setModality(StudentPreference.Modality.IN_PERSON);
        p.setEnrollmentType(StudentPreference.EnrollmentType.FULL_TIME);
        p.setGrePreferred(false);
        p.setSchoolType(StudentPreference.SchoolType.PUBLIC);
        p.setSchoolYear("2027");
        p.setExpectedGrad("2028");
        return p;
    }

    @Test
    @DisplayName("meets GPA scores 1.0 on GPA dimension; below GPA keeps school with warning")
    void gpaMeetAndBelow() {
        School meet = school(1, "Meet", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 17000);
        School below = school(2, "Below", "CA", "MS CS", 3.5, School.GrePolicy.NOT_REQUIRED, 17000);
        StudentPreference p = prefs();

        Top5MatchResponse resp = service.rankTopMatches(List.of(meet, below), List.of(), p, today);

        assertThat(resp.getMatches()).hasSize(2);
        assertThat(resp.getMatches().get(0).getName()).isEqualTo("Meet");
        assertThat(resp.getMatches().get(1).getMatchReasons())
                .anyMatch(r -> r.contains("GPA below"));
    }

    @Test
    @DisplayName("null school or student GPA drops GPA weight (renormalize)")
    void nullGpaRenormalizes() {
        School noMin = school(1, "NoMin", "CA", "MS CS", null, School.GrePolicy.NOT_REQUIRED, 17000);
        StudentPreference p = prefs();
        p.setGpa(null);

        Top5MatchResponse resp = service.rankTopMatches(List.of(noMin), List.of(), p, today);
        assertThat(resp.getMatches()).hasSize(1);
        assertThat(resp.getMatches().get(0).getMatchScore()).isGreaterThan(0);
    }

    @Test
    @DisplayName("budget falloff: under=1, 25% over≈0.5, 50%+ over=0")
    void budgetFalloff() {
        StudentPreference p = prefs();
        p.setBudget(10000.0);

        School under = school(1, "Under", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 10000);
        School mid = school(2, "Mid", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 12500);
        School over = school(3, "Over", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 16000);

        // Isolate budget by clearing other prefs that would also score
        p.setState(null);
        p.setProgramType(null);
        p.setGpa(null);
        p.setModality(null);
        p.setEnrollmentType(null);

        Top5MatchResponse resp = service.rankTopMatches(List.of(under, mid, over), List.of(), p, today);
        assertThat(resp.getMatches().get(0).getName()).isEqualTo("Under");
        assertThat(resp.getMatches().get(0).getMatchScore()).isEqualTo(100.0);
        assertThat(resp.getMatches().get(1).getName()).isEqualTo("Mid");
        assertThat(resp.getMatches().get(1).getMatchScore()).isEqualTo(50.0);
        assertThat(resp.getMatches().get(2).getName()).isEqualTo("Over");
        assertThat(resp.getMatches().get(2).getMatchScore()).isEqualTo(0.0);
    }

    @Test
    @DisplayName("GRE off hard-filters REQUIRED schools; GRE on keeps them")
    void greFilter() {
        School req = school(1, "Req", "CA", "MS CS", 3.0, School.GrePolicy.REQUIRED, 17000);
        School ok = school(2, "Ok", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 17000);
        StudentPreference p = prefs();
        p.setGrePreferred(false);

        Top5MatchResponse filtered = service.rankTopMatches(List.of(req, ok), List.of(), p, today);
        assertThat(filtered.getMatches()).extracting(m -> m.getName()).containsExactly("Ok");

        p.setGrePreferred(true);
        Top5MatchResponse open = service.rankTopMatches(List.of(req, ok), List.of(), p, today);
        assertThat(open.getMatches()).extracting(m -> m.getName()).containsExactlyInAnyOrder("Req", "Ok");
    }

    @Test
    @DisplayName("term filter: only selected term/year; accepting=false and past deadline excluded")
    void termFilter() {
        School s = school(1, "CSUF", "CA", "MS CS", 2.5, School.GrePolicy.NOT_REQUIRED, 17000);
        ProgramTerm spring = term(s, ProgramTerm.Term.SPRING, 2027, true,
                LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 1));
        ProgramTerm closed = term(s, ProgramTerm.Term.FALL, 2027, false,
                LocalDate.of(2027, 5, 1), null);
        ProgramTerm past = term(s, ProgramTerm.Term.SUMMER, 2027, true,
                LocalDate.of(2026, 1, 1), null);

        StudentPreference p = prefs();
        p.setDesiredTerm(ProgramTerm.Term.SPRING);
        p.setDesiredStartYear(2027);

        Top5MatchResponse resp = service.rankTopMatches(List.of(s), List.of(spring, closed, past), p, today);
        assertThat(resp.getMatches()).hasSize(1);
        assertThat(resp.getMatches().get(0).getTerm()).isEqualTo(ProgramTerm.Term.SPRING);
        assertThat(resp.getMatches().get(0).getStartYear()).isEqualTo(2027);
    }

    @Test
    @DisplayName("international uses international_deadline; falls back to domestic if null")
    void internationalDeadline() {
        School s = school(1, "Chico", "CA", "MS CS", 2.5, School.GrePolicy.NOT_REQUIRED, 17000);
        ProgramTerm spring = term(s, ProgramTerm.Term.SPRING, 2027, true,
                LocalDate.of(2026, 12, 1), LocalDate.of(2026, 11, 1));
        StudentPreference p = prefs();
        p.setDesiredTerm(ProgramTerm.Term.SPRING);
        p.setDesiredStartYear(2027);
        p.setIsInternational(true);

        Top5MatchResponse resp = service.rankTopMatches(List.of(s), List.of(spring), p, today);
        assertThat(resp.getMatches().get(0).getDeadline()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(resp.getMatches().get(0).getDeadlineType()).isEqualTo("INTERNATIONAL");

        spring.setInternationalDeadline(null);
        Top5MatchResponse fallback = service.rankTopMatches(List.of(s), List.of(spring), p, today);
        assertThat(fallback.getMatches().get(0).getDeadline()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(fallback.getMatches().get(0).getDeadlineType()).isEqualTo("DOMESTIC");
    }

    @Test
    @DisplayName("null deadline kept with warning; closingSoon true within 30 days")
    void nullDeadlineAndClosingSoon() {
        School s = school(1, "Open", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 17000);
        ProgramTerm noDl = term(s, ProgramTerm.Term.FALL, 2027, true, null, null);
        StudentPreference p = prefs();
        p.setDesiredTerm(ProgramTerm.Term.FALL);
        p.setDesiredStartYear(2027);

        Top5MatchResponse resp = service.rankTopMatches(List.of(s), List.of(noDl), p, today);
        assertThat(resp.getMatches()).hasSize(1);
        assertThat(resp.getMatches().get(0).getMatchReasons())
                .anyMatch(r -> r.contains("Deadline not published"));

        ProgramTerm soon = term(s, ProgramTerm.Term.FALL, 2027, true,
                today.plusDays(10), null);
        Top5MatchResponse soonResp = service.rankTopMatches(List.of(s), List.of(soon), p, today);
        assertThat(soonResp.getMatches().get(0).isClosingSoon()).isTrue();
    }

    @Test
    @DisplayName("no desired term → no term filtering")
    void noDesiredTerm() {
        School s = school(1, "Any", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 17000);
        StudentPreference p = prefs();
        p.setDesiredTerm(null);
        p.setDesiredStartYear(null);

        Top5MatchResponse resp = service.rankTopMatches(List.of(s), List.of(), p, today);
        assertThat(resp.getMatches()).hasSize(1);
        assertThat(resp.getMatches().get(0).getTerm()).isNull();
    }

    @Test
    @DisplayName("nextOpenTerm returned when results < 5 under term filter")
    void nextOpenTerm() {
        School a = school(1, "A", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 17000);
        School b = school(2, "B", "CA", "MS CS", 3.0, School.GrePolicy.NOT_REQUIRED, 17000);
        ProgramTerm aSpring = term(a, ProgramTerm.Term.SPRING, 2027, true,
                LocalDate.of(2026, 12, 1), null);
        ProgramTerm bFall = term(b, ProgramTerm.Term.FALL, 2027, true,
                LocalDate.of(2027, 5, 1), null);

        StudentPreference p = prefs();
        p.setDesiredTerm(ProgramTerm.Term.SPRING);
        p.setDesiredStartYear(2027);

        Top5MatchResponse resp = service.rankTopMatches(List.of(a, b), List.of(aSpring, bFall), p, today);
        assertThat(resp.getMatches()).hasSize(1);
        assertThat(resp.getNextOpenTerm()).isNotNull();
        assertThat(resp.getNextOpenTerm().getTerm()).isEqualTo("FALL");
        assertThat(resp.getNextOpenTerm().getStartYear()).isEqualTo(2027);
    }

    @Test
    @DisplayName("Computer Science intake label matches MS CS catalog code")
    void programTypeNormalize() {
        assertThat(MatchScoringService.programTypesMatch("Computer Science", "MS CS")).isTrue();
        assertThat(MatchScoringService.programTypesMatch("Software Engineering", "MS SE")).isTrue();
    }
}
