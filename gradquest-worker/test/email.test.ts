import { describe, expect, it, vi } from "vitest";
import { handleEmailSend } from "../src/email/send";

describe("email send stub", () => {
  it("dry-runs when send_email binding is missing", async () => {
    const result = await handleEmailSend(
      {
        to: "achsah@example.com",
        subject: "Deadline saved: UCSD — Fall 2027",
        textBody: "You saved UCSD",
        kind: "deadline_confirm",
      },
      {},
    );
    expect(result).toEqual({
      sent: false,
      stubbed: true,
      reason: "send_email_binding_not_configured",
      kind: "deadline_confirm",
    });
  });

  it("rejects missing to/subject", async () => {
    const result = await handleEmailSend({ kind: "deadline_confirm" }, {});
    expect(result.sent).toBe(false);
    expect(result.stubbed).toBe(false);
    expect(result.reason).toBe("missing_to_or_subject");
  });

  it("calls the EMAIL binding when present", async () => {
    const send = vi.fn(async () => undefined);
    const result = await handleEmailSend(
      {
        to: "achsah@example.com",
        subject: "Heads-up",
        textBody: "Due soon",
        kind: "deadline_due_soon",
      },
      { EMAIL: { send }, EMAIL_FROM: "noreply@gradquest.test" },
    );
    expect(result).toEqual({ sent: true, stubbed: false, kind: "deadline_due_soon" });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({
      to: "achsah@example.com",
      from: "noreply@gradquest.test",
      subject: "Heads-up",
      text: "Due soon",
    });
  });
});
