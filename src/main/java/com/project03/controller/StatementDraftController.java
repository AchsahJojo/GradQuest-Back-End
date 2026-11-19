package com.project03.controller;

import com.project03.dto.StatementDraftRequest;
import com.project03.dto.StatementDraftResponse;
import com.project03.model.School;
import com.project03.model.StatementDraft;
import com.project03.model.User;
import com.project03.repository.SchoolRepository;
import com.project03.repository.StatementDraftRepository;
import com.project03.service.CurrentUserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * Persist edited statement draft text keyed by session user + schoolId.
 * Clients must never send userId; the session cookie identifies the student.
 */
@RestController
@RequestMapping("/api/statement-drafts")
public class StatementDraftController {

    private static final Logger log = LoggerFactory.getLogger(StatementDraftController.class);

    private final StatementDraftRepository draftRepo;
    private final SchoolRepository schoolRepo;
    private final CurrentUserService currentUser;

    public StatementDraftController(StatementDraftRepository draftRepo,
                                    SchoolRepository schoolRepo,
                                    CurrentUserService currentUser) {
        this.draftRepo = draftRepo;
        this.schoolRepo = schoolRepo;
        this.currentUser = currentUser;
    }

    /**
     * GET /api/statement-drafts?schoolId=
     * Returns { body, updatedAt } or 404 when no draft exists.
     */
    @GetMapping
    public ResponseEntity<?> getDraft(Authentication authentication,
                                      @RequestParam Long schoolId) {
        User user = currentUser.require(authentication);
        return draftRepo.findByUserAndSchoolId(user, schoolId)
                .map(draft -> ResponseEntity.ok(toResponse(draft)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * PUT /api/statement-drafts  { schoolId, body }
     * Upserts the draft for the session user and school.
     */
    @PutMapping
    @Transactional
    public ResponseEntity<?> upsertDraft(Authentication authentication,
                                         @RequestBody StatementDraftRequest request) {
        User user = currentUser.require(authentication);
        try {
            if (request == null || request.getSchoolId() == null) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "schoolId is required");
                return ResponseEntity.badRequest().body(error);
            }
            if (request.getBody() == null) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "body is required");
                return ResponseEntity.badRequest().body(error);
            }

            School school = schoolRepo.findById(request.getSchoolId()).orElse(null);
            if (school == null) {
                return ResponseEntity.notFound().build();
            }

            StatementDraft draft = draftRepo.findByUserAndSchoolId(user, request.getSchoolId())
                    .orElseGet(() -> {
                        StatementDraft created = new StatementDraft();
                        created.setUser(user);
                        created.setSchool(school);
                        return created;
                    });
            draft.setBody(request.getBody());
            StatementDraft saved = draftRepo.save(draft);
            return ResponseEntity.ok(toResponse(saved));
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to save statement draft");
            return ResponseEntity.badRequest().body(error);
        }
    }

    /**
     * DELETE /api/statement-drafts?schoolId=
     */
    @DeleteMapping
    @Transactional
    public ResponseEntity<?> deleteDraft(Authentication authentication,
                                         @RequestParam Long schoolId) {
        User user = currentUser.require(authentication);
        try {
            if (!draftRepo.existsByUserAndSchoolId(user, schoolId)) {
                return ResponseEntity.notFound().build();
            }
            draftRepo.deleteByUserAndSchoolId(user, schoolId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to delete statement draft");
            return ResponseEntity.badRequest().body(error);
        }
    }

    private static StatementDraftResponse toResponse(StatementDraft draft) {
        return new StatementDraftResponse(draft.getBody(), draft.getUpdatedAt());
    }
}
