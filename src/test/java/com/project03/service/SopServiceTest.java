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

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(worker).post(eq("/internal/programs"), body.capture());
        assertThat(body.getValue()).containsEntry("url", SopAllowlist.CSUF_MS_CS);
        assertThat(body.getValue()).doesNotContainKey("pastedPrompt");
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
