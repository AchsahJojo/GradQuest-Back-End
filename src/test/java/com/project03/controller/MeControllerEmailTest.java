package com.project03.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project03.dto.UpdateEmailRequest;
import com.project03.model.User;
import com.project03.repository.UserRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.OAuthUserService;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class MeControllerEmailTest {

    private final OAuthUserService oauthUserService = mock(OAuthUserService.class);
    private final CurrentUserService currentUser = mock(CurrentUserService.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private MeController controller;
    private User user;
    private UsernamePasswordAuthenticationToken auth;

    @BeforeEach
    void setUp() {
        controller = new MeController(oauthUserService, currentUser, userRepository);
        user = new User();
        user.setId(1L);
        user.setEmail("login@github.noreply");
        user.setName("Tester");
        user.setOauthProvider("github");
        auth = new UsernamePasswordAuthenticationToken("tester", "n/a");
        when(currentUser.require(auth)).thenReturn(user);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("PATCH /api/me saves a deliverable email")
    void patchSavesEmail() {
        UpdateEmailRequest body = new UpdateEmailRequest();
        body.setEmail("achsah@example.com");
        when(userRepository.findByEmail("achsah@example.com")).thenReturn(Optional.empty());

        ResponseEntity<?> response = controller.updateEmail(auth, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> json = (Map<String, Object>) response.getBody();
        assertThat(json.get("email")).isEqualTo("achsah@example.com");
        assertThat(json.get("emailDeliverable")).isEqualTo(true);
        assertThat(user.getEmail()).isEqualTo("achsah@example.com");
        verify(userRepository).save(user);
    }

    @Test
    @DisplayName("PATCH /api/me rejects noreply addresses")
    void patchRejectsNoreply() {
        UpdateEmailRequest body = new UpdateEmailRequest();
        body.setEmail("me@discord.noreply");

        ResponseEntity<?> response = controller.updateEmail(auth, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(user.getEmail()).isEqualTo("login@github.noreply");
    }

    @Test
    @DisplayName("PATCH /api/me conflicts when email belongs to another user")
    void patchConflict() {
        UpdateEmailRequest body = new UpdateEmailRequest();
        body.setEmail("taken@example.com");
        User other = new User();
        other.setId(99L);
        other.setEmail("taken@example.com");
        when(userRepository.findByEmail("taken@example.com")).thenReturn(Optional.of(other));

        ResponseEntity<?> response = controller.updateEmail(auth, body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
}
