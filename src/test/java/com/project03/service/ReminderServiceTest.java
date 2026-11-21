package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.ReminderRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReminderServiceTest {

    private final ReminderRepository reminderRepo = mock(ReminderRepository.class);
    private ReminderService service;

    @BeforeEach
    void setUp() {
        service = new ReminderService(reminderRepo);
        when(reminderRepo.save(any(Reminder.class))).thenAnswer(inv -> {
            Reminder r = inv.getArgument(0);
            r.setId(42L);
            return r;
        });
    }

    @Test
    @DisplayName("createDeadlineReminder persists deadline fields without email side effects")
    void createPersistsOnly() {
        User user = new User();
        user.setId(1L);
        School school = new School("Test U", School.SchoolType.PUBLIC, "CA", "MS");
        school.setId(9L);
        LocalDate deadline = LocalDate.now().plusDays(21);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                deadline, false, "Fall 2027", "DOMESTIC");

        Reminder saved = service.createDeadlineReminder(user, school, resolution);

        assertThat(saved.getId()).isEqualTo(42L);
        assertThat(saved.getDeadlineDate()).isEqualTo(deadline);
        assertThat(saved.getNotifyAt()).isEqualTo(deadline.minusDays(14));
        assertThat(saved.getConfirmEmailSentAt()).isNull();
        verify(reminderRepo).save(any(Reminder.class));
    }

    @Test
    @DisplayName("findExisting returns first reminder for user+school")
    void findExisting() {
        User user = new User();
        Reminder reminder = new Reminder();
        reminder.setId(3L);
        when(reminderRepo.findByUserAndSchoolId(user, 7L)).thenReturn(List.of(reminder));

        Optional<Reminder> found = service.findExisting(user, 7L);

        assertThat(found).contains(reminder);
    }
}
