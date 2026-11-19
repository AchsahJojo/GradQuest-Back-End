package com.project03.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.project03.dto.StatementDraftRequest;
import com.project03.dto.StatementDraftResponse;
import com.project03.model.School;
import com.project03.model.StatementDraft;
import com.project03.model.User;
import com.project03.repository.SchoolRepository;
import com.project03.repository.StatementDraftRepository;
import com.project03.repository.UserRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.OAuthUserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Optional;

class StatementDraftControllerTest {

    private final StatementDraftRepository draftRepo = mock(StatementDraftRepository.class);
    private final SchoolRepository schoolRepo = mock(SchoolRepository.class);
    private final CurrentUserService currentUser = mock(CurrentUserService.class);
    private final Authentication auth = mock(Authentication.class);
    private final StatementDraftController controller =
            new StatementDraftController(draftRepo, schoolRepo, currentUser);

    @Test
    @DisplayName("GET without a session is 401 through require")
    void getWithoutSessionIsUnauthorized() {
        CurrentUserService realUser = new CurrentUserService(
                mock(UserRepository.class), mock(OAuthUserService.class));
        StatementDraftRepository untouchedDrafts = mock(StatementDraftRepository.class);
        SchoolRepository untouchedSchools = mock(SchoolRepository.class);
        StatementDraftController sessionless =
                new StatementDraftController(untouchedDrafts, untouchedSchools, realUser);

        assertThatThrownBy(() -> sessionless.getDraft(null, 6L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(status.getReason()).isEqualTo("Not signed in");
                });
        verifyNoInteractions(untouchedDrafts, untouchedSchools);
    }

    @Test
    @DisplayName("PUT without a session is 401 through require")
    void putWithoutSessionIsUnauthorized() {
        CurrentUserService realUser = new CurrentUserService(
                mock(UserRepository.class), mock(OAuthUserService.class));
        StatementDraftRepository untouchedDrafts = mock(StatementDraftRepository.class);
        SchoolRepository untouchedSchools = mock(SchoolRepository.class);
        StatementDraftController sessionless =
                new StatementDraftController(untouchedDrafts, untouchedSchools, realUser);

        StatementDraftRequest request = new StatementDraftRequest();
        request.setSchoolId(6L);
        request.setBody("hello");

        assertThatThrownBy(() -> sessionless.upsertDraft(null, request))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
        verifyNoInteractions(untouchedDrafts, untouchedSchools);
    }

    @Test
    @DisplayName("DELETE without a session is 401 through require")
    void deleteWithoutSessionIsUnauthorized() {
        CurrentUserService realUser = new CurrentUserService(
                mock(UserRepository.class), mock(OAuthUserService.class));
        StatementDraftRepository untouchedDrafts = mock(StatementDraftRepository.class);
        SchoolRepository untouchedSchools = mock(SchoolRepository.class);
        StatementDraftController sessionless =
                new StatementDraftController(untouchedDrafts, untouchedSchools, realUser);

        assertThatThrownBy(() -> sessionless.deleteDraft(null, 6L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
        verifyNoInteractions(untouchedDrafts, untouchedSchools);
    }

    @Test
    @DisplayName("GET returns body and updatedAt for the session user's draft")
    void getLoadsDraft() {
        User user = user(4L);
        when(currentUser.require(auth)).thenReturn(user);

        StatementDraft draft = new StatementDraft();
        draft.setBody("saved draft");
        draft.setUpdatedAt(LocalDateTime.of(2026, 11, 19, 12, 0));
        when(draftRepo.findByUserAndSchoolId(user, 6L)).thenReturn(Optional.of(draft));

        ResponseEntity<?> response = controller.getDraft(auth, 6L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        StatementDraftResponse body = (StatementDraftResponse) response.getBody();
        assertThat(body.getBody()).isEqualTo("saved draft");
        assertThat(body.getUpdatedAt()).isEqualTo(LocalDateTime.of(2026, 11, 19, 12, 0));
        verify(draftRepo).findByUserAndSchoolId(user, 6L);
    }

    @Test
    @DisplayName("GET returns 404 when no draft exists")
    void getMissingDraftIsNotFound() {
        User user = user(4L);
        when(currentUser.require(auth)).thenReturn(user);
        when(draftRepo.findByUserAndSchoolId(user, 6L)).thenReturn(Optional.empty());

        ResponseEntity<?> response = controller.getDraft(auth, 6L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("PUT creates a draft when none exists")
    void putCreatesDraft() {
        User user = user(4L);
        School school = school(6L);
        when(currentUser.require(auth)).thenReturn(user);
        when(schoolRepo.findById(6L)).thenReturn(Optional.of(school));
        when(draftRepo.findByUserAndSchoolId(user, 6L)).thenReturn(Optional.empty());
        when(draftRepo.save(any(StatementDraft.class))).thenAnswer(invocation -> {
            StatementDraft saved = invocation.getArgument(0);
            saved.setId(1L);
            saved.setUpdatedAt(LocalDateTime.of(2026, 11, 19, 13, 0));
            return saved;
        });

        StatementDraftRequest request = new StatementDraftRequest();
        request.setSchoolId(6L);
        request.setBody("first save");

        ResponseEntity<?> response = controller.upsertDraft(auth, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        StatementDraftResponse body = (StatementDraftResponse) response.getBody();
        assertThat(body.getBody()).isEqualTo("first save");
        assertThat(body.getUpdatedAt()).isEqualTo(LocalDateTime.of(2026, 11, 19, 13, 0));
        verify(draftRepo).save(any(StatementDraft.class));
    }

    @Test
    @DisplayName("PUT updates an existing draft for the same user and school")
    void putUpdatesExistingDraft() {
        User user = user(4L);
        School school = school(6L);
        when(currentUser.require(auth)).thenReturn(user);
        when(schoolRepo.findById(6L)).thenReturn(Optional.of(school));

        StatementDraft existing = new StatementDraft();
        existing.setId(9L);
        existing.setUser(user);
        existing.setSchool(school);
        existing.setBody("old");
        when(draftRepo.findByUserAndSchoolId(user, 6L)).thenReturn(Optional.of(existing));
        when(draftRepo.save(existing)).thenAnswer(invocation -> {
            StatementDraft saved = invocation.getArgument(0);
            saved.setUpdatedAt(LocalDateTime.of(2026, 11, 19, 14, 0));
            return saved;
        });

        StatementDraftRequest request = new StatementDraftRequest();
        request.setSchoolId(6L);
        request.setBody("revised");

        ResponseEntity<?> response = controller.upsertDraft(auth, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        StatementDraftResponse body = (StatementDraftResponse) response.getBody();
        assertThat(body.getBody()).isEqualTo("revised");
        assertThat(existing.getBody()).isEqualTo("revised");
        verify(draftRepo).save(existing);
    }

    @Test
    @DisplayName("DELETE removes an existing draft")
    void deleteRemovesDraft() {
        User user = user(4L);
        when(currentUser.require(auth)).thenReturn(user);
        when(draftRepo.existsByUserAndSchoolId(user, 6L)).thenReturn(true);

        ResponseEntity<?> response = controller.deleteDraft(auth, 6L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(draftRepo).deleteByUserAndSchoolId(user, 6L);
    }

    @Test
    @DisplayName("DELETE returns 404 when no draft exists")
    void deleteMissingDraftIsNotFound() {
        User user = user(4L);
        when(currentUser.require(auth)).thenReturn(user);
        when(draftRepo.existsByUserAndSchoolId(user, 6L)).thenReturn(false);

        ResponseEntity<?> response = controller.deleteDraft(auth, 6L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(draftRepo, never()).deleteByUserAndSchoolId(any(), any());
    }

    private static User user(Long id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    private static School school(Long id) {
        School school = new School();
        school.setId(id);
        return school;
    }
}
