package com.project03.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.project03.dto.SopOverlapResponse;
import com.project03.dto.SopResumeDeleteResponse;
import com.project03.model.User;
import com.project03.repository.UserRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.OAuthUserService;
import com.project03.service.SopService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

class SopControllerTest {

    private final SopService sop = mock(SopService.class);
    private final CurrentUserService currentUser = mock(CurrentUserService.class);
    private final Authentication auth = mock(Authentication.class);
    private final SopController controller = new SopController(currentUser, sop);

    @Test
    @DisplayName("overlap without a session is 401 through require")
    void overlapWithoutSessionIsUnauthorized() {
        CurrentUserService realUser = new CurrentUserService(
                mock(UserRepository.class), mock(OAuthUserService.class));
        SopService untouched = mock(SopService.class);
        SopController sessionless = new SopController(realUser, untouched);

        assertThatThrownBy(() -> sessionless.overlap(Map.of("schoolId", 6), null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(status.getReason()).isEqualTo("Not signed in");
                });
        verifyNoInteractions(untouched);
    }

    @Test
    @DisplayName("a signed-in overlap call forwards the session user and school id")
    void overlapForwardsSessionUser() {
        User user = new User();
        user.setId(4L);
        when(currentUser.require(auth)).thenReturn(user);
        SopOverlapResponse report = new SopOverlapResponse();
        when(sop.overlap(user, 6L)).thenReturn(report);

        Map<String, Object> body = new HashMap<>();
        body.put("schoolId", 6);
        body.put("url", "https://evil.example/not-the-catalog");

        ResponseEntity<SopOverlapResponse> response = controller.overlap(body, auth);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isSameAs(report);
        verify(currentUser).require(auth);
        verify(sop).overlap(user, 6L);
    }

    @Test
    @DisplayName("delete résumé without a session is 401 through require")
    void deleteResumeWithoutSessionIsUnauthorized() {
        CurrentUserService realUser = new CurrentUserService(
                mock(UserRepository.class), mock(OAuthUserService.class));
        SopService untouched = mock(SopService.class);
        SopController sessionless = new SopController(realUser, untouched);

        assertThatThrownBy(() -> sessionless.deleteResume(null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException status = (ResponseStatusException) error;
                    assertThat(status.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(status.getReason()).isEqualTo("Not signed in");
                });
        verifyNoInteractions(untouched);
    }

    @Test
    @DisplayName("a signed-in delete résumé call forwards the session user")
    void deleteResumeForwardsSessionUser() {
        User user = new User();
        user.setId(4L);
        when(currentUser.require(auth)).thenReturn(user);
        SopResumeDeleteResponse body = new SopResumeDeleteResponse();
        body.setDeleted(true);
        when(sop.deleteResume(user)).thenReturn(body);

        ResponseEntity<SopResumeDeleteResponse> response = controller.deleteResume(auth);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isSameAs(body);
        verify(sop).deleteResume(user);
    }
}
