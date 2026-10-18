package com.project03.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.project03.dto.SopDraftRequest;
import com.project03.dto.SopDraftResponse;
import com.project03.dto.SopProgramResponse;
import com.project03.dto.SopResumeResponse;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.SchoolRepository;
import com.project03.sop.SopAllowlist;
import com.project03.sop.SopWorkerClient;
import com.project03.sop.SopWorkerException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class SopService {

    static final int MAX_RESUME_BYTES = 5 * 1024 * 1024;
    static final int MAX_PASTED_PROMPT = 2000;
    static final int MAX_RESUME_TEXT = 50_000;

    private final SchoolRepository schools;
    private final SopWorkerClient worker;

    public SopService(SchoolRepository schools, SopWorkerClient worker) {
        this.schools = schools;
        this.worker = worker;
    }

    public SopProgramResponse inspect(User user, long schoolId) {
        School school = requireSchool(schoolId);
        SopProgramResponse response = base(school);
        if (!response.isAllowlisted()) {
            response.setPageStatus("not_allowlisted");
            response.setMessage("This program page is not in the public allowlist, so nothing was fetched.");
            return response;
        }
        try {
            JsonNode node = worker.post("/internal/programs", identity(user, school));
            response.setPageStatus(text(node, "pageStatus", "error"));
            response.setMessage(text(node, "message", ""));
        } catch (SopWorkerException e) {
            response.setPageStatus("unavailable");
            response.setMessage("The program page could not be read right now.");
        }
        return response;
    }

    public SopResumeResponse storeResume(User user, long schoolId, byte[] bytes, String filename, String mediaType) {
        requireSchool(schoolId);
        if (bytes == null || bytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Upload a resume");
        }
        if (bytes.length > MAX_RESUME_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Resume must be 5 MB or smaller");
        }
        Map<String, Object> body = new HashMap<>();
        body.put("userId", String.valueOf(user.getId()));
        body.put("schoolId", schoolId);
        body.put("filename", filename == null || filename.isBlank() ? "resume" : filename);
        body.put("mediaType", mediaType == null ? "application/octet-stream" : mediaType);
        body.put("bytesBase64", Base64.getEncoder().encodeToString(bytes));
        JsonNode node = worker.post("/internal/resume", body);
        SopResumeResponse response = new SopResumeResponse();
        response.setStored(node.path("stored").asBoolean(false));
        response.setChunks(node.path("chunks").asInt(0));
        return response;
    }

    public SopResumeResponse storeResumeText(User user, long schoolId, String text) {
        requireSchool(schoolId);
        String cleaned = text == null ? "" : text.trim();
        if (cleaned.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Paste resume text");
        }
        if (cleaned.length() > MAX_RESUME_TEXT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Resume text is too long");
        }
        Map<String, Object> body = new HashMap<>();
        body.put("userId", String.valueOf(user.getId()));
        body.put("schoolId", schoolId);
        body.put("filename", "resume.txt");
        body.put("mediaType", "text/plain");
        body.put("text", cleaned);
        JsonNode node = worker.post("/internal/resume", body);
        SopResumeResponse response = new SopResumeResponse();
        response.setStored(node.path("stored").asBoolean(false));
        response.setChunks(node.path("chunks").asInt(0));
        return response;
    }

    public SopResumeResponse storeResumeFile(User user, long schoolId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Upload a resume");
        }
        String name = file.getOriginalFilename() == null ? "resume" : file.getOriginalFilename();
        try {
            return storeResume(user, schoolId, file.getBytes(), name, file.getContentType());
        } catch (ResponseStatusException | SopWorkerException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read that file");
        }
    }

    public SopDraftResponse draft(User user, SopDraftRequest request) {
        if (request == null || request.getSchoolId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "schoolId is required");
        }
        School school = requireSchool(request.getSchoolId());
        String mode = request.getMode();
        if (mode == null || mode.isBlank()) {
            mode = Boolean.FALSE.equals(school.getSopRequired()) ? "motivation" : "opening";
        }
        if (!mode.equals("opening") && !mode.equals("motivation")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mode must be opening or motivation");
        }
        String pasted = request.getPastedPrompt() == null ? "" : request.getPastedPrompt().trim();
        if (pasted.length() > MAX_PASTED_PROMPT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pasted prompt is too long");
        }

        Map<String, Object> body = identity(user, school);
        body.put("mode", mode);
        body.put("pastedPrompt", pasted);
        body.put("sopRequired", school.getSopRequired());
        JsonNode node = worker.post("/internal/draft", body);

        SopDraftResponse response = new SopDraftResponse();
        response.setParagraph(text(node, "paragraph", ""));
        response.setLabel(SopDraftResponse.LABEL);
        response.setSopRequired(school.getSopRequired());
        response.setPageStatus(text(node, "pageStatus", SopAllowlist.contains(school.getProgramPageUrl()) ? "ok" : "not_allowlisted"));
        node.path("citations").forEach(item -> response.getCitations().add(item.asText()));
        return response;
    }

    private School requireSchool(long schoolId) {
        return schools.findById(schoolId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "School not found"));
    }

    private SopProgramResponse base(School school) {
        SopProgramResponse response = new SopProgramResponse();
        response.setSchoolId(school.getId());
        response.setSchoolName(school.getName());
        response.setProgramName(school.getProgramName());
        response.setSopRequired(school.getSopRequired());
        String url = school.getProgramPageUrl() != null ? school.getProgramPageUrl() : school.getWebsiteUrl();
        response.setAllowlisted(SopAllowlist.contains(url));
        return response;
    }

    /**
     * URL comes from the school row. Callers cannot supply one.
     */
    private Map<String, Object> identity(User user, School school) {
        Map<String, Object> body = new HashMap<>();
        body.put("userId", String.valueOf(user.getId()));
        body.put("schoolId", school.getId());
        body.put("schoolName", school.getName());
        body.put("programName", school.getProgramName());
        String url = school.getProgramPageUrl() != null ? school.getProgramPageUrl() : school.getWebsiteUrl();
        if (SopAllowlist.contains(url)) {
            body.put("url", url);
        }
        return body;
    }

    private static String text(JsonNode node, String field, String fallback) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? fallback : value.asText(fallback);
    }
}
