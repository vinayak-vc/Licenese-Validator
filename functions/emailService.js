"use strict";

/**
 * Admin email notifications via the Brevo (Sendinblue) transactional API.
 *
 * Endpoint: POST https://api.brevo.com/v3/smtp/email
 * Auth:     `api-key` request header.
 *
 * Configuration is read from the environment so this module stays decoupled
 * from the Cloud Functions runtime:
 *   - BREVO_API_KEY        (secret)  Brevo transactional API key.
 *   - BREVO_SENDER_EMAIL   (string)  Verified sender address.
 *   - BREVO_SENDER_NAME    (string)  Sender display name. Optional.
 *   - ADMIN_NOTIFY_EMAILS  (string)  Comma/semicolon separated admin recipients.
 *
 * All recipients are admins/team members — there are no client-facing emails.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10000;

// Minimal HTML escaper for interpolating dynamic values into email bodies.
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Parse the comma/semicolon separated recipient list into Brevo `to` objects.
function parseRecipients(raw) {
  if (typeof raw !== "string") {
    return [];
  }
  return raw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((email) => ({ email }));
}

function getEmailConfig() {
  return {
    apiKey: (process.env.BREVO_API_KEY || "").trim(),
    senderEmail: (process.env.BREVO_SENDER_EMAIL || "").trim(),
    senderName: (process.env.BREVO_SENDER_NAME || "Licence Validator").trim(),
    recipients: parseRecipients(process.env.ADMIN_NOTIFY_EMAILS),
  };
}

/**
 * Low-level Brevo send. Throws on misconfiguration or a non-2xx response so
 * callers (e.g. the manual test script) can surface failures. Fire-and-forget
 * callers should use {@link sendAdminNotification} instead, which never throws.
 */
async function sendBrevoEmail({ to, subject, htmlContent, textContent }) {
  const config = getEmailConfig();

  if (!config.apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }
  if (!config.senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL is not configured");
  }
  if (!Array.isArray(to) || to.length === 0) {
    throw new Error("No email recipients configured");
  }

  const payload = {
    sender: { email: config.senderEmail, name: config.senderName },
    to,
    subject,
    htmlContent,
  };
  if (textContent) {
    payload.textContent = textContent;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Brevo send failed (${response.status}): ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch (_error) {
    return { raw: body };
  }
}

/**
 * Send an admin notification. Never throws — failures are logged and reported
 * via the return value, so trial flows are never broken by email problems.
 *
 * @returns {Promise<{status: "sent"|"skipped"|"error", reason?: string, messageId?: string}>}
 */
async function sendAdminNotification({ subject, htmlContent, textContent }) {
  const config = getEmailConfig();

  if (!config.apiKey || !config.senderEmail || config.recipients.length === 0) {
    console.warn(
      "Admin email notification skipped: missing BREVO_API_KEY, BREVO_SENDER_EMAIL, or ADMIN_NOTIFY_EMAILS"
    );
    return { status: "skipped", reason: "not_configured" };
  }

  try {
    const result = await sendBrevoEmail({
      to: config.recipients,
      subject,
      htmlContent,
      textContent,
    });
    return { status: "sent", messageId: result?.messageId };
  } catch (error) {
    console.error("Admin email notification failed:", error.message);
    return { status: "error", reason: error.message };
  }
}

// ---------------------------------------------------------------------------
// Email body builders
// ---------------------------------------------------------------------------

function formatTimestamp(ms) {
  const num = Number(ms);
  if (!Number.isFinite(num) || num <= 0) {
    return "unknown";
  }
  return new Date(num).toISOString();
}

// Pull a human-readable os/cpu/gpu summary out of the nested systemInfo shape.
function summarizeSystemInfo(systemInfo) {
  const info = systemInfo && typeof systemInfo === "object" ? systemInfo : {};
  const application = info.application || {};
  const hardware = info.hardware || {};
  return {
    os: application.platform || "unknown",
    cpu: hardware.cpu || "unknown",
    gpu: hardware.gpu || "unknown",
  };
}

function wrapHtml(title, innerHtml) {
  return [
    "<html><body style=\"font-family:Arial,Helvetica,sans-serif;color:#1f2937;\">",
    `<h2 style="color:#0e7490;">${escapeHtml(title)}</h2>`,
    innerHtml,
    "<hr style=\"border:none;border-top:1px solid #e5e7eb;margin:24px 0;\"/>",
    "<p style=\"font-size:12px;color:#9ca3af;\">Automated message from the Licence Validator backend.</p>",
    "</body></html>",
  ].join("");
}

function rows(pairs) {
  return [
    "<table style=\"border-collapse:collapse;\">",
    ...pairs.map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${escapeHtml(
          label
        )}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`
    ),
    "</table>",
  ].join("");
}

function buildNewClientEmail({ projectName, projectId, deviceId, ip, systemInfo, trialStart, trialEnd, source }) {
  const sys = summarizeSystemInfo(systemInfo);
  const subject = `New trial registered — ${projectName || projectId} (${deviceId})`;
  const pairs = [
    ["Project", `${projectName || "—"} (${projectId})`],
    ["Device ID", deviceId],
    ["Source", source === "admin" ? "Admin panel" : "Client app"],
    ["OS", sys.os],
    ["CPU", sys.cpu],
    ["GPU", sys.gpu],
    ["IP", ip || "unknown"],
    ["Trial start", formatTimestamp(trialStart)],
    ["Trial end", formatTimestamp(trialEnd)],
  ];
  const htmlContent = wrapHtml("New trial registered", rows(pairs));
  const textContent = pairs.map(([k, v]) => `${k}: ${v}`).join("\n");
  return { subject, htmlContent, textContent };
}

function buildExpiringEmail(clients) {
  const subject = `Trials expiring soon — ${clients.length} device(s)`;
  const list = clients
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.deviceId)}</strong> — ${escapeHtml(
          c.projectName || c.projectId
        )} — expires ${escapeHtml(formatTimestamp(c.trialEnd))}</li>`
    )
    .join("");
  const htmlContent = wrapHtml(
    "Trials expiring soon",
    `<p>${clients.length} trial(s) expire within the next 3 days:</p><ul>${list}</ul>`
  );
  const textContent = clients
    .map((c) => `${c.deviceId} (${c.projectName || c.projectId}) expires ${formatTimestamp(c.trialEnd)}`)
    .join("\n");
  return { subject, htmlContent, textContent };
}

function buildExpiredEmail(clients) {
  const subject = `Trials expired — ${clients.length} device(s)`;
  const list = clients
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.deviceId)}</strong> — ${escapeHtml(
          c.projectName || c.projectId
        )} — expired ${escapeHtml(formatTimestamp(c.trialEnd))}</li>`
    )
    .join("");
  const htmlContent = wrapHtml(
    "Trials expired",
    `<p>${clients.length} trial(s) expired:</p><ul>${list}</ul>`
  );
  const textContent = clients
    .map((c) => `${c.deviceId} (${c.projectName || c.projectId}) expired ${formatTimestamp(c.trialEnd)}`)
    .join("\n");
  return { subject, htmlContent, textContent };
}

function buildAnomalyEmail(anomalies) {
  const subject = `Analytics anomaly — ${anomalies.length} spike(s) detected`;
  const list = anomalies
    .map(
      (a) =>
        `<li><strong>${escapeHtml(a.projectName || a.projectId)}</strong> — ${escapeHtml(
          a.metric
        )} yesterday: ${a.value} (7-day avg: ${a.baseline.toFixed(1)}, ${a.ratio.toFixed(1)}x normal)</li>`
    )
    .join("");
  const htmlContent = wrapHtml(
    "Analytics anomalies detected",
    `<p>Yesterday's metric(s) crossed the 5x threshold vs the 7-day baseline:</p><ul>${list}</ul>`
  );
  const textContent = anomalies
    .map((a) => `${a.projectName || a.projectId}: ${a.metric} = ${a.value} (baseline ${a.baseline.toFixed(1)}, ${a.ratio.toFixed(1)}x)`)
    .join("\n");
  return { subject, htmlContent, textContent };
}

module.exports = {
  escapeHtml,
  parseRecipients,
  getEmailConfig,
  sendBrevoEmail,
  sendAdminNotification,
  summarizeSystemInfo,
  buildNewClientEmail,
  buildExpiringEmail,
  buildExpiredEmail,
  buildAnomalyEmail,
};
