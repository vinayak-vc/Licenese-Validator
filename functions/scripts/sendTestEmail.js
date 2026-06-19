"use strict";

/**
 * Manual end-to-end check for the Brevo admin-notification pipeline.
 * Sends one real email to the configured ADMIN_NOTIFY_EMAILS recipients.
 *
 * Usage (from functions/):
 *   BREVO_API_KEY=xxx \
 *   BREVO_SENDER_EMAIL=you@example.com \
 *   ADMIN_NOTIFY_EMAILS=admin@example.com \
 *   npm run send-test-email
 *
 * Or rely on functions/.env + functions/.secret.local being loaded by your
 * shell, then: node -r dotenv/config scripts/sendTestEmail.js  (if using dotenv)
 *
 * Optional flags:
 *   --type new|expiring|expired   Which sample email to send (default: new)
 */

const fs = require("fs");
const path = require("path");

// Plain Node scripts don't auto-load Firebase's .env / .secret.local (only the
// emulator does), so load them here for any keys not already set in the
// environment. This lets `npm run send-test-email` work with no inline vars.
function loadEnvFile(fileName) {
  const filePath = path.join(__dirname, "..", fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".secret.local");

const {
  sendBrevoEmail,
  getEmailConfig,
  buildNewClientEmail,
  buildExpiringEmail,
  buildExpiredEmail,
} = require("../emailService");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = value;
      i += 1;
    }
  }
  return args;
}

function buildSample(type) {
  const now = Date.now();
  if (type === "expiring") {
    return buildExpiringEmail([
      { deviceId: "device-test-1", projectName: "Demo Project", projectId: "demo123", trialEnd: now + 2 * 86400000 },
    ]);
  }
  if (type === "expired") {
    return buildExpiredEmail([
      { deviceId: "device-test-1", projectName: "Demo Project", projectId: "demo123", trialEnd: now - 86400000 },
    ]);
  }
  return buildNewClientEmail({
    projectName: "Demo Project",
    projectId: "demo123",
    deviceId: "device-test-1",
    ip: "203.0.113.10",
    systemInfo: { application: { platform: "Windows 11" }, hardware: { cpu: "Intel i7", gpu: "RTX 3060" } },
    trialStart: now,
    trialEnd: now + 7 * 86400000,
    source: "client",
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const type = typeof args.type === "string" ? args.type : "new";
  const config = getEmailConfig();

  if (config.recipients.length === 0) {
    throw new Error("ADMIN_NOTIFY_EMAILS is empty — nothing to send to");
  }

  const email = buildSample(type);
  console.log(`Sending "${type}" sample to: ${config.recipients.map((r) => r.email).join(", ")}`);

  const result = await sendBrevoEmail({ to: config.recipients, ...email });
  console.log("Sent. Brevo response:", JSON.stringify(result));
}

main().catch((error) => {
  console.error("Test email failed:", error.message);
  process.exit(1);
});
