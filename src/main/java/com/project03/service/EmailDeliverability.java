package com.project03.service;

/**
 * OAuth often yields synthetic provider addresses that cannot receive mail.
 */
public final class EmailDeliverability {

    public static final String REASON_MISSING = "missing_email";
    public static final String REASON_GITHUB_NOREPLY = "github_noreply";
    public static final String REASON_DISCORD_NOREPLY = "discord_noreply";

    private EmailDeliverability() {
    }

    public static boolean isDeliverable(String email) {
        return skipReason(email) == null;
    }

    /**
     * @return null when the address looks deliverable; otherwise a stable skip reason.
     */
    public static String skipReason(String email) {
        if (email == null || email.isBlank()) {
            return REASON_MISSING;
        }
        String normalized = email.trim().toLowerCase();
        if (normalized.endsWith("@github.noreply") || normalized.endsWith("@users.noreply.github.com")) {
            return REASON_GITHUB_NOREPLY;
        }
        if (normalized.endsWith("@discord.noreply")) {
            return REASON_DISCORD_NOREPLY;
        }
        return null;
    }
}
