package com.project03.service;

import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.ReminderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Persists deadline reminders. Outbound email is intentionally not done here so
 * Worker HTTP cannot hold a Hikari connection across the save transaction.
 */
@Service
public class ReminderService {

    private final ReminderRepository reminderRepo;

    public ReminderService(ReminderRepository reminderRepo) {
        this.reminderRepo = reminderRepo;
    }

    @Transactional(readOnly = true)
    public Optional<Reminder> findExisting(User user, Long schoolId) {
        List<Reminder> existing = reminderRepo.findByUserAndSchoolId(user, schoolId);
        if (existing.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(existing.get(0));
    }

    /**
     * Insert a new deadline reminder row and commit. Callers must send confirm
     * email only after this method returns (transaction committed).
     */
    @Transactional
    public Reminder createDeadlineReminder(User user, School school, ReminderDeadlineResolution resolution) {
        Reminder reminder = new Reminder();
        reminder.setUser(user);
        reminder.setSchool(school);
        reminder.setReminderDate(resolution.deadlineDate());
        reminder.setDeadlineDate(resolution.deadlineDate());
        reminder.setNotifyAt(resolution.notifyAt());
        reminder.setDeadlineIsPlaceholder(resolution.placeholder());
        reminder.setTitle("Application deadline: " + school.getName());
        reminder.setDescription("Submit application for " + school.getName()
                + (school.getProgramName() != null ? " - " + school.getProgramName() : ""));
        reminder.setReminderType(Reminder.ReminderType.DEADLINE);
        reminder.setIsCompleted(false);
        return reminderRepo.save(reminder);
    }
}
