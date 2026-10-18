package com.project03.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.project03.dto.Top5MatchResponse;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import com.project03.model.User;
import com.project03.repository.ProgramTermRepository;
import com.project03.repository.SchoolRepository;
import com.project03.repository.StudentPreferenceRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.MatchScoringService;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

class SchoolControllerUnitTest {

    private final SchoolRepository repo = mock(SchoolRepository.class);
    private final StudentPreferenceRepository prefRepo = mock(StudentPreferenceRepository.class);
    private final ProgramTermRepository termRepo = mock(ProgramTermRepository.class);
    private final CurrentUserService currentUser = mock(CurrentUserService.class);
    private final MatchScoringService matchScoring = new MatchScoringService();
    private final Authentication auth = mock(Authentication.class);
    private final SchoolController controller =
            new SchoolController(repo, prefRepo, termRepo, currentUser, matchScoring);

    private static School school(String name, String state, School.SchoolType type) {
        School s = new School();
        s.setId(1L);
        s.setName(name);
        s.setState(state);
        s.setType(type);
        s.setProgramType("MS CS");
        return s;
    }

    @Test
    @DisplayName("top5 responds 401 when nobody is signed in")
    void top5_unauthenticated() {
        when(currentUser.require(auth))
            .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> controller.getTop5Schools(auth))
            .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(prefRepo, repo);
    }

    @Test
    @DisplayName("top5 returns 404 when the signed-in user has no saved preferences")
    void top5_noPreferences() {
        User user = new User();
        when(currentUser.require(auth)).thenReturn(user);
        when(prefRepo.findByUser(user)).thenReturn(Optional.empty());

        ResponseEntity<Top5MatchResponse> resp = controller.getTop5Schools(auth);

        assertThat(resp.getStatusCode().value()).isEqualTo(404);
    }

    @Test
    @DisplayName("top5 ranks schools by the signed-in user's own preferences")
    void top5_usesSessionUserPreferences() {
        User user = new User();
        StudentPreference prefs = new StudentPreference();
        prefs.setState("CA");
        prefs.setSchoolType(StudentPreference.SchoolType.PUBLIC);
        prefs.setBudget(50000.0);
        prefs.setSchoolYear("2027");
        prefs.setExpectedGrad("2028");
        prefs.setGrePreferred(true);
        when(currentUser.require(auth)).thenReturn(user);
        when(prefRepo.findByUser(user)).thenReturn(Optional.of(prefs));

        School best = school("Best", "CA", School.SchoolType.PUBLIC);
        best.setId(1L);
        best.setFullProgramCost(java.math.BigDecimal.valueOf(17000));
        School partial = school("Partial", "NY", School.SchoolType.PUBLIC);
        partial.setId(2L);
        partial.setFullProgramCost(java.math.BigDecimal.valueOf(17000));
        when(repo.findAll()).thenReturn(List.of(partial, best));
        when(termRepo.findAll()).thenReturn(List.of());

        Top5MatchResponse result = controller.getTop5Schools(auth).getBody();

        assertThat(result).isNotNull();
        assertThat(result.getMatches()).isNotEmpty();
        assertThat(result.getMatches().get(0).getName()).isEqualTo("Best");
    }
}
