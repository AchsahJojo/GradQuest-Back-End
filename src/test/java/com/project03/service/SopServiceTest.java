package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.project03.dto.SopDraftRequest;
import com.project03.dto.SopDraftResponse;
import com.project03.dto.SopOverlapResponse;
import com.project03.dto.SopProgramResponse;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.SchoolRepository;
import com.project03.sop.SopAllowlist;
import com.project03.sop.SopWorkerClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

class SopServiceTest {

    private final SchoolRepository schools = mock(SchoolRepository.class);
    private final SopWorkerClient worker = mock(SopWorkerClient.class);
    private final SopService service = new SopService(schools, worker);
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    @DisplayName("a school outside the allowlist is not fetched")
    void inspectSkipsUnlistedPage() throws Exception {
        School school = school(1L, "https://example.edu/ms", null);
        when(schools.findById(1L)).thenReturn(Optional.of(school));

        SopProgramResponse response = service.inspect(user(), 1L);

        assertThat(response.isAllowlisted()).isFalse();
        assertThat(response.getPageStatus()).isEqualTo("not_allowlisted");
        verify(worker, never()).post(any(), any());
    }

    @Test
    @DisplayName("schoolId resolves to the catalog URL, not a caller-supplied address")
    void inspectUsesStoredUrl() throws Exception {
        School school = school(6L, SopAllowlist.CSUF_MS_CS, false);
        when(schools.findById(6L)).thenReturn(Optional.of(school));
        when(worker.post(eq("/internal/programs"), any())).thenReturn(mapper.readTree("""
                {"pageStatus":"ok","message":"Read the public page"}
                """));

        SopProgramResponse response = service.inspect(user(), 6L);

        assertThat(response.isAllowlisted()).isTrue();
        assertThat(response.getSopRequired()).isFalse();
        assertThat(response.getPageStatus()).isEqualTo("ok");
        assertThat(response.getSource()).isNull();
        assertThat(response.getVerifiedAsOf()).isNull();
        assertThat(response.getFactCounts()).isNull();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(worker).post(eq("/internal/programs"), body.capture());
        assertThat(body.getValue()).containsEntry("url", SopAllowlist.CSUF_MS_CS);
        assertThat(body.getValue()).doesNotContainKey("pastedPrompt");
    }

    @Test
    @DisplayName("worker snapshot fields land on the program response")
    void inspectCopiesSnapshotFields() throws Exception {
        School school = school(6L, SopAllowlist.CSUF_MS_CS, true);
        when(schools.findById(6L)).thenReturn(Optional.of(school));
        when(worker.post(eq("/internal/programs"), any())).thenReturn(mapper.readTree("""
                {"pageStatus":"ok","message":"Read the public page","source":"snapshot","verifiedAsOf":"2026-03-01T00:00:00Z","factCounts":{"overview":1,"requirement":0,"course":2,"faculty":0,"deadline":0}}
                """));

        SopProgramResponse response = service.inspect(user(), 6L);

        assertThat(response.getSource()).isEqualTo("snapshot");
        assertThat(response.getVerifiedAsOf()).isEqualTo("2026-03-01T00:00:00Z");
        assertThat(response.getFactCounts())
                .containsEntry("overview", 1)
                .containsEntry("requirement", 0)
                .containsEntry("course", 2)
                .containsEntry("faculty", 0)
                .containsEntry("deadline", 0);
    }

    @Test
    @DisplayName("draft asks for one opening and keeps the outline label")
    void draftForwardsModeWithoutAUrlOverride() throws Exception {
        School school = school(22L, SopAllowlist.UCSD_CSE_MS, true);
        when(schools.findById(22L)).thenReturn(Optional.of(school));
        when(worker.post(eq("/internal/draft"), any())).thenReturn(mapper.readTree("""
                {"paragraph":"I studied compilers [R1].","citations":["R1"],"pageStatus":"ok"}
                """));

        SopDraftRequest request = new SopDraftRequest();
        request.setSchoolId(22L);
        request.setMode("opening");
        request.setPastedPrompt("Describe a project.");

        SopDraftResponse response = service.draft(user(), request);

        assertThat(response.getLabel()).isEqualTo("Draft outline — edit before you use it");
        assertThat(response.getParagraph()).contains("[R1]");
        assertThat(response.getCitations()).containsExactly("R1");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(worker).post(eq("/internal/draft"), body.capture());
        assertThat(body.getValue()).containsEntry("url", SopAllowlist.UCSD_CSE_MS);
        assertThat(body.getValue()).containsEntry("mode", "opening");
        assertThat(body.getValue()).containsEntry("pastedPrompt", "Describe a project.");
    }

    @Test
    @DisplayName("overlap skips a school outside the allowlist")
    void overlapSkipsUnlistedPage() {
        School school = school(1L, "https://example.edu/ms", null);
        when(schools.findById(1L)).thenReturn(Optional.of(school));

        SopOverlapResponse response = service.overlap(user(), 1L);

        assertThat(response.isWeak()).isTrue();
        assertThat(response.getPairs()).isEmpty();
        assertThat(response.getUnmatchedKinds()).containsExactly("faculty", "course");
        assertThat(response.getVerifiedAsOf()).isNull();
        verify(worker, never()).post(any(), any());
    }

    @Test
    @DisplayName("overlap forwards the session user and catalog school, not a caller URL")
    void overlapForwardsCatalogSchool() throws Exception {
        School school = school(6L, SopAllowlist.CSUF_MS_CS, true);
        when(schools.findById(6L)).thenReturn(Optional.of(school));
        when(worker.post(eq("/internal/overlap"), any())).thenReturn(mapper.readTree("""
                {"pairs":[{"pairId":"0:faculty-ada","resumeText":"I studied distributed systems in a lab.","factKind":"faculty","factName":"Ada Lovelace","factDetail":"Studies formal methods.","sourceUrl":"https://catalog.calpoly.edu/faculty/ada","reason":"Both discuss formal methods."}],"weak":false,"unmatchedKinds":["course"],"verifiedAsOf":"2026-03-01T00:00:00Z"}
                """));

        SopOverlapResponse response = service.overlap(user(), 6L);

        assertThat(response.isWeak()).isFalse();
        assertThat(response.getVerifiedAsOf()).isEqualTo("2026-03-01T00:00:00Z");
        assertThat(response.getUnmatchedKinds()).containsExactly("course");
        assertThat(response.getPairs()).hasSize(1);
        assertThat(response.getPairs().get(0).getPairId()).isEqualTo("0:faculty-ada");
        assertThat(response.getPairs().get(0).getFactName()).isEqualTo("Ada Lovelace");
        assertThat(response.getPairs().get(0).getResumeText()).isEqualTo("I studied distributed systems in a lab.");
        assertThat(response.getPairs().get(0).getSourceUrl()).isEqualTo("https://catalog.calpoly.edu/faculty/ada");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(worker).post(eq("/internal/overlap"), body.capture());
        assertThat(body.getValue()).containsEntry("userId", "4");
        assertThat(body.getValue()).containsEntry("schoolId", 6L);
        assertThat(body.getValue()).containsEntry("url", SopAllowlist.CSUF_MS_CS);
        assertThat(body.getValue()).doesNotContainValue("https://evil.example/not-the-catalog");
    }

    @Test
    @DisplayName("draft sends pair ids only when the list is present")
    void draftForwardsPairIdsWhenPresent() throws Exception {
        School school = school(22L, SopAllowlist.UCSD_CSE_MS, true);
        when(schools.findById(22L)).thenReturn(Optional.of(school));
        when(worker.post(eq("/internal/draft"), any())).thenReturn(mapper.readTree("""
                {"paragraph":"I studied compilers [R1].","citations":["R1"],"pageStatus":"ok"}
                """));

        SopDraftRequest withoutPairs = new SopDraftRequest();
        withoutPairs.setSchoolId(22L);
        withoutPairs.setMode("opening");
        service.draft(user(), withoutPairs);

        SopDraftRequest withPairs = new SopDraftRequest();
        withPairs.setSchoolId(22L);
        withPairs.setMode("opening");
        withPairs.setPairIds(List.of("0:faculty-ada", "1:course-compilers"));
        SopDraftResponse response = service.draft(user(), withPairs);

        assertThat(response.getParagraph()).isEqualTo("I studied compilers [R1].");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(worker, org.mockito.Mockito.times(2)).post(eq("/internal/draft"), body.capture());
        assertThat(body.getAllValues().get(0)).doesNotContainKey("pairIds");
        assertThat(body.getAllValues().get(1)).containsEntry("pairIds", List.of("0:faculty-ada", "1:course-compilers"));
    }

    @Test
    @DisplayName("missing school is a 404")
    void missingSchool() {
        when(schools.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.inspect(user(), 99L))
                .isInstanceOf(ResponseStatusException.class);
    }

    private static User user() {
        User user = new User();
        user.setId(4L);
        return user;
    }

    private static School school(long id, String url, Boolean sopRequired) {
        School school = new School();
        school.setId(id);
        school.setName("Test University");
        school.setProgramName("Computer Science, M.S.");
        school.setProgramPageUrl(url);
        school.setSopRequired(sopRequired);
        return school;
    }
}
