"use strict";

/**
 * Daily anomaly scan across every project. For each project, compares
 * yesterday's counts vs the prior 7-day rolling average. Emits an email to
 * admins if any metric spikes by >= SPIKE_RATIO. Never throws; missing data
 * (no baseline yet) is silently skipped.
 *
 * Watched metrics (add more here without touching the caller):
 *   - error_count: count of error_reported + exception_caught + kiosk_hardware_fault
 *   - total_events: total events per day (catches mass client bugs firing loops)
 */

const { Timestamp } = require("firebase-admin/firestore");
const { db } = require("./firebase");
const emailService = require("./emailService");

const DAY_MS = 24 * 60 * 60 * 1000;
const SPIKE_RATIO = 5;
const BASELINE_DAYS = 7;
const EVENTS_SUBCOLLECTION = "events";
const CLIENTS_COLLECTION = "clients";
const PROJECTS_COLLECTION = "projects";
const ERROR_EVENT_NAMES = new Set(["error_reported", "exception_caught", "kiosk_hardware_fault"]);

function dayStartMs(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime();
}

async function loadProjectNames() {
  const snap = await db.collection(PROJECTS_COLLECTION).get();
  const map = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    map.set(doc.id, data.name || doc.id);
  });
  return map;
}

async function runAnomalyScan(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const yesterdayStart = dayStartMs(now - DAY_MS);
  const yesterdayEnd = yesterdayStart + DAY_MS;
  const windowStart = yesterdayStart - BASELINE_DAYS * DAY_MS;

  const snapshot = await db
    .collectionGroup(EVENTS_SUBCOLLECTION)
    .where("receivedAt", ">=", Timestamp.fromMillis(windowStart))
    .where("receivedAt", "<", Timestamp.fromMillis(yesterdayEnd))
    .get();

  // Bucket per (projectId, dayKey): { total, errors }
  const buckets = new Map();
  snapshot.docs.forEach((doc) => {
    const parentPath = doc.ref.parent.parent?.path || "";
    const clientDocId = parentPath.split("/")[1] || "";
    const sep = clientDocId.indexOf("__");
    if (sep < 0) return;
    const projectId = clientDocId.slice(0, sep);
    const data = doc.data() || {};
    const timeMs = data.receivedAt?.toMillis ? data.receivedAt.toMillis() : 0;
    if (!timeMs) return;
    const dayKey = new Date(dayStartMs(timeMs)).toISOString().slice(0, 10);
    const bucketKey = `${projectId}__${dayKey}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { projectId, dayKey, total: 0, errors: 0 });
    const bucket = buckets.get(bucketKey);
    bucket.total += 1;
    if (ERROR_EVENT_NAMES.has(data.name || "")) bucket.errors += 1;
  });

  // Regroup per project.
  const byProject = new Map();
  buckets.forEach((bucket) => {
    if (!byProject.has(bucket.projectId)) byProject.set(bucket.projectId, []);
    byProject.get(bucket.projectId).push(bucket);
  });

  const yesterdayKey = new Date(yesterdayStart).toISOString().slice(0, 10);
  const anomalies = [];
  const projectNames = await loadProjectNames();

  byProject.forEach((rows, projectId) => {
    const yesterday = rows.find((r) => r.dayKey === yesterdayKey);
    if (!yesterday) return;
    const baselineRows = rows.filter((r) => r.dayKey !== yesterdayKey);
    if (baselineRows.length < 3) return;                                   // not enough history to trust a baseline

    const baselineAvg = (metric) =>
      baselineRows.reduce((sum, r) => sum + (r[metric] || 0), 0) / baselineRows.length;

    ["total", "errors"].forEach((metric) => {
      const baseline = baselineAvg(metric);
      const value = yesterday[metric] || 0;
      if (baseline < 1) return;                                            // avoid divide-by-zero and noise on brand-new projects
      const ratio = value / baseline;
      if (ratio < SPIKE_RATIO) return;
      anomalies.push({
        projectId,
        projectName: projectNames.get(projectId) || projectId,
        metric: metric === "total" ? "total events" : "error count",
        value,
        baseline,
        ratio,
      });
    });
  });

  if (anomalies.length === 0) {
    console.log("anomalyScan: no anomalies");
    return { anomalies: 0 };
  }

  const email = emailService.buildAnomalyEmail(anomalies);
  await emailService.sendAdminNotification(email);
  console.log(`anomalyScan: ${anomalies.length} anomaly/anomalies emailed`);
  return { anomalies: anomalies.length };
}

module.exports = { runAnomalyScan };
