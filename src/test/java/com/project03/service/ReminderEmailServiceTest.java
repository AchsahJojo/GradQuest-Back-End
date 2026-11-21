package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project03.email.EmailSendRequest;
import com.project03.email.EmailSendResult;
import com.project03.email.EmailWorkerClient;
import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.ReminderRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ReminderEmailServiceTest {

    private final ReminderRepository reminderRepo = mock(ReminderRepository.class);
    private final EmailWorkerClient emailWorker = mock(EmailWorkerClient.class);
    private ReminderEmailService service;

    @BeforeEach
    void setUp() {
        service = new ReminderEmailService(reminderRepo, emailWorker, "http://localhost:8081");
        when(reminderRepo.save(any(Reminder.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("save with deliverable email stubs confirm and schedules notify_at")
    void confirmOnSave() {
        Reminder reminder = reminder("achsah@example.com", LocalDate.now().plusDays(40), false);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                reminder.getDeadlineDate(), false, "Fall 2027", "DOMESTIC");
        when(emailWorker.send(any())).thenReturn(EmailSendResult.stubbed("worker_not_configured"));

        Reminder saved = service.onReminderCreated(reminder, resolution);

        assertThat(saved.getConfirmEmailSentAt()).isNotNull();
        assertThat(saved.getNotifyEmailSentAt()).isNull();
        ArgumentCaptor<EmailSendRequest> captor = ArgumentCaptor.forClass(EmailSendRequest.class);
        verify(emailWorker, times(1)).send(captor.capture());
        assertThat(captor.getValue().kind()).isEqualTo(ReminderEmailService.KIND_CONFIRM);
        assertThat(captor.getValue().subject()).contains("Deadline saved");
        assertThat(captor.getValue().textBody()).contains("We'll email you about 2 weeks before");
    }

    @Test
    @DisplayName("inside 14-day window sends confirm and due-soon once")
    void insideWindowSendsDueSoonOnce() {
        LocalDate deadline = LocalDate.now().plusDays(7);
        Reminder reminder = reminder("achsah@example.com", deadline, false);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                deadline, false, "Fall 2027", "DOMESTIC");
        when(emailWorker.send(any())).thenReturn(EmailSendResult.stubbed("worker_not_configured"));

        Reminder saved = service.onReminderCreated(reminder, resolution);

        assertThat(saved.getConfirmEmailSentAt()).isNotNull();
        assertThat(saved.getNotifyEmailSentAt()).isNotNull();
        ArgumentCaptor<EmailSendRequest> captor = ArgumentCaptor.forClass(EmailSendRequest.class);
        verify(emailWorker, times(2)).send(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(EmailSendRequest::kind)
                .containsExactly(
                        ReminderEmailService.KIND_CONFIRM,
                        ReminderEmailService.KIND_DUE_SOON);
    }

    @Test
    @DisplayName("noreply addresses skip send with a clear reason path")
    void noreplySkipsSend() {
        Reminder reminder = reminder("login@github.noreply", LocalDate.now().plusDays(30), false);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                reminder.getDeadlineDate(), false, "Fall 2027", "DOMESTIC");

        Reminder saved = service.onReminderCreated(reminder, resolution);

        assertThat(saved.getConfirmEmailSentAt()).isNull();
        verify(emailWorker, never()).send(any());
        verify(reminderRepo, never()).save(any());
    }

    @Test
    @DisplayName("worker failure leaves reminder unstamped and does not throw")
    void workerFailureDoesNotStamp() {
        Reminder reminder = reminder("achsah@example.com", LocalDate.now().plusDays(40), false);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                reminder.getDeadlineDate(), false, "Fall 2027", "DOMESTIC");
        when(emailWorker.send(any())).thenReturn(EmailSendResult.skipped("worker_error"));

        Reminder saved = service.onReminderCreated(reminder, resolution);

        assertThat(saved.getConfirmEmailSentAt()).isNull();
        assertThat(saved.getNotifyEmailSentAt()).isNull();
        verify(emailWorker, times(1)).send(any());
        verify(reminderRepo, never()).save(any());
    }

    @Test
    @DisplayName("placeholder deadline confirm uses awareness copy and no due-soon")
    void placeholderAwarenessCopy() {
        LocalDate standIn = LocalDate.now().plusDays(14);
        Reminder reminder = reminder("achsah@example.com", standIn, true);
        ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                standIn, true, null, "PLACEHOLDER");
        when(emailWorker.send(any())).thenReturn(EmailSendResult.stubbed("worker_not_configured"));

        Reminder saved = service.onReminderCreated(reminder, resolution);

        assertThat(saved.getConfirmEmailSentAt()).isNotNull();
        assertThat(saved.getNotifyEmailSentAt()).isNull();
        ArgumentCaptor<EmailSendRequest> captor = ArgumentCaptor.forClass(EmailSendRequest.class);
        verify(emailWorker, times(1)).send(captor.capture());
        assertThat(captor.getValue().textBody()).contains("No published application deadline");
    }

    @Test
    @DisplayName("unsave cancel stamps email_cancelled_at")
    void cancelOnUnsave() {
        Reminder reminder = reminder("achsah@example.com", LocalDate.now().plusDays(30), false);

        service.cancelPending(reminder);

        assertThat(reminder.getEmailCancelledAt()).isNotNull();
        verify(reminderRepo).save(reminder);
    }

    @Test
    @DisplayName("cron due scan skips cancelled and already-sent rows via repository query")
    void processDueUsesRepo() {
        when(reminderRepo.findDueForNotifyEmail(any())).thenReturn(List.of());
        assertThat(service.processDueNotifications()).isZero();
        verify(reminderRepo).findDueForNotifyEmail(LocalDate.now());
    }

    private static Reminder reminder(String email, LocalDate deadline, boolean placeholder) {
        User user = new User();
        user.setId(9L);
        user.setEmail(email);
        School school = new School("UC San Diego", School.SchoolType.PUBLIC, "CA", "MS CS");
        school.setId(42L);
        Reminder reminder = new Reminder(user, school, deadline,
                "Application deadline: UC San Diego", Reminder.ReminderType.DEADLINE);
        reminder.setId(100L);
        reminder.setDeadlineDate(deadline);
        reminder.setDeadlineIsPlaceholder(placeholder);
        reminder.setNotifyAt(placeholder ? null : deadline.minusDays(14));
        return reminder;
    }
}
