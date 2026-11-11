package com.project03.dto;

import java.util.ArrayList;
import java.util.List;

public class SopResumeDeleteResponse {
    private boolean deleted;
    private List<String> failed = new ArrayList<>();

    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
    public List<String> getFailed() { return failed; }
    public void setFailed(List<String> failed) {
        this.failed = failed == null ? new ArrayList<>() : failed;
    }
}
