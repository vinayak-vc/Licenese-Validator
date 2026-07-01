"use strict";

/**
 * Hourly BigQuery export using batch loads (free tier).
 *
 * Design goals (drive every choice below):
 *
 *  1. Zero cost at small/medium scale. That means:
 *     - BATCH loads only (`table.load`), NEVER streaming inserts. Streaming
 *       is priced from byte 1 ($0.05/GB), batch loads are free.
 *     - Time-partitioned destination table with `expirationMs` set so old
 *       partitions delete themselves. Storage stays flat and under the
 *       10 GB monthly free tier for typical deployments.
 *     - One scheduled invocation per hour = 720/month, negligible against
 *       the shared 2M free Cloud Functions budget.
 *
 *  2. No manual GCP setup. First run creates the dataset + table + schema
 *     if missing. Point-in-time watermark is stored in Firestore so the
 *     function is stateless and idempotent across cold starts.
 *
 *  3. Robust to Firestore/BigQuery hiccups. If a batch load fails, the
 *     watermark is not advanced, so the next run re-picks the same window.
 *     Duplicate rows are theoretically possible on partial failure but
 *     acceptable given the low volume and downstream `DISTINCT event_id`
 *     queries.
 *
 * Note on collection-group queries: this reads across every
 * `clients/*//*events` subcollection in one shot via a collectionGroup query
 * on `events`. Firestore needs a matching index for
 * `receivedAt ASC` scoped to the collection group. That index is declared
 * in `firestore.indexes.json` and gets created at deploy time.
 */

const { BigQuery } = require("@google-cloud/bigquery");
const { Timestamp } = require("firebase-admin/firestore");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { db } = require("./firebase");

const DATASET_ID = "analytics";
const TABLE_ID = "events";
const DATASET_LOCATION = "US";
const PARTITION_EXPIRATION_DAYS = 90;
const MAX_ROWS_PER_RUN = 10000;
const STATE_DOC_PATH = "metadata/bigquery_export_state";

const bigqueryClient = new BigQuery();

const TABLE_SCHEMA = {
  fields: [
    { name: "event_id", type: "STRING", mode: "REQUIRED" },
    { name: "project_id", type: "STRING", mode: "REQUIRED" },
    { name: "device_id", type: "STRING", mode: "REQUIRED" },
    { name: "name", type: "STRING", mode: "REQUIRED" },
    { name: "params_json", type: "STRING", mode: "NULLABLE" },
    { name: "app_type", type: "STRING", mode: "NULLABLE" },
    { name: "game_id", type: "STRING", mode: "NULLABLE" },
    { name: "client_timestamp", type: "INTEGER", mode: "NULLABLE" },
    { name: "received_at", type: "TIMESTAMP", mode: "REQUIRED" },
  ],
};

async function ensureDatasetAndTable() {
  const dataset = bigqueryClient.dataset(DATASET_ID);
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await bigqueryClient.createDataset(DATASET_ID, { location: DATASET_LOCATION });
    console.log(`bigqueryExport: created dataset ${DATASET_ID}`);
  }

  const table = dataset.table(TABLE_ID);
  const [tableExists] = await table.exists();
  if (!tableExists) {
    await dataset.createTable(TABLE_ID, {
      schema: TABLE_SCHEMA,
      timePartitioning: {
        type: "DAY",
        field: "received_at",
        expirationMs: String(PARTITION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
      },
      clustering: {
        fields: ["project_id", "app_type"],
      },
    });
    console.log(
      `bigqueryExport: created table ${DATASET_ID}.${TABLE_ID} with ${PARTITION_EXPIRATION_DAYS}-day partition expiration`
    );
  }
}

function rowFromDoc(doc) {
  const data = doc.data() || {};
  const docPath = doc.ref.path;                                // clients/{projectId__deviceId}/events/{eventId}
  const clientDocId = docPath.split("/")[1] || "";
  const separatorIndex = clientDocId.indexOf("__");
  const projectId = separatorIndex > 0 ? clientDocId.slice(0, separatorIndex) : "";
  const deviceId = separatorIndex > 0 ? clientDocId.slice(separatorIndex + 2) : "";

  const receivedAtMs = data.receivedAt?.toMillis ? data.receivedAt.toMillis() : null;
  if (!receivedAtMs) {
    return null;                                               // required field — skip malformed doc
  }

  const params = data.params && typeof data.params === "object" ? data.params : {};
  return {
    event_id: doc.id,
    project_id: projectId,
    device_id: deviceId,
    name: typeof data.name === "string" ? data.name : "",
    params_json: JSON.stringify(params),
    app_type: typeof params.app_type === "string" ? params.app_type : null,
    game_id: typeof params.game_id === "string" ? params.game_id : null,
    client_timestamp: Number.isFinite(data.clientTimestamp) ? data.clientTimestamp : null,
    received_at: new Date(receivedAtMs).toISOString(),
  };
}

async function fetchNewEvents(lastWatermarkMs) {
  const query = db
    .collectionGroup("events")
    .where("receivedAt", ">", Timestamp.fromMillis(lastWatermarkMs))
    .orderBy("receivedAt", "asc")
    .limit(MAX_ROWS_PER_RUN);
  const snapshot = await query.get();
  return snapshot.docs;
}

async function writeBatch(rows) {
  const tempFile = path.join(os.tmpdir(), `bq-export-${Date.now()}.jsonl`);
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(tempFile, payload);

  try {
    const [job] = await bigqueryClient
      .dataset(DATASET_ID)
      .table(TABLE_ID)
      .load(tempFile, {
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        writeDisposition: "WRITE_APPEND",
        schema: TABLE_SCHEMA,
      });
    const errors = (job.status && job.status.errors) || [];
    if (errors.length > 0) {
      const message = errors.map((error) => error.message).join("; ");
      throw new Error(`BigQuery load reported errors: ${message}`);
    }
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch (_) {
      // temp file cleanup is best-effort
    }
  }
}

async function runExport() {
  await ensureDatasetAndTable();

  const stateRef = db.doc(STATE_DOC_PATH);
  const stateSnapshot = await stateRef.get();
  const stateData = stateSnapshot.exists ? stateSnapshot.data() || {} : {};
  const lastWatermarkMs = Number.isFinite(stateData.lastWatermarkMs) ? stateData.lastWatermarkMs : 0;
  const startedAtMs = Date.now();

  const docs = await fetchNewEvents(lastWatermarkMs);
  if (docs.length === 0) {
    await stateRef.set(
      { lastRunMs: startedAtMs, lastRowsExported: 0, lastError: null },
      { merge: true }
    );
    return { exported: 0, watermarkAdvancedTo: lastWatermarkMs };
  }

  const rows = [];
  let maxWatermarkMs = lastWatermarkMs;
  for (const doc of docs) {
    const row = rowFromDoc(doc);
    if (!row) continue;
    rows.push(row);
    const rowTimeMs = Date.parse(row.received_at);
    if (Number.isFinite(rowTimeMs) && rowTimeMs > maxWatermarkMs) {
      maxWatermarkMs = rowTimeMs;
    }
  }

  if (rows.length === 0) {
    await stateRef.set(
      { lastRunMs: startedAtMs, lastRowsExported: 0, lastError: "all rows skipped as malformed" },
      { merge: true }
    );
    return { exported: 0, watermarkAdvancedTo: lastWatermarkMs };
  }

  try {
    await writeBatch(rows);
  } catch (error) {
    await stateRef.set(
      { lastRunMs: startedAtMs, lastError: error.message || String(error) },
      { merge: true }
    );
    throw error;
  }

  await stateRef.set(
    {
      lastRunMs: startedAtMs,
      lastWatermarkMs: maxWatermarkMs,
      lastRowsExported: rows.length,
      lastError: null,
    },
    { merge: true }
  );

  return { exported: rows.length, watermarkAdvancedTo: maxWatermarkMs };
}

module.exports = {
  runExport,
  DATASET_ID,
  TABLE_ID,
  PARTITION_EXPIRATION_DAYS,
};
