package com.project03.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EmailDeliverabilityTest {

    @Test
    @DisplayName("real inboxes are deliverable")
    void realInbox() {
        assertThat(EmailDeliverability.isDeliverable("achsah@example.com")).isTrue();
        assertThat(EmailDeliverability.skipReason("tester@dev.local")).isNull();
    }

    @Test
    @DisplayName("GitHub and Discord noreply addresses are skipped")
    void noreplySkipped() {
        assertThat(EmailDeliverability.skipReason("login@github.noreply"))
                .isEqualTo(EmailDeliverability.REASON_GITHUB_NOREPLY);
        assertThat(EmailDeliverability.skipReason("me@users.noreply.github.com"))
                .isEqualTo(EmailDeliverability.REASON_GITHUB_NOREPLY);
        assertThat(EmailDeliverability.skipReason("user@discord.noreply"))
                .isEqualTo(EmailDeliverability.REASON_DISCORD_NOREPLY);
        assertThat(EmailDeliverability.isDeliverable(null)).isFalse();
        assertThat(EmailDeliverability.skipReason("  ")).isEqualTo(EmailDeliverability.REASON_MISSING);
    }
}
