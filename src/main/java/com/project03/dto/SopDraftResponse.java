package com.project03.dto;

import java.util.ArrayList;
import java.util.List;

public class SopDraftResponse {
    public static final String LABEL = "Draft outline — edit before you use it";

    private String paragraph;
    private String label = LABEL;
    private List<String> citations = new ArrayList<>();
    private Boolean sopRequired;
    private String pageStatus;

    public String getParagraph() { return paragraph; }
    public void setParagraph(String paragraph) { this.paragraph = paragraph; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public List<String> getCitations() { return citations; }
    public void setCitations(List<String> citations) { this.citations = citations; }
    public Boolean getSopRequired() { return sopRequired; }
    public void setSopRequired(Boolean sopRequired) { this.sopRequired = sopRequired; }
    public String getPageStatus() { return pageStatus; }
    public void setPageStatus(String pageStatus) { this.pageStatus = pageStatus; }
}
