package com.project03.email;

public record EmailSendResult(boolean attempted, boolean stubbed, boolean sent, String reason) {

    public static EmailSendResult skipped(String reason) {
        return new EmailSendResult(false, false, false, reason);
    }

    public static EmailSendResult stubbed(String reason) {
        return new EmailSendResult(true, true, false, reason);
    }

    public static EmailSendResult delivered() {
        return new EmailSendResult(true, false, true, null);
    }

    /** True when the outbound path ran (real or dry-run stub) and we should stamp sent_at. */
    public boolean recordedAsSent() {
        return attempted && (sent || stubbed);
    }
}
