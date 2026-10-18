package com.project03.dto;

public class SopProgramResponse {
    private Long schoolId;
    private String schoolName;
    private String programName;
    private Boolean sopRequired;
    private boolean allowlisted;
    private String pageStatus;
    private String message;

    public Long getSchoolId() { return schoolId; }
    public void setSchoolId(Long schoolId) { this.schoolId = schoolId; }
    public String getSchoolName() { return schoolName; }
    public void setSchoolName(String schoolName) { this.schoolName = schoolName; }
    public String getProgramName() { return programName; }
    public void setProgramName(String programName) { this.programName = programName; }
    public Boolean getSopRequired() { return sopRequired; }
    public void setSopRequired(Boolean sopRequired) { this.sopRequired = sopRequired; }
    public boolean isAllowlisted() { return allowlisted; }
    public void setAllowlisted(boolean allowlisted) { this.allowlisted = allowlisted; }
    public String getPageStatus() { return pageStatus; }
    public void setPageStatus(String pageStatus) { this.pageStatus = pageStatus; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
