package com.project03.controller;

import com.project03.dto.SopDraftRequest;
import com.project03.dto.SopDraftResponse;
import com.project03.dto.SopProgramResponse;
import com.project03.dto.SopResumeResponse;
import com.project03.dto.SopResumeTextRequest;
import com.project03.model.User;
import com.project03.service.CurrentUserService;
import com.project03.service.SopService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * Session-authenticated proxy. schoolId is resolved to an allowlisted URL on the server.
 */
@RestController
@RequestMapping("/api/sop")
public class SopController {

    private final CurrentUserService currentUser;
    private final SopService sop;

    public SopController(CurrentUserService currentUser, SopService sop) {
        this.currentUser = currentUser;
        this.sop = sop;
    }

    @PostMapping("/programs")
    public ResponseEntity<SopProgramResponse> programs(
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        User user = currentUser.require(authentication);
        return ResponseEntity.ok(sop.inspect(user, schoolId(body)));
    }

    @PostMapping(value = "/resume", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SopResumeResponse> resumeText(
            @RequestBody SopResumeTextRequest body,
            Authentication authentication) {
        User user = currentUser.require(authentication);
        if (body.getSchoolId() == null) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(sop.storeResumeText(user, body.getSchoolId(), body.getText()));
    }

    @PostMapping(value = "/resume", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SopResumeResponse> resumeFile(
            @RequestParam("schoolId") long schoolId,
            @RequestParam("file") MultipartFile file,
            Authentication authentication) {
        User user = currentUser.require(authentication);
        return ResponseEntity.ok(sop.storeResumeFile(user, schoolId, file));
    }

    @PostMapping("/draft")
    public ResponseEntity<SopDraftResponse> draft(
            @RequestBody SopDraftRequest body,
            Authentication authentication) {
        User user = currentUser.require(authentication);
        return ResponseEntity.ok(sop.draft(user, body));
    }

    private static long schoolId(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("schoolId");
        if (raw instanceof Number number) {
            return number.longValue();
        }
        if (raw instanceof String text && !text.isBlank()) {
            return Long.parseLong(text.trim());
        }
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST, "schoolId is required");
    }
}
