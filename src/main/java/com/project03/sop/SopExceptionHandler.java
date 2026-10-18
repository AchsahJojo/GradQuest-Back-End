package com.project03.sop;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * Worker failures stay 503. A 401 from the worker must not look like a logged-out session.
 */
@RestControllerAdvice
public class SopExceptionHandler {

    @ExceptionHandler(SopWorkerException.class)
    public ResponseEntity<Map<String, String>> unavailable(SopWorkerException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("message", exception.getMessage()));
    }
}
