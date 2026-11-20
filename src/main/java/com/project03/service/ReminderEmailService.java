package com.project03.service;

import com.project03.email.EmailSendRequest;
import com.project03.email.EmailSendResult;
import com.project03.email.EmailWorkerClient;
import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.ReminderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Outbound deadline reminder mail: confirm on save, −14 notify, cancel on unsave/complete.
 */
@Service
public class ReminderEmailService {

    public static final String KIND_CONFIRM = "deadline_confirm";
    public static final String KIND_DUE_SOON = "deadline_due_soon";

    private static final Logger log = LoggerFactory.getLogger(ReminderEmailService.class);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("MMM d, yyyy");

    private final ReminderRepository reminderRepo;
    private final EmailWorkerClient emailWorker;
    private final String appBaseUrl;

    public ReminderEmailService(
            ReminderRepository reminderRepo,
            EmailWorkerClient emailWorker,
            @Value("${frontend.base:http://localhost:8081}") String appBaseUrl) {
        this.reminderRepo = reminderRepo;
        this.emailWorker = emailWorker;
        this.appBaseUrl = appBaseUrl == null || appBaseUrl.isBlank()
                ? "http://localhost:8081"
                : stripTrailingSlash(appBaseUrl.trim());
    }

    /**
     * After a new reminder row is saved: send confirmation; if already inside the
     * 14-day window, also send due-soon once (marks notify so cron will not repeat).
     */
    @Transactional
    public Reminder onReminderCreated(Reminder reminder, ReminderDeadlineResolution resolution) {
        if (reminder.getEmailCancelledAt() != null) {
            return reminder;
        }
        User user = reminder.getUser();
        String skip = EmailDeliverability.skipReason(user != null ? user.getEmail() : null);
        if (skip != null) {
            log.info("Skipping confirm email for reminder {}: {}", reminder.getId(), skip);
            return reminder;
        }

        EmailSendResult confirm = emailWorker.send(buildConfirm(reminder, resolution));
        if (confirm.recordedAsSent()) {
            reminder.setConfirmEmailSentAt(LocalDateTime.now());
        } else {
            log.info("Confirm email not recorded for reminder {}: {}", reminder.getId(), confirm.reason());
        }

        LocalDate today = LocalDate.now();
        if (resolution != null
                && !resolution.placeholder()
                && resolution.insideNotifyWindow(today)
                && reminder.getNotifyEmailSentAt() == null) {
            // Same calendar day as notify_at: fire due-soon once with confirm (not a second cron pass).
            EmailSendResult dueSoon = emailWorker.send(buildDueSoon(reminder, resolution));
            if (dueSoon.recordedAsSent()) {
                reminder.setNotifyEmailSentAt(LocalDateTime.now());
            }
        }

        return reminderRepo.save(reminder);
    }

    /** Mark pending outbound mail cancelled before the row is deleted. */
    @Transactional
    public void cancelPending(Reminder reminder) {
        if (reminder.getEmailCancelledAt() == null) {
            reminder.setEmailCancelledAt(LocalDateTime.now());
            reminderRepo.save(reminder);
        }
    }

    @Transactional
    public void cancelPendingAll(List<Reminder> reminders) {
        for (Reminder reminder : reminders) {
            cancelPending(reminder);
        }
    }

    /** Minimal scan: send due-soon for rows whose notify_at is due and not cancelled/sent. */
    @Transactional
    public int processDueNotifications() {
        LocalDate today = LocalDate.now();
        List<Reminder> due = reminderRepo.findDueForNotifyEmail(today);
        int sent = 0;
        for (Reminder reminder : due) {
            if (Boolean.TRUE.equals(reminder.getDeadlineIsPlaceholder())) {
                continue;
            }
            User user = reminder.getUser();
            String skip = EmailDeliverability.skipReason(user != null ? user.getEmail() : null);
            if (skip != null) {
                log.info("Skipping due-soon for reminder {}: {}", reminder.getId(), skip);
                continue;
            }
            ReminderDeadlineResolution resolution = new ReminderDeadlineResolution(
                    reminder.getDeadlineDate() != null ? reminder.getDeadlineDate() : reminder.getReminderDate(),
                    false,
                    null,
                    null);
            EmailSendResult result = emailWorker.send(buildDueSoon(reminder, resolution));
            if (result.recordedAsSent()) {
                reminder.setNotifyEmailSentAt(LocalDateTime.now());
                reminderRepo.save(reminder);
                sent++;
            }
        }
        return sent;
    }

    EmailSendRequest buildConfirm(Reminder reminder, ReminderDeadlineResolution resolution) {
        School school = reminder.getSchool();
        String schoolName = school != null ? school.getName() : "your school";
        String program = school != null && school.getProgramName() != null ? school.getProgramName() : "";
        String term = resolution != null && resolution.termLabel() != null ? resolution.termLabel() : "upcoming term";
        LocalDate deadline = resolution != null ? resolution.deadlineDate() : reminder.getDeadlineDate();
        boolean placeholder = resolution != null && resolution.placeholder();

        String subject = "Deadline saved: " + schoolName + " — " + term;
        StringBuilder body = new StringBuilder();
        body.append("You saved ").append(schoolName);
        if (!program.isBlank()) {
            body.append(" (").append(program).append(")");
        }
        body.append(" in GradQuest.\n\n");
        if (placeholder) {
            body.append("No published application deadline was found for this program, ")
                    .append("so this is a general awareness reminder. ")
                    .append("We used ").append(formatDate(deadline))
                    .append(" as a stand-in date — check the program page for the real deadline.\n\n");
        } else {
            body.append("Current ").append(term).append(" deadline: ")
                    .append(formatDate(deadline)).append(".\n")
                    .append("We'll email you about 2 weeks before to prepare materials.\n\n");
        }
        body.append("Manage in Saved / Settings: ").append(appBaseUrl).append("/reminders\n");

        return new EmailSendRequest(
                reminder.getUser().getEmail(),
                subject,
                body.toString(),
                KIND_CONFIRM,
                reminder.getId(),
                reminder.getUser().getId(),
                school != null ? school.getId() : null);
    }

    EmailSendRequest buildDueSoon(Reminder reminder, ReminderDeadlineResolution resolution) {
        School school = reminder.getSchool();
        String schoolName = school != null ? school.getName() : "your school";
        LocalDate deadline = resolution != null && resolution.deadlineDate() != null
                ? resolution.deadlineDate()
                : reminder.getDeadlineDate();
        String subject = schoolName + " deadline in 2 weeks — " + formatDate(deadline);
        String body = "Heads-up: materials for " + schoolName + " are due around "
                + formatDate(deadline) + ".\n"
                + "Open GradQuest to check your list: " + appBaseUrl + "/reminders\n";
        return new EmailSendRequest(
                reminder.getUser().getEmail(),
                subject,
                body,
                KIND_DUE_SOON,
                reminder.getId(),
                reminder.getUser().getId(),
                school != null ? school.getId() : null);
    }

    private static String formatDate(LocalDate date) {
        return date == null ? "(unknown)" : DATE_FMT.format(date);
    }

    private static String stripTrailingSlash(String value) {
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }
}
