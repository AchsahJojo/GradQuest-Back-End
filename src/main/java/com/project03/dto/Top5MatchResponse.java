package com.project03.dto;

import java.util.ArrayList;
import java.util.List;

public class Top5MatchResponse {

    private List<SchoolMatchResult> matches = new ArrayList<>();
    private String message;
    private NextOpenTermSuggestion nextOpenTerm;

    public List<SchoolMatchResult> getMatches() {
        return matches;
    }

    public void setMatches(List<SchoolMatchResult> matches) {
        this.matches = matches;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public NextOpenTermSuggestion getNextOpenTerm() {
        return nextOpenTerm;
    }

    public void setNextOpenTerm(NextOpenTermSuggestion nextOpenTerm) {
        this.nextOpenTerm = nextOpenTerm;
    }

    public static class NextOpenTermSuggestion {
        private String term;
        private Integer startYear;
        private String schoolName;
        private String programName;
        private java.time.LocalDate deadline;

        public NextOpenTermSuggestion(String term, Integer startYear, String schoolName,
                                      String programName, java.time.LocalDate deadline) {
            this.term = term;
            this.startYear = startYear;
            this.schoolName = schoolName;
            this.programName = programName;
            this.deadline = deadline;
        }

        public String getTerm() {
            return term;
        }

        public Integer getStartYear() {
            return startYear;
        }

        public String getSchoolName() {
            return schoolName;
        }

        public String getProgramName() {
            return programName;
        }

        public java.time.LocalDate getDeadline() {
            return deadline;
        }
    }
}
