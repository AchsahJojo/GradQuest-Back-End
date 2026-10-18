package com.project03.repository;

import com.project03.model.ProgramTerm;
import com.project03.model.School;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProgramTermRepository extends JpaRepository<ProgramTerm, Long> {
    List<ProgramTerm> findBySchool(School school);

    List<ProgramTerm> findBySchoolId(Long schoolId);
}
