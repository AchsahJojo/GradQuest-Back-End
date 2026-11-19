package com.project03.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.project03.model.School;
import com.project03.model.StatementDraft;
import com.project03.model.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

@ActiveProfiles("test")
@DataJpaTest
class StatementDraftRepositoryIntegrationTest {

    @Autowired
    private StatementDraftRepository draftRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SchoolRepository schoolRepository;

    @Test
    @DisplayName("Upsert by user+school, load, and delete")
    void upsertLoadDelete() {
        User user = new User();
        user.setEmail("draft-tester@example.com");
        user.setName("Draft Tester");
        user.setOauthProvider("dev");
        user.setOauthProviderId("draft-tester");
        user = userRepository.save(user);

        School school = new School();
        school.setName("Test U");
        school.setType(School.SchoolType.PUBLIC);
        school.setState("CA");
        school = schoolRepository.save(school);

        StatementDraft draft = new StatementDraft();
        draft.setUser(user);
        draft.setSchool(school);
        draft.setBody("first");
        StatementDraft saved = draftRepository.save(draft);
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();

        Optional<StatementDraft> found = draftRepository.findByUserAndSchoolId(user, school.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getBody()).isEqualTo("first");

        StatementDraft existing = found.get();
        existing.setBody("second");
        draftRepository.save(existing);

        Optional<StatementDraft> updated = draftRepository.findByUserAndSchoolId(user, school.getId());
        assertThat(updated).isPresent();
        assertThat(updated.get().getBody()).isEqualTo("second");
        assertThat(draftRepository.count()).isEqualTo(1);

        assertThat(draftRepository.existsByUserAndSchoolId(user, school.getId())).isTrue();
        draftRepository.deleteByUserAndSchoolId(user, school.getId());
        assertThat(draftRepository.findByUserAndSchoolId(user, school.getId())).isEmpty();
        assertThat(draftRepository.count()).isEqualTo(0);
    }
}
