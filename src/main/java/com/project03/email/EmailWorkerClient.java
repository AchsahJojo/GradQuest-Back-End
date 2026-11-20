package com.project03.email;

import com.fasterxml.jackson.databind.JsonNode;
import com.project03.sop.SopWorkerClient;
import com.project03.sop.SopWorkerException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Spring → Worker {@code /internal/email/*} using the same proxy secret as SOP.
 * When the worker base URL/secret are unset, returns a dry-run stub so local
 * tests and undeployed environments still exercise the reminder path.
 *
 * <p>Real Cloudflare {@code send_email} binding is optional until a sending
 * domain exists; the Worker stub returns {@code stubbed: true} in that case.
 */
@Component
public class EmailWorkerClient {

    private static final Logger log = LoggerFactory.getLogger(EmailWorkerClient.class);

    private final SopWorkerClient worker;

    public EmailWorkerClient(SopWorkerClient worker) {
        this.worker = worker;
    }

    public EmailSendResult send(EmailSendRequest request) {
        if (!worker.isConfigured()) {
            log.info("Email dry-run (worker not configured): kind={} to={} subject={}",
                    request.kind(), request.to(), request.subject());
            return EmailSendResult.stubbed("worker_not_configured");
        }
        try {
            JsonNode node = worker.post("/internal/email/send", request.toWorkerBody());
            boolean stubbed = node.path("stubbed").asBoolean(false);
            boolean sent = node.path("sent").asBoolean(false);
            String reason = text(node, "reason");
            if (stubbed) {
                log.info("Email stubbed by worker: kind={} reason={}", request.kind(), reason);
                return EmailSendResult.stubbed(reason != null ? reason : "worker_stub");
            }
            if (sent) {
                return EmailSendResult.delivered();
            }
            return EmailSendResult.skipped(reason != null ? reason : "worker_rejected");
        } catch (SopWorkerException e) {
            log.warn("Email worker call failed: {}", e.getMessage());
            return EmailSendResult.skipped("worker_error");
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) {
            return null;
        }
        String value = node.get(field).asText("");
        return value.isBlank() ? null : value;
    }
}
