package com.project03.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Minimal daily scan for deadline−14 notify emails.
 * Prefer Worker cron later; this keeps the due-row path exercisable from Spring.
 */
@Component
public class ReminderNotifyScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderNotifyScheduler.class);

    private final ReminderEmailService emailService;

    public ReminderNotifyScheduler(ReminderEmailService emailService) {
        this.emailService = emailService;
    }

    @Scheduled(cron = "${reminder.notify.cron:0 15 14 * * *}")
    public void flushDueNotifications() {
        int sent = emailService.processDueNotifications();
        if (sent > 0) {
            log.info("Sent {} deadline due-soon reminder email(s)", sent);
        }
    }
}
