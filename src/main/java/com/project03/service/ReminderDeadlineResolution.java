package com.project03.service;

import java.time.LocalDate;

/**
 * Resolved application deadline for a saved school reminder.
 */
public record ReminderDeadlineResolution(
        LocalDate deadlineDate,
        boolean placeholder,
        String termLabel,
        String deadlineType
) {
    public static final int NOTIFY_LEAD_DAYS = 14;

    /** notify_at is only set for real (non-placeholder) deadlines. */
    public LocalDate notifyAt() {
        if (placeholder || deadlineDate == null) {
            return null;
        }
        return deadlineDate.minusDays(NOTIFY_LEAD_DAYS);
    }

    /** True when today is on/after notify_at (already inside the 14-day window). */
    public boolean insideNotifyWindow(LocalDate today) {
        LocalDate at = notifyAt();
        return at != null && !at.isAfter(today);
    }
}
