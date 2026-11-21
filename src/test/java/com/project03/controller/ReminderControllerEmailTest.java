package com.project03.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.ReminderRepository;
import com.project03.repository.SchoolRepository;
import com.project03.repository.StudentPreferenceRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.ReminderDeadlineResolution;
import com.project03.service.ReminderDeadlineResolver;
import com.project03.service.ReminderEmailService;
import com.project03.service.ReminderService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class ReminderControllerEmailTest {

    private final ReminderRepository reminderRepo = mock(ReminderRepository.class);
    private final CurrentUserService currentUser = mock(CurrentUserService.class);
    private final SchoolRepository schoolRepo = mock(SchoolRepository.class);
    private final StudentPreferenceRepository preferenceRepo = mock(StudentPreferenceRepository.class);
    private final ReminderDeadlineResolver deadlineResolver = mock(ReminderDeadlineResolver.class);
    private final ReminderService reminderService = mock(ReminderService.class);
    private final ReminderEmailService emailService = mock(ReminderEmailService.class);

    private ReminderController controller;
    private User user;
    private UsernamePasswordAuthenticationToken auth;

    @BeforeEach
    void setUp() {
        controller = new ReminderController(
                reminderRepo, currentUser, schoolRepo, preferenceRepo,
                deadlineResolver, reminderService, emailService);
        user = new User();
        user.setId(1L);
        user.setEmail("tester@dev.local");
        auth = new UsernamePasswordAuthenticationToken("tester", "n/a");
        when(currentUser.require(auth)).thenReturn(user);
    }

    @Test
    @DisplayName("POST save creates reminder then triggers confirm email after commit")
    void createSchedulesAndConfirms() {
        School school = school(5L);
        LocalDate deadline = LocalDate.now().plusDays(30);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                deadline, false, "Fall 2027", "DOMESTIC");
        Reminder saved = new Reminder();
        saved.setId(77L);
        saved.setDeadlineDate(deadline);
        saved.setNotifyAt(deadline.minusDays(14));
        saved.setDeadlineIsPlaceholder(false);

        when(schoolRepo.findById(5L)).thenReturn(Optional.of(school));
        when(reminderService.findExisting(user, 5L)).thenReturn(Optional.empty());
        when(preferenceRepo.findByUser(user)).thenReturn(Optional.empty());
        when(deadlineResolver.resolve(school, null)).thenReturn(resolution);
        when(reminderService.createDeadlineReminder(user, school, resolution)).thenReturn(saved);
        when(emailService.onReminderCreated(saved, resolution)).thenReturn(saved);

        ResponseEntity<?> response = controller.createReminder(auth, 5L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Reminder body = (Reminder) response.getBody();
        assertThat(body.getDeadlineDate()).isEqualTo(deadline);
        assertThat(body.getNotifyAt()).isEqualTo(deadline.minusDays(14));
        assertThat(body.getDeadlineIsPlaceholder()).isFalse();
        verify(reminderService).createDeadlineReminder(user, school, resolution);
        verify(emailService).onReminderCreated(saved, resolution);
    }

    @Test
    @DisplayName("POST save still returns OK when confirm email throws after commit")
    void createSurvivesEmailFailure() {
        School school = school(5L);
        LocalDate deadline = LocalDate.now().plusDays(30);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                deadline, false, "Fall 2027", "DOMESTIC");
        Reminder saved = new Reminder();
        saved.setId(88L);
        saved.setDeadlineDate(deadline);
        saved.setNotifyAt(deadline.minusDays(14));
        saved.setDeadlineIsPlaceholder(false);

        when(schoolRepo.findById(5L)).thenReturn(Optional.of(school));
        when(reminderService.findExisting(user, 5L)).thenReturn(Optional.empty());
        when(preferenceRepo.findByUser(user)).thenReturn(Optional.empty());
        when(deadlineResolver.resolve(school, null)).thenReturn(resolution);
        when(reminderService.createDeadlineReminder(user, school, resolution)).thenReturn(saved);
        when(emailService.onReminderCreated(saved, resolution))
                .thenThrow(new RuntimeException("worker unavailable"));

        ResponseEntity<?> response = controller.createReminder(auth, 5L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Reminder body = (Reminder) response.getBody();
        assertThat(body.getId()).isEqualTo(88L);
        assertThat(body.getNeedsEmail()).isFalse();
        verify(reminderService).createDeadlineReminder(user, school, resolution);
        verify(emailService).onReminderCreated(saved, resolution);
        verify(reminderRepo, never()).delete(any());
    }

    @Test
    @DisplayName("DELETE unsave cancels pending email then deletes")
    void unsaveCancels() {
        Reminder reminder = new Reminder();
        reminder.setId(3L);
        when(reminderRepo.findByUserAndSchoolId(user, 8L)).thenReturn(List.of(reminder));

        ResponseEntity<?> response = controller.deleteReminderBySchool(8L, auth);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(emailService).cancelPendingAll(List.of(reminder));
        verify(reminderRepo).deleteAll(List.of(reminder));
    }

    @Test
    @DisplayName("PATCH complete cancels emails and deletes the saved school reminder")
    void completeDeletes() {
        Reminder reminder = new Reminder();
        reminder.setId(4L);
        when(reminderRepo.findByIdAndUser(4L, user)).thenReturn(Optional.of(reminder));

        ResponseEntity<?> response = controller.completeReminder(4L, auth);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(emailService).cancelPending(reminder);
        verify(reminderRepo).delete(reminder);
        verify(reminderRepo, never()).save(any());
    }

    private static School school(long id) {
        School school = new School("Test", School.SchoolType.PUBLIC, "CA", "MS");
        school.setId(id);
        return school;
    }
}
