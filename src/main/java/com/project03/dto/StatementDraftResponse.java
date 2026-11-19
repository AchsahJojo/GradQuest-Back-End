package com.project03.dto;

import java.time.LocalDateTime;

public class StatementDraftResponse {
    private String body;
    private LocalDateTime updatedAt;

    public StatementDraftResponse() {}

    public StatementDraftResponse(String body, LocalDateTime updatedAt) {
        this.body = body;
        this.updatedAt = updatedAt;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
