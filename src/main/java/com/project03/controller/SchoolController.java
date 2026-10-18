package com.project03.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import com.project03.dto.Top5MatchResponse;
import com.project03.model.ProgramTerm;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import com.project03.model.User;
import com.project03.repository.ProgramTermRepository;
import com.project03.repository.SchoolRepository;
import com.project03.repository.StudentPreferenceRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.MatchScoringService;
import org.springframework.security.core.Authentication;

import java.util.Map;
import java.math.BigDecimal;
import java.util.List;

/**
 * School catalog and Track A top-N matching.
 */
@RestController
@RequestMapping("/api/schools")
public class SchoolController {

    private final SchoolRepository repo;
    private final StudentPreferenceRepository preferenceRepo;
    private final ProgramTermRepository termRepo;
    private final CurrentUserService currentUser;
    private final MatchScoringService matchScoring;

    public SchoolController(SchoolRepository repo,
                            StudentPreferenceRepository preferenceRepo,
                            ProgramTermRepository termRepo,
                            CurrentUserService currentUser,
                            MatchScoringService matchScoring) {
        this.repo = repo;
        this.preferenceRepo = preferenceRepo;
        this.termRepo = termRepo;
        this.currentUser = currentUser;
        this.matchScoring = matchScoring;
    }

    /**
     * Top matches for the signed-in student's preferences (weighted score, GRE + term filters).
     * GET /api/schools/top5
     */
    @GetMapping("/top5")
    @Transactional(readOnly = true)
    public ResponseEntity<Top5MatchResponse> getTop5Schools(Authentication authentication) {
        User user = currentUser.require(authentication);

        StudentPreference preferences = preferenceRepo.findByUser(user).orElse(null);
        if (preferences == null) {
            return ResponseEntity.notFound().build();
        }

        List<School> allSchools = repo.findAll();
        List<ProgramTerm> allTerms = termRepo.findAll();
        // Ensure term.school is populated for filtering (LAZY)
        for (ProgramTerm t : allTerms) {
            if (t.getSchool() != null) {
                t.getSchool().getId();
            }
        }

        Top5MatchResponse response = matchScoring.rankTopMatches(allSchools, allTerms, preferences, null);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/search")
    public ResponseEntity<List<School>> searchSchools(@RequestBody Map<String, Object> searchCriteria) {
        try {
            String state = searchCriteria.containsKey("state") ? (String) searchCriteria.get("state") : null;
            String schoolTypeStr = searchCriteria.containsKey("schoolType") ? (String) searchCriteria.get("schoolType") : null;
            School.SchoolType schoolType = null;
            if (schoolTypeStr != null) {
                try {
                    schoolType = School.SchoolType.valueOf(schoolTypeStr.toUpperCase());
                } catch (IllegalArgumentException e) {
                    // ignore invalid
                }
            }
            String programType = searchCriteria.containsKey("programType") ? (String) searchCriteria.get("programType") : null;
            BigDecimal maxBudget = null;
            if (searchCriteria.containsKey("budget")) {
                Object budgetObj = searchCriteria.get("budget");
                if (budgetObj instanceof Number) {
                    maxBudget = BigDecimal.valueOf(((Number) budgetObj).doubleValue());
                }
            }

            List<School> schools = repo.findMatchingSchools(state, schoolType, programType, maxBudget);
            return ResponseEntity.ok(schools);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/{schoolId}")
    public ResponseEntity<School> getSchoolById(@PathVariable Long schoolId) {
        return repo.findById(schoolId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping
    public List<School> getAllSchools() {
        return repo.findAll();
    }
}
