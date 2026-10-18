package com.project03.controller;

import com.project03.model.ProgramTerm;
import com.project03.model.Reminder;
import com.project03.model.School;
import com.project03.model.User;
import com.project03.repository.ProgramTermRepository;
import com.project03.repository.ReminderRepository;
import com.project03.repository.SchoolRepository;
import com.project03.service.CurrentUserService;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

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
    private final ProgramTermRepository termRepo;

    public ReminderController(ReminderRepository reminderRepo,
                             CurrentUserService currentUser,
                             SchoolRepository schoolRepo,
                             ProgramTermRepository termRepo) {
        this.reminderRepo = reminderRepo;
        this.currentUser = currentUser;
        this.schoolRepo = schoolRepo;
        this.termRepo = termRepo;
    }

    /**
     * Create a reminder for a school's application deadline
     * 
     * POST /api/reminders?schoolId={schoolId}
     * 
     * Creates a reminder 1 week before the school's application deadline
     */
    @PostMapping
    @Transactional
    public ResponseEntity<?> createReminder(Authentication authentication,
                                            @RequestParam Long schoolId) {
        User user = currentUser.require(authentication);
        try {

            // Get school
            School school = schoolRepo.findById(schoolId).orElse(null);
            if (school == null) {
                return ResponseEntity.notFound().build();
            }

            // Check if reminder already exists for this user and school
            List<Reminder> existing = reminderRepo.findByUserAndSchoolId(user, schoolId);
            if (!existing.isEmpty()) {
                // Return existing reminder instead of creating duplicate
                return ResponseEntity.ok(existing.get(0));
            }

            // Track A: deadlines live on program_terms; legacy application_deadline is often null.
            LocalDate reminderDate = resolveReminderDate(school);
            if (reminderDate == null) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "School does not have an application deadline");
                return ResponseEntity.badRequest().body(error);
            }

            // Create reminder
            Reminder reminder = new Reminder();
            reminder.setUser(user);
            reminder.setSchool(school);
            reminder.setReminderDate(reminderDate);
            reminder.setTitle("Application deadline: " + school.getName());
            reminder.setDescription("Submit application for " + school.getName() + 
                                   (school.getProgramName() != null ? " - " + school.getProgramName() : ""));
            reminder.setReminderType(Reminder.ReminderType.DEADLINE);
            reminder.setIsCompleted(false);

            Reminder savedReminder = reminderRepo.save(reminder);
            return ResponseEntity.ok(savedReminder);
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to create reminder");
            return ResponseEntity.badRequest().body(error);
        }
    }

    /**
     * Prefer earliest upcoming domestic (then international) deadline from program_terms.
     * Falls back to legacy schools.application_deadline, then today+14 so save still works
     * when a term exists but no date was published.
     */
    LocalDate resolveReminderDate(School school) {
        LocalDate today = LocalDate.now();
        List<ProgramTerm> terms = termRepo.findBySchoolId(school.getId());

        LocalDate upcoming = terms.stream()
                .filter(t -> !Boolean.FALSE.equals(t.getAccepting()))
                .flatMap(t -> Stream.of(t.getDomesticDeadline(), t.getInternationalDeadline()))
                .filter(Objects::nonNull)
                .filter(d -> !d.isBefore(today))
                .min(Comparator.naturalOrder())
                .orElse(null);
        if (upcoming != null) {
            return upcoming;
        }

        LocalDate anyTermDeadline = terms.stream()
                .flatMap(t -> Stream.of(t.getDomesticDeadline(), t.getInternationalDeadline()))
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        if (anyTermDeadline != null) {
            return anyTermDeadline;
        }

        String deadlineStr = school.getApplicationDeadline();
        if (deadlineStr != null && !deadlineStr.trim().isEmpty()) {
            try {
                return LocalDate.parse(deadlineStr.trim());
            } catch (DateTimeParseException e) {
                log.warn("Invalid legacy application_deadline for school {}: {}", school.getId(), deadlineStr);
            }
        }

        // Program has term rows but no published dates — still allow save.
        if (!terms.isEmpty()) {
            return today.plusDays(14);
        }
        return null;
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
        // TODO: Extract student ID from authentication token
        // TODO: Verify application belongs to student
        // TODO: Retrieve reminders for this application
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
        // TODO: Extract student ID from authentication token
        // TODO: Calculate date range (today + days)
        // TODO: Retrieve reminders within date range
        return "Upcoming reminders for next " + days + " days";
    }

    /**
     * get a specific reminder by ID
     
     * GET /api/reminders/{reminderId}
     */

    @GetMapping("/{reminderId}")
    public String getReminderById(@PathVariable Long reminderId) {
        // TODO: Extract student ID from authentication token
        // TODO: Verify reminder belongs to student
        // TODO: Retrieve reminder details
        return "Reminder details for ID: " + reminderId;
    }

    /**
     * update a reminder
     * 
     * PUT /api/reminders/{reminderId}
     */

    @PutMapping("/{reminderId}")
    public String updateReminder(@PathVariable Long reminderId, @RequestBody String reminderData) {
        // TODO: Extract student ID from authentication token
        // TODO: Verify reminder belongs to student
        // TODO: Update reminder in database
        return "Reminder updated";
    }

    /**
     * delete a reminder by reminder ID
     * 
     * DELETE /api/reminders/{reminderId}
     */
    @DeleteMapping("/{reminderId}")
    public ResponseEntity<?> deleteReminder(@PathVariable Long reminderId, Authentication authentication) {
        User user = currentUser.require(authentication);
        try {

            Reminder reminder = reminderRepo.findByIdAndUser(reminderId, user)
                    .orElse(null);
            if (reminder == null) {
                return ResponseEntity.notFound().build();
            }

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
    public ResponseEntity<?> deleteReminderBySchool(@PathVariable Long schoolId, Authentication authentication) {
        User user = currentUser.require(authentication);
        try {

            List<Reminder> reminders = reminderRepo.findByUserAndSchoolId(user, schoolId);
            if (reminders.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            // Delete all reminders for this school and user
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
     * toggle a reminder's completed status
     * 
     * PATCH /api/reminders/{reminderId}/complete
     *
     */
    @PatchMapping("/{reminderId}/complete")
    public ResponseEntity<?> toggleReminderComplete(@PathVariable Long reminderId, Authentication authentication) {
        User user = currentUser.require(authentication);
        try {

            Reminder reminder = reminderRepo.findByIdAndUser(reminderId, user)
                    .orElse(null);
            if (reminder == null) {
                return ResponseEntity.notFound().build();
            }

            // Toggle the completed status
            reminder.setIsCompleted(!reminder.getIsCompleted());
            Reminder updatedReminder = reminderRepo.save(reminder);
            return ResponseEntity.ok(updatedReminder);
        } catch (Exception e) {
            log.warn("Request failed", e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to toggle reminder completion status");
            return ResponseEntity.badRequest().body(error);
        }
    }
}

