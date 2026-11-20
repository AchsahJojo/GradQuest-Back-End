package com.project03.email;

import java.util.LinkedHashMap;
import java.util.Map;

public record EmailSendRequest(
        String to,
        String subject,
        String textBody,
        String kind,
        Long reminderId,
        Long userId,
        Long schoolId
) {
    public Map<String, Object> toWorkerBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("to", to);
        body.put("subject", subject);
        body.put("textBody", textBody);
        body.put("kind", kind);
        if (reminderId != null) {
            body.put("reminderId", reminderId);
        }
        if (userId != null) {
            body.put("userId", String.valueOf(userId));
        }
        if (schoolId != null) {
            body.put("schoolId", schoolId);
        }
        return body;
    }
}
