package com.project03.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(
    name = "program_terms",
    uniqueConstraints = @UniqueConstraint(columnNames = {"school_id", "term", "start_year"})
)
public class ProgramTerm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "school_id", nullable = false)
    @JsonIgnore
    private School school;

    @Column(nullable = false, length = 10)
    @Enumerated(EnumType.STRING)
    private Term term;

    @Column(name = "start_year", nullable = false)
    private Integer startYear;

    @Column(name = "app_open_date")
    private LocalDate appOpenDate;

    @Column(name = "domestic_deadline")
    private LocalDate domesticDeadline;

    @Column(name = "international_deadline")
    private LocalDate internationalDeadline;

    @Column(name = "docs_deadline")
    private LocalDate docsDeadline;

    /** false = program explicitly does not admit this term; null = unknown (still eligible). */
    @Column
    private Boolean accepting;

    @Column(name = "source_url", columnDefinition = "TEXT")
    private String sourceUrl;

    @Column(name = "last_verified")
    private LocalDate lastVerified;

    public ProgramTerm() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public School getSchool() {
        return school;
    }

    public void setSchool(School school) {
        this.school = school;
    }

    public Term getTerm() {
        return term;
    }

    public void setTerm(Term term) {
        this.term = term;
    }

    public Integer getStartYear() {
        return startYear;
    }

    public void setStartYear(Integer startYear) {
        this.startYear = startYear;
    }

    public LocalDate getAppOpenDate() {
        return appOpenDate;
    }

    public void setAppOpenDate(LocalDate appOpenDate) {
        this.appOpenDate = appOpenDate;
    }

    public LocalDate getDomesticDeadline() {
        return domesticDeadline;
    }

    public void setDomesticDeadline(LocalDate domesticDeadline) {
        this.domesticDeadline = domesticDeadline;
    }

    public LocalDate getInternationalDeadline() {
        return internationalDeadline;
    }

    public void setInternationalDeadline(LocalDate internationalDeadline) {
        this.internationalDeadline = internationalDeadline;
    }

    public LocalDate getDocsDeadline() {
        return docsDeadline;
    }

    public void setDocsDeadline(LocalDate docsDeadline) {
        this.docsDeadline = docsDeadline;
    }

    public Boolean getAccepting() {
        return accepting;
    }

    public void setAccepting(Boolean accepting) {
        this.accepting = accepting;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public LocalDate getLastVerified() {
        return lastVerified;
    }

    public void setLastVerified(LocalDate lastVerified) {
        this.lastVerified = lastVerified;
    }

    public enum Term {
        FALL,
        SPRING,
        SUMMER,
        WINTER
    }
}
