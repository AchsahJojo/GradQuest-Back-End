package com.project03.controller;

import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.StudentPreference;
import com.project03.model.User;
import com.project03.repository.ReminderRepository;
import com.project03.repository.SchoolRepository;
import com.project03.repository.StudentPreferenceRepository;
import com.project03.service.CurrentUserService;
import com.project03.service.ReminderDeadlineResolution;
import com.project03.service.ReminderDeadlineResolver;
import com.project03.service.ReminderEmailService;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Controller for managing deadline reminders for applications
 */
@RestController
@RequestMapping("/api/reminders")
public class ReminderController {

    private static final Logger log = LoggerFactory.getLogger(ReminderController.class);

    private final ReminderRepository reminderRepo;
    private final CurrentUserService currentUser;
    private final SchoolRepository schoolRepo;
    private final StudentPreferenceRepository preferenceRepo;
    private final ReminderDeadlineResolver deadlineResolver;
    private final ReminderEmailService emailService;

    public ReminderController(ReminderRepository reminderRepo,
                             CurrentUserService currentUser,
                             SchoolRepository schoolRepo,
                             StudentPreferenceRepository preferenceRepo,
                             ReminderDeadlineResolver deadlineResolver,
                             ReminderEmailService emailService) {
        this.reminderRepo = reminderRepo;
        this.currentUser = currentUser;
        this.schoolRepo = schoolRepo;
        this.preferenceRepo = preferenceRepo;
        this.deadlineResolver = deadlineResolver;
        this.emailService = emailService;
    }

    /**
     * Create a reminder for a school's application deadline
     *
     * POST /api/reminders?schoolId={schoolId}
     *
     * Saves the school, schedules deadline−14 notify, and attempts confirmation email.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<?> createReminder(Authentication authentication,
                                            @RequestParam Long schoolId) {
        User user = currentUser.require(authentication);
        try {
            School school = schoolRepo.findById(schoolId).orElse(null);
            if (school == null) {
                return ResponseEntity.notFound().build();
            }

            List<Reminder> existing = reminderRepo.findByUserAndSchoolId(user, schoolId);
            if (!existing.isEmpty()) {
                return ResponseEntity.ok(existing.get(0));
            }

            StudentPreference prefs = preferenceRepo.findByUser(user).orElse(null);
            ReminderDeadlineResolution resolution = deadlineResolver.resolve(school, prefs);
            if (resolution == null || resolution.deadlineDate() == null) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "School does not have an application deadline");
                return ResponseEntity.badRequest().body(error);
            }

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

            Reminder savedReminder = reminderRepo.save(reminder);
            savedReminder = emailService.onReminderCreated(savedReminder, resolution);
            return ResponseEntity.ok(savedReminder);
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to create reminder");
            return ResponseEntity.badRequest().body(error);
        }
    }

    /**
     * getting all the reminders for the logged-in student
     *
     * GET /api/reminders
     */
    @GetMapping
    public ResponseEntity<List<Reminder>> getUserReminders(Authentication authentication) {
        User user = currentUser.require(authentication);
        List<Reminder> reminders = reminderRepo.findByUser(user);
        return ResponseEntity.ok(reminders);
    }

    /**
     * get reminders for a specific application incase we need this
     *
     * GET /api/reminders/application/{applicationId}
     */
    @GetMapping("/application/{applicationId}")
    public String getRemindersByApplication(@PathVariable Long applicationId) {
        return "Reminders for application ID: " + applicationId;
    }

    /**
     * get upcoming reminders (ex., within next 2 weeks or less)
     *
     * GET /api/reminders/upcoming
     */
    @GetMapping("/upcoming")
    public String getUpcomingReminders(
            @RequestParam(required = false, defaultValue = "7") Integer days
    ) {
        return "Upcoming reminders for next " + days + " days";
    }

    /**
     * get a specific reminder by ID
     *
     * GET /api/reminders/{reminderId}
     */
    @GetMapping("/{reminderId}")
    public String getReminderById(@PathVariable Long reminderId) {
        return "Reminder details for ID: " + reminderId;
    }

    /**
     * update a reminder
     *
     * PUT /api/reminders/{reminderId}
     */
    @PutMapping("/{reminderId}")
    public String updateReminder(@PathVariable Long reminderId, @RequestBody String reminderData) {
        return "Reminder updated";
    }

    /**
     * delete a reminder by reminder ID
     *
     * DELETE /api/reminders/{reminderId}
     */
    @DeleteMapping("/{reminderId}")
    @Transactional
    public ResponseEntity<?> deleteReminder(@PathVariable Long reminderId, Authentication authentication) {
        User user = currentUser.require(authentication);
        try {
            Reminder reminder = reminderRepo.findByIdAndUser(reminderId, user)
                    .orElse(null);
            if (reminder == null) {
                return ResponseEntity.notFound().build();
            }

            emailService.cancelPending(reminder);
            reminderRepo.delete(reminder);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to delete reminder");
            return ResponseEntity.badRequest().body(error);
        }
    }

    /**
     * Delete reminder by school ID (when user unsaves a school)
     *
     * DELETE /api/reminders/school/{schoolId}
     */
    @DeleteMapping("/school/{schoolId}")
    @Transactional
    public ResponseEntity<?> deleteReminderBySchool(@PathVariable Long schoolId, Authentication authentication) {
        User user = currentUser.require(authentication);
        try {
            List<Reminder> reminders = reminderRepo.findByUserAndSchoolId(user, schoolId);
            if (reminders.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            emailService.cancelPendingAll(reminders);
            reminderRepo.deleteAll(reminders);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to delete reminder");
            return ResponseEntity.badRequest().body(error);
        }
    }

    /**
     * Complete a reminder: cancel pending emails and remove the saved school
     * (same as deleting the reminder).
     *
     * PATCH /api/reminders/{reminderId}/complete
     */
    @PatchMapping("/{reminderId}/complete")
    @Transactional
    public ResponseEntity<?> completeReminder(@PathVariable Long reminderId, Authentication authentication) {
        User user = currentUser.require(authentication);
        try {
            Reminder reminder = reminderRepo.findByIdAndUser(reminderId, user)
                    .orElse(null);
            if (reminder == null) {
                return ResponseEntity.notFound().build();
            }

            emailService.cancelPending(reminder);
            reminderRepo.delete(reminder);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to complete reminder");
            return ResponseEntity.badRequest().body(error);
        }
    }
}
