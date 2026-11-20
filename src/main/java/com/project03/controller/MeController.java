package com.project03.controller;

import com.project03.dto.UpdateEmailRequest;
import com.project03.model.User;
import com.project03.repository.UserRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.EmailDeliverability;
import com.project03.service.OAuthUserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

@RestController
public class MeController {

  private static final Pattern BASIC_EMAIL =
      Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

  private final OAuthUserService oauthUserService;
  private final CurrentUserService currentUser;
  private final UserRepository userRepository;

  public MeController(
      OAuthUserService oauthUserService,
      CurrentUserService currentUser,
      UserRepository userRepository) {
    this.oauthUserService = oauthUserService;
    this.currentUser = currentUser;
    this.userRepository = userRepository;
  }

  @GetMapping("/api/me")
  public Map<String, Object> me(@AuthenticationPrincipal OAuth2User oauth2User, Authentication authentication) {
    if (oauth2User == null) {
      return Map.of("authenticated", false);
    }

    String registrationId = null;
    if (authentication instanceof OAuth2AuthenticationToken oauthToken) {
      registrationId = oauthToken.getAuthorizedClientRegistrationId();
    }

    if (registrationId == null || registrationId.isEmpty()) {
      registrationId = oauthUserService.detectProvider(oauth2User);
    }

    User user;
    try {
      user = oauthUserService.getOrCreateUser(oauth2User, registrationId);
    } catch (Exception e) {
      Map<String, Object> attrs = oauth2User.getAttributes();
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("authenticated", true);
      out.put("error", "Failed to create/update user");

      String ghLogin = (String) attrs.get("login");
      String ghAvatar = (String) attrs.get("avatar_url");
      String ghName = (String) attrs.get("name");
      String attrEmail = (String) attrs.get("email");
      String dcUsername = (String) attrs.get("username");
      String dcGlobalName = (String) attrs.get("global_name");
      String dcAvatarHash = (String) attrs.get("avatar");
      Object dcIdObj = attrs.get("id");
      String dcId = dcIdObj != null ? String.valueOf(dcIdObj) : null;
      String dcAvatar = null;
      if (dcId != null && dcAvatarHash != null && !dcAvatarHash.isEmpty()) {
        dcAvatar = "https://cdn.discordapp.com/avatars/" + dcId + "/" + dcAvatarHash + ".png";
      }

      String login =
          ghLogin != null ? ghLogin
          : (attrEmail != null ? attrEmail
          : dcUsername);

      String name =
          ghName != null ? ghName
          : (dcGlobalName != null ? dcGlobalName : dcUsername);

      String avatar =
          ghAvatar != null ? ghAvatar : dcAvatar;

      out.put("login", login);
      out.put("name", name);
      out.put("email", attrEmail);
      out.put("avatar_url", avatar);
      out.put("emailDeliverable", EmailDeliverability.isDeliverable(attrEmail));
      return out;
    }

    Map<String, Object> attrs = oauth2User.getAttributes();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("authenticated", true);
    out.put("userId", user.getId());
    out.put("id", user.getId());

    String ghLogin = (String) attrs.get("login");
    String ghAvatar = (String) attrs.get("avatar_url");
    String ghName = (String) attrs.get("name");
    String attrEmail = (String) attrs.get("email");
    String dcUsername = (String) attrs.get("username");
    String dcGlobalName = (String) attrs.get("global_name");
    String dcAvatarHash = (String) attrs.get("avatar");
    Object dcIdObj = attrs.get("id");
    String dcId = dcIdObj != null ? String.valueOf(dcIdObj) : null;
    String dcAvatar = null;
    if (dcId != null && dcAvatarHash != null && !dcAvatarHash.isEmpty()) {
      dcAvatar = "https://cdn.discordapp.com/avatars/" + dcId + "/" + dcAvatarHash + ".png";
    }

    String login =
        ghLogin != null ? ghLogin
        : (attrEmail != null ? attrEmail
        : (user.getEmail() != null ? user.getEmail() : dcUsername));

    String name =
        user.getName() != null ? user.getName()
        : (ghName != null ? ghName
        : (dcGlobalName != null ? dcGlobalName : dcUsername));

    String email =
        user.getEmail() != null ? user.getEmail() : attrEmail;

    String avatar =
        user.getAvatarUrl() != null ? user.getAvatarUrl()
        : (ghAvatar != null ? ghAvatar : dcAvatar);

    out.put("login", login);
    out.put("name", name);
    out.put("email", email);
    out.put("avatar_url", avatar);
    out.put("provider", registrationId);
    out.put("emailDeliverable", EmailDeliverability.isDeliverable(email));

    return out;
  }

  /**
   * Settings: collect/replace email when OAuth only gave a noreply address.
   * Body: {@code { "email": "you@example.com" }}
   */
  @PatchMapping("/api/me")
  @Transactional
  public ResponseEntity<?> updateEmail(
      Authentication authentication,
      @RequestBody UpdateEmailRequest request) {
    User user = currentUser.require(authentication);

    String raw = request != null ? request.getEmail() : null;
    if (raw == null || raw.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "email is required"));
    }
    String email = raw.trim();
    if (!BASIC_EMAIL.matcher(email).matches()) {
      return ResponseEntity.badRequest().body(Map.of("error", "Enter a valid email address"));
    }
    String skip = EmailDeliverability.skipReason(email);
    if (skip != null) {
      return ResponseEntity.badRequest().body(Map.of(
          "error", "Use a real inbox — noreply addresses cannot receive reminders",
          "reason", skip));
    }

    Optional<User> taken = userRepository.findByEmail(email);
    if (taken.isPresent() && !taken.get().getId().equals(user.getId())) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(Map.of("error", "That email is already in use"));
    }

    user.setEmail(email);
    userRepository.save(user);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("authenticated", true);
    out.put("userId", user.getId());
    out.put("id", user.getId());
    out.put("email", user.getEmail());
    out.put("name", user.getName());
    out.put("avatar_url", user.getAvatarUrl());
    out.put("provider", user.getOauthProvider());
    out.put("emailDeliverable", true);
    return ResponseEntity.ok(out);
  }
}
