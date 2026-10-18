package com.project03.dto;

public class SopDraftRequest {
    private Long schoolId;
    private String pastedPrompt;
    private String mode;

    public Long getSchoolId() { return schoolId; }
    public void setSchoolId(Long schoolId) { this.schoolId = schoolId; }
    public String getPastedPrompt() { return pastedPrompt; }
    public void setPastedPrompt(String pastedPrompt) { this.pastedPrompt = pastedPrompt; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
}
