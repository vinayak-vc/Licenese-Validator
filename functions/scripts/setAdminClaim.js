"use strict";

const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) {
      continue;
    }
    if (!value || value.startsWith("--")) {
      args[key.slice(2)] = true;
      continue;
    }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log("Usage:");
    console.log("  node scripts/setAdminClaim.js --uid <FIREBASE_UID>");
    console.log("  node scripts/setAdminClaim.js --email <ADMIN_EMAIL>");
    console.log("");
    console.log("Optional:");
    console.log("  --remove true   Remove admin claim instead of setting it");
    process.exit(0);
  }

  const uidArg = typeof args.uid === "string" ? args.uid.trim() : "";
  const emailArg = typeof args.email === "string" ? args.email.trim() : "";
  const remove = String(args.remove || "").toLowerCase() === "true";

  if (!uidArg && !emailArg) {
    throw new Error("Provide either --uid or --email");
  }

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  let uid = uidArg;
  if (!uid && emailArg) {
    const user = await admin.auth().getUserByEmail(emailArg);
    uid = user.uid;
  }

  if (!uid) {
    throw new Error("Unable to resolve UID");
  }

  const claims = remove ? {} : { admin: true };
  await admin.auth().setCustomUserClaims(uid, claims);

  if (remove) {
    console.log(`Removed admin claim for UID: ${uid}`);
  } else {
    console.log(`Set admin claim for UID: ${uid}`);
  }
}

main().catch((error) => {
  console.error("Failed to set admin claim:", error.message);
  process.exit(1);
});
