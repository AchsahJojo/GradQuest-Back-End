package com.project03.dto;

import java.util.ArrayList;
import java.util.List;

public class SopOverlapResponse {
    private List<Pair> pairs = new ArrayList<>();
    private boolean weak;
    private List<String> unmatchedKinds = new ArrayList<>();
    private String verifiedAsOf;

    public List<Pair> getPairs() { return pairs; }
    public void setPairs(List<Pair> pairs) { this.pairs = pairs; }
    public boolean isWeak() { return weak; }
    public void setWeak(boolean weak) { this.weak = weak; }
    public List<String> getUnmatchedKinds() { return unmatchedKinds; }
    public void setUnmatchedKinds(List<String> unmatchedKinds) { this.unmatchedKinds = unmatchedKinds; }
    public String getVerifiedAsOf() { return verifiedAsOf; }
    public void setVerifiedAsOf(String verifiedAsOf) { this.verifiedAsOf = verifiedAsOf; }

    public static class Pair {
        private String pairId;
        private String resumeText;
        private String factKind;
        private String factName;
        private String factDetail;
        private String sourceUrl;
        private String reason;

        public String getPairId() { return pairId; }
        public void setPairId(String pairId) { this.pairId = pairId; }
        public String getResumeText() { return resumeText; }
        public void setResumeText(String resumeText) { this.resumeText = resumeText; }
        public String getFactKind() { return factKind; }
        public void setFactKind(String factKind) { this.factKind = factKind; }
        public String getFactName() { return factName; }
        public void setFactName(String factName) { this.factName = factName; }
        public String getFactDetail() { return factDetail; }
        public void setFactDetail(String factDetail) { this.factDetail = factDetail; }
        public String getSourceUrl() { return sourceUrl; }
        public void setSourceUrl(String sourceUrl) { this.sourceUrl = sourceUrl; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }
}
