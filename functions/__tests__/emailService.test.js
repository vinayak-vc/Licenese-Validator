"use strict";

const {
  escapeHtml,
  parseRecipients,
  summarizeSystemInfo,
  buildNewClientEmail,
  buildExpiringEmail,
  buildExpiredEmail,
  sendBrevoEmail,
  sendAdminNotification,
} = require("../emailService");

describe("emailService helpers", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(escapeHtml(null)).toBe("");
  });

  it("parses comma/semicolon recipient lists", () => {
    expect(parseRecipients("a@x.com, b@x.com ; c@x.com")).toEqual([
      { email: "a@x.com" },
      { email: "b@x.com" },
      { email: "c@x.com" },
    ]);
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
  });

  it("summarizes nested and missing systemInfo", () => {
    expect(
      summarizeSystemInfo({ application: { platform: "Win" }, hardware: { cpu: "i7", gpu: "RTX" } })
    ).toEqual({ os: "Win", cpu: "i7", gpu: "RTX" });
    expect(summarizeSystemInfo(null)).toEqual({ os: "unknown", cpu: "unknown", gpu: "unknown" });
  });

  it("builds new-client email with key fields", () => {
    const email = buildNewClientEmail({
      projectName: "Proj",
      projectId: "p1",
      deviceId: "dev-1",
      ip: "1.2.3.4",
      systemInfo: { hardware: { cpu: "i7", gpu: "RTX" } },
      trialStart: 0,
      trialEnd: 1000,
      source: "client",
    });
    expect(email.subject).toContain("dev-1");
    expect(email.htmlContent).toContain("dev-1");
    expect(email.htmlContent).toContain("Client app");
    expect(email.textContent).toContain("i7");
  });

  it("builds expiring and expired digest emails", () => {
    const clients = [{ deviceId: "dev-1", projectName: "Proj", projectId: "p1", trialEnd: 1000 }];
    expect(buildExpiringEmail(clients).subject).toContain("1 device");
    expect(buildExpiredEmail(clients).subject).toContain("1 device");
  });
});

describe("emailService sending", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    delete global.fetch;
  });

  it("sendBrevoEmail posts to Brevo with api-key header", async () => {
    process.env.BREVO_API_KEY = "key-123";
    process.env.BREVO_SENDER_EMAIL = "from@x.com";
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ messageId: "mid-1" }),
    });

    const result = await sendBrevoEmail({
      to: [{ email: "admin@x.com" }],
      subject: "Hi",
      htmlContent: "<p>Hi</p>",
    });

    expect(result.messageId).toBe("mid-1");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(opts.headers["api-key"]).toBe("key-123");
    const body = JSON.parse(opts.body);
    expect(body.sender.email).toBe("from@x.com");
    expect(body.to).toEqual([{ email: "admin@x.com" }]);
  });

  it("sendBrevoEmail throws on non-2xx", async () => {
    process.env.BREVO_API_KEY = "key-123";
    process.env.BREVO_SENDER_EMAIL = "from@x.com";
    global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" });

    await expect(
      sendBrevoEmail({ to: [{ email: "a@x.com" }], subject: "s", htmlContent: "h" })
    ).rejects.toThrow(/401/);
  });

  it("sendAdminNotification skips when unconfigured and never throws", async () => {
    delete process.env.BREVO_API_KEY;
    const result = await sendAdminNotification({ subject: "s", htmlContent: "h" });
    expect(result.status).toBe("skipped");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sendAdminNotification returns error status (not throw) on failure", async () => {
    process.env.BREVO_API_KEY = "key-123";
    process.env.BREVO_SENDER_EMAIL = "from@x.com";
    process.env.ADMIN_NOTIFY_EMAILS = "admin@x.com";
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });

    const result = await sendAdminNotification({ subject: "s", htmlContent: "h" });
    expect(result.status).toBe("error");
  });
});
