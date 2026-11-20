package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.project03.model.User;
import com.project03.repository.UserRepository;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

class OAuthUserServiceEmailTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private OAuthUserService service;

    @BeforeEach
    void setUp() {
        service = new OAuthUserService(userRepository);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("GET/login keeps a deliverable Settings email when dev principal differs")
    void keepsPatchedEmailOverDevPrincipal() {
        User existing = new User();
        existing.setId(1L);
        existing.setOauthProvider("dev");
        existing.setOauthProviderId("dev-tester");
        existing.setEmail("achsah.smoke@example.com");
        when(userRepository.findByOauthProviderAndOauthProviderId("dev", "dev-tester"))
                .thenReturn(Optional.of(existing));

        OAuth2User principal = new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                Map.of(
                        "id", "dev-tester",
                        "login", "tester",
                        "name", "Dev tester",
                        "email", "tester@dev.local"),
                "id");

        User result = service.getOrCreateUser(principal, "dev");

        assertThat(result.getEmail()).isEqualTo("achsah.smoke@example.com");
    }

    @Test
    @DisplayName("OAuth may replace a noreply DB email with a deliverable principal email")
    void upgradesNoreplyFromPrincipal() {
        User existing = new User();
        existing.setId(2L);
        existing.setOauthProvider("github");
        existing.setOauthProviderId("99");
        existing.setEmail("login@github.noreply");
        when(userRepository.findByOauthProviderAndOauthProviderId("github", "99"))
                .thenReturn(Optional.of(existing));
        when(userRepository.findByEmail("real@example.com")).thenReturn(Optional.empty());

        OAuth2User principal = new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                Map.of(
                        "id", 99,
                        "login", "login",
                        "name", "Login",
                        "email", "real@example.com"),
                "id");

        User result = service.getOrCreateUser(principal, "github");

        assertThat(result.getEmail()).isEqualTo("real@example.com");
    }
}
