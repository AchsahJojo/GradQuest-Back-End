package com.project03.sop;

public class SopWorkerException extends RuntimeException {
    private final int status;

    public SopWorkerException(String message) {
        super(message);
        this.status = 503;
    }

    public SopWorkerException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
