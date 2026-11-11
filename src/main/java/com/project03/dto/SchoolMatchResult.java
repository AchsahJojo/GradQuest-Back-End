package com.project03.dto;

import com.project03.model.ProgramTerm;
import com.project03.model.School;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Top-N match payload for the dashboard (rank 1 = closest among returned results).
 */
public class SchoolMatchResult {

    private int rank;
    private double matchScore;
    private List<String> matchReasons = new ArrayList<>();

    private Long id;
    private String name;
    private String programName;
    private String programType;
    private String state;
    private String city;
    private String websiteUrl;
    private String programPageUrl;
    private LocalDate lastVerified;
    private BigDecimal fullProgramCost;
    private Double minGpa;
    private String grePolicy;
    private Boolean sopRequired;

    private ProgramTerm.Term term;
    private Integer startYear;
    private LocalDate deadline;
    private String deadlineType; // INTERNATIONAL | DOMESTIC
    private boolean closingSoon;

    public static SchoolMatchResult from(School school, int rank, double score, List<String> reasons,
                                         ProgramTerm matchedTerm, LocalDate deadline, String deadlineType,
                                         boolean closingSoon) {
        SchoolMatchResult r = new SchoolMatchResult();
        r.rank = rank;
        r.matchScore = score;
        r.matchReasons = reasons != null ? new ArrayList<>(reasons) : new ArrayList<>();
        r.id = school.getId();
        r.name = school.getName();
        r.programName = school.getProgramName();
        r.programType = school.getProgramType();
        r.state = school.getState();
        r.city = school.getCity();
        r.websiteUrl = school.getWebsiteUrl();
        r.programPageUrl = school.getProgramPageUrl() != null ? school.getProgramPageUrl() : school.getWebsiteUrl();
        r.lastVerified = school.getLastVerified();
        r.fullProgramCost = school.getFullProgramCost();
        r.minGpa = school.getMinGpa();
        r.grePolicy = school.getGrePolicy() != null ? school.getGrePolicy().name() : null;
        r.sopRequired = school.getSopRequired();
        if (matchedTerm != null) {
            r.term = matchedTerm.getTerm();
            r.startYear = matchedTerm.getStartYear();
        }
        r.deadline = deadline;
        r.deadlineType = deadlineType;
        r.closingSoon = closingSoon;
        return r;
    }

    public int getRank() {
        return rank;
    }

    public double getMatchScore() {
        return matchScore;
    }

    public List<String> getMatchReasons() {
        return matchReasons;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getProgramName() {
        return programName;
    }

    public String getProgramType() {
        return programType;
    }

    public String getState() {
        return state;
    }

    public String getCity() {
        return city;
    }

    public String getWebsiteUrl() {
        return websiteUrl;
    }

    public String getProgramPageUrl() {
        return programPageUrl;
    }

    public LocalDate getLastVerified() {
        return lastVerified;
    }

    public BigDecimal getFullProgramCost() {
        return fullProgramCost;
    }

    public Double getMinGpa() {
        return minGpa;
    }

    public String getGrePolicy() {
        return grePolicy;
    }

    public Boolean getSopRequired() {
        return sopRequired;
    }

    public ProgramTerm.Term getTerm() {
        return term;
    }

    public Integer getStartYear() {
        return startYear;
    }

    public LocalDate getDeadline() {
        return deadline;
    }

    public String getDeadlineType() {
        return deadlineType;
    }

    public boolean isClosingSoon() {
        return closingSoon;
    }
}
