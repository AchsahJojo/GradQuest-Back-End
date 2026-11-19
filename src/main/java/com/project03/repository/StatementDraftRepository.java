package com.project03.repository;

import com.project03.model.StatementDraft;
import com.project03.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StatementDraftRepository extends JpaRepository<StatementDraft, Long> {

    Optional<StatementDraft> findByUserAndSchoolId(User user, Long schoolId);

    boolean existsByUserAndSchoolId(User user, Long schoolId);

    void deleteByUserAndSchoolId(User user, Long schoolId);
}
