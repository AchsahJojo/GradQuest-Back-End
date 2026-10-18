package com.project03.sop;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Server-to-server calls. The shared secret never goes to the phone.
 */
@Component
public class SopWorkerClient {

    private final String baseUrl;
    private final String secret;
    private final ObjectMapper mapper;
    private final HttpClient http;

    public SopWorkerClient(
            @Value("${sop.worker.base-url:}") String baseUrl,
            @Value("${sop.worker.secret:}") String secret,
            ObjectMapper mapper) {
        this.baseUrl = baseUrl == null ? "" : stripTrailingSlash(baseUrl.trim());
        this.secret = secret == null ? "" : secret;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public boolean isConfigured() {
        return !baseUrl.isEmpty() && !secret.isEmpty();
    }

    public JsonNode post(String path, Map<String, Object> body) {
        if (!isConfigured()) {
            throw new SopWorkerException("Statement worker is not configured");
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .timeout(Duration.ofSeconds(45))
                    .header("Content-Type", "application/json")
                    .header("X-GradQuest-Proxy-Secret", secret)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new SopWorkerException(response.statusCode(), "Statement worker rejected the request");
            }
            return mapper.readTree(response.body());
        } catch (SopWorkerException e) {
            throw e;
        } catch (Exception e) {
            throw new SopWorkerException("Statement worker is unavailable");
        }
    }

    private static String stripTrailingSlash(String value) {
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }
}
