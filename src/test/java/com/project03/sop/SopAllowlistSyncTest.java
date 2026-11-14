package com.project03.sop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Fails if SopAllowlist.java and gradquest-worker/src/allowlist.ts ever diverge.
 */
class SopAllowlistSyncTest {

    private static final Pattern HTTPS_URL = Pattern.compile("https://[^\"\\s]+");

    @Test
    @DisplayName("Java and TypeScript SOP allowlists stay identical")
    void javaAndTypescriptAllowlistsMatch() throws IOException {
        Path root = projectRoot();
        Set<String> javaUrls = urlsIn(root.resolve("src/main/java/com/project03/sop/SopAllowlist.java"));
        Set<String> tsUrls = urlsIn(root.resolve("gradquest-worker/src/allowlist.ts"));

        assertThat(javaUrls)
                .as("SopAllowlist.java vs allowlist.ts (normalized, no trailing slash)")
                .containsExactlyInAnyOrderElementsOf(tsUrls);
    }

    private static Path projectRoot() {
        Path cwd = Path.of("").toAbsolutePath();
        if (Files.isRegularFile(cwd.resolve("src/main/java/com/project03/sop/SopAllowlist.java"))) {
            return cwd;
        }
        Path parent = cwd.getParent();
        if (parent != null
                && Files.isRegularFile(parent.resolve("src/main/java/com/project03/sop/SopAllowlist.java"))) {
            return parent;
        }
        throw new IllegalStateException("Cannot find project root from " + cwd);
    }

    private static Set<String> urlsIn(Path file) throws IOException {
        String text = Files.readString(file);
        Matcher matcher = HTTPS_URL.matcher(text);
        Set<String> urls = new LinkedHashSet<>();
        while (matcher.find()) {
            urls.add(SopAllowlist.normalize(matcher.group()));
        }
        return urls.stream().sorted().collect(Collectors.toCollection(LinkedHashSet::new));
    }
}
