"use strict";

// One-shot verifier: prints the most recent events for a given projectApiKey
// + deviceId directly from Firestore via firebase-admin. Uses the same
// composite doc id convention as trialService (`${projectId}__${deviceId}`).
//
// Usage:
//   node scripts/readEvents.js --projectApiKey <key> --deviceId <id> [--limit 20]

const crypto = require("crypto");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) continue;
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
  const projectApiKey = args.projectApiKey;
  const deviceId = args.deviceId;
  const limit = Math.min(200, Math.max(1, Number(args.limit) || 20));
  if (!projectApiKey || !deviceId) {
    throw new Error("Provide --projectApiKey and --deviceId");
  }

  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const keyHash = crypto.createHash("sha256").update(projectApiKey).digest("hex");
  const projSnap = await db.collection("projects").where("apiKeyHash", "==", keyHash).limit(1).get();
  if (projSnap.empty) {
    console.log(JSON.stringify({ ok: false, error: "projectApiKey not found" }));
    return;
  }
  const projectId = projSnap.docs[0].id;
  const clientDocId = `${projectId}__${deviceId}`;
  const clientRef = db.collection("clients").doc(clientDocId);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    console.log(JSON.stringify({ ok: false, error: "client not registered", projectId, clientDocId }));
    return;
  }

  const eventsSnap = await clientRef
    .collection("events")
    .orderBy("receivedAt", "desc")
    .limit(limit)
    .get();

  const events = eventsSnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: data.name,
      params: data.params,
      clientTimestamp: data.clientTimestamp,
      receivedAt: data.receivedAt?.toMillis ? new Date(data.receivedAt.toMillis()).toISOString() : null,
    };
  });

  console.log(JSON.stringify({ ok: true, projectId, clientDocId, count: events.length, events }, null, 2));
}

main().catch((error) => {
  console.error("Read events failed:", error.message);
  process.exit(1);
});
