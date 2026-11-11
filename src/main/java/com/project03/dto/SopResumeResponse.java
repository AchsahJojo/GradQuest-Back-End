package com.project03.dto;

public class SopResumeResponse {
    private boolean stored;
    private int chunks;

    public boolean isStored() { return stored; }
    public void setStored(boolean stored) { this.stored = stored; }
    public int getChunks() { return chunks; }
    public void setChunks(int chunks) { this.chunks = chunks; }
}
