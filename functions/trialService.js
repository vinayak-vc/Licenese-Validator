"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { db } = require("./firebase");
const emailService = require("./emailService");

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// "Expiring soon" window for the daily admin digest.
const EXPIRING_SOON_WINDOW_MS = 3 * DAY_MS;
const PROJECTS_COLLECTION = "projects";
const CLIENTS_COLLECTION = "clients";
const EVENTS_SUBCOLLECTION = "events";
const APPLICATION_TYPES = ["Game", "Enterprise", "Kiosk"];
const DEFAULT_APPLICATION_TYPE = "Game";
// Per-call batch cap: Firestore batch writes cap at 500; this leaves headroom
// and keeps a single logEvents request small.
const MAX_EVENTS_PER_REQUEST = 50;
const MAX_EVENT_NAME_LENGTH = 40;
const MAX_EVENT_PARAMS = 25;
const MAX_EVENT_PARAM_NAME_LENGTH = 40;
const MAX_EVENT_PARAM_VALUE_LENGTH = 100;

const CODES = {
  TRIAL_STARTED: "1000",
  TRIAL_VERIFIED: "1001",
  ADMIN_CLIENT_CREATED: "1100",
  ADMIN_CLIENT_UPDATED: "1104",
  ADMIN_OFFLINE_LICENSE_ISSUED: "1105",
  ADMIN_TRIAL_REVOKED: "1101",
  ADMIN_TRIAL_EXTENDED: "1102",
  ADMIN_CLIENTS_LISTED: "1103",
  ADMIN_PROJECT_CREATED: "1200",
  ADMIN_PROJECTS_LISTED: "1201",
  ADMIN_PROJECT_CLIENTS_LISTED: "1202",
  DEVICE_NEVER_REGISTERED: "9999",
  DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_ACTIVE: "8888",
  DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_EXPIRED: "7777",
  INVALID_TOKEN: "7001",
  DEVICE_MISMATCH: "7002",
  TOKEN_REVOKED_OR_REPLACED: "7003",
  TRIAL_EXPIRED: "7004",
  CORRUPT_TRIAL_RECORD: "7005",
  TRIAL_NOT_FOUND: "7006",
  PROJECT_NOT_FOUND: "7007",
  PROJECT_INACTIVE: "7008",
  PROJECT_MISMATCH: "7009",
  TRIAL_ALREADY_USED: "4009",
  INVALID_BODY: "4000",
  INVALID_JSON: "4005",
  INVALID_DEVICE_ID: "4001",
  INVALID_SYSTEM_INFO: "4002",
  INVALID_SYSTEM_INFO_FIELDS: "4003",
  INVALID_TOKEN_FORMAT: "4004",
  INVALID_TRIAL_DAYS: "4010",
  INVALID_EXTEND_DAYS: "4011",
  INVALID_PROJECT_NAME: "4012",
  INVALID_PROJECT_ID: "4013",
  INVALID_PROJECT_API_KEY: "4014",
  PROJECT_ALREADY_EXISTS: "4015",
  INVALID_APPLICATION_TYPE: "4016",
  INVALID_EVENTS: "4017",
  INVALID_OFFLINE_REQUEST: "4018",
  CLIENT_NOT_FOUND: "7010",
  UNAUTHORIZED: "4030",
  FORBIDDEN: "4031",
  MISSING_JWT_SECRET: "5001",
  INTERNAL_ERROR: "5000",
  METHOD_NOT_ALLOWED: "4050",
  EVENTS_LOGGED: "1300",
};

// RSA-2048 keypair for asymmetric RS256 license token signing.
// The private key never leaves the backend; Unity clients embed only the public key
// so offline license verification is cryptographically unforgeable.
const DEFAULT_LICENSE_PRIVATE_KEY_PEM = [
  "-----BEGIN PRIVATE KEY-----",
  "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCrk2HLqlLYQk8X",
  "39pqOnLesZZScQuXNtUjsL+aSJikp6hfekaVnEStNMLVAaUSpdL+e3f8PAAqw4n2",
  "tHFewSaFlta63fFeaZuyMby5fm8Jg6aiOM3xy/dh2zTXVvzH0xMeS6I4e15Z7XUY",
  "weLbHWHAX6WUAe7K2j/WjXJ9rEOFA2Ze9st1FaowxfxltGvGL5LueOq2jb6z626v",
  "K5ieG+R5f/BBuYt2PuN++Jg6MmE48zNOByEkPO8fNnHWyD/qR5hEufDLPdBJ+bhB",
  "WsLqaA0sM7PMkSd+QDdxXlwljd+12tbxD1W+kSbAj9Jy9KYf1hmVP2HtQwodwck1",
  "aQeS9/eJAgMBAAECggEAC3K0ikctlZdrDpqVnhPoo+TxNO6tCXm+TqOATVY9tR1+",
  "CwzYwSp28fWncFir6oAdAXTnOccecxFZVxg4HkyV+kDpHU5/cz9pr5dI/TmAmtUU",
  "HRaG4J+C50kd5VESYcTlgtZ6Fvmy/x4XJj/oQprbHF+6vRLvRiK6Mrcnu1dEqWRy",
  "NuMEhApwTOIOgCvUhNs1mMVUiSPt5obsfRZCEOpTmE5L+lQKk0YutABzEpXhBb+O",
  "nzKkCiGak2o7zVznqAeSKlKFUSqCyoDlCrCPilqo1wlwMXTPhUp8mdJBCIAQhf6C",
  "xz0Rl+u/nxJEadlqrP9gOT4v0Q8+7s05LJM444hu3wKBgQDR1AVvEaBjIBB1Sltb",
  "ojwbyNGevrwaskdznjcO5BZxVmta519G8nuRlAtm7m6yRs51c6BQkGBg+SCyvLrb",
  "UMv47HTzpj3jCf6D5su3HWU5iYdRnTXd7pM06Xm04PGBbLwce/LDfrY4vqtFtYPg",
  "Nsf0f3UrkI0e/vRYpGchrHaIuwKBgQDRVIhjhIIqmqo52Htbt/lfDET+kNfkg47x",
  "eWlIqkeI5cq75XhG1oSwlMVq9YNyAS86fJIVd5Oloh663IpcurPhgUSmIObpahye",
  "zMzLuG5efRUBpL7ScHFK1VC+GEIw1UVIXI1JZJcxUrzguShECYE1X2nOvuJQb7q8",
  "jsJy8gyOiwKBgGg1SE2VD3arYgEeYKjttbSG07RnPbx0dg/xr55xoMPBC6gl6Kev",
  "nbb7M353Q/q+N6MVPbVFPthqYdbi7FonkmWZ6atoEKxFNmYDpYDX1IHyz4W08h+6",
  "cNmCarNuVALXIcVzuWll8NHVv/Hq6AferQe8lVCBhdSzAl9TpvSOVoApAoGAZA+T",
  "TnbFvdXGrvXzKYmMk0mLJWBZQqs8ReMyV4DFxwOI4D41Oy9JqBrFL3aCSZmVWNC5",
  "B7fsBM21AL9xCBha6d1f0kWB+2s0mRfugSb84v/JbcqxSGhlT08eVG/GHA+mGYvc",
  "IYwK1ZHmJUl8nOEqOTgNnL0T8z0lNwLKoiVfqTcCgYAw29u5g/S1tLhHW9eDHmlU",
  "FfN8JeVj4PXZ2lR/CbGRw/n0AFLGxE059cuNvptaTts9WWVKJ/iSFhsoyqHdVb+4",
  "fOfU1OAwveTIQVWsRt8dvOL50jMdEyku2UhGalxtFbA2mxc+B85jCj829OVgcx6c",
  "YhM/g3Q4iww/mtNsyg3q8A==",
  "-----END PRIVATE KEY-----",
].join("\n");

const DEFAULT_LICENSE_PUBLIC_KEY_PEM = [
  "-----BEGIN PUBLIC KEY-----",
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq5Nhy6pS2EJPF9/aajpy",
  "3rGWUnELlzbVI7C/mkiYpKeoX3pGlZxErTTC1QGlEqXS/nt3/DwAKsOJ9rRxXsEm",
  "hZbWut3xXmmbsjG8uX5vCYOmojjN8cv3Yds011b8x9MTHkuiOHteWe11GMHi2x1h",
  "wF+llAHuyto/1o1yfaxDhQNmXvbLdRWqMMX8ZbRrxi+S7njqto2+s+turyuYnhvk",
  "eX/wQbmLdj7jfviYOjJhOPMzTgchJDzvHzZx1sg/6keYRLnwyz3QSfm4QVrC6mgN",
  "LDOzzJEnfkA3cV5cJY3ftdrW8Q9VvpEmwI/ScvSmH9YZlT9h7UMKHcHJNWkHkvf3",
  "iQIDAQAB",
  "-----END PUBLIC KEY-----",
].join("\n");

function getLicensePrivateKeyPem() {
  return process.env.LICENSE_PRIVATE_KEY || DEFAULT_LICENSE_PRIVATE_KEY_PEM;
}

function getLicensePublicKeyPem() {
  return process.env.LICENSE_PUBLIC_KEY || DEFAULT_LICENSE_PUBLIC_KEY_PEM;
}

function computeOfflineRequestSignature(apiKeyHash, deviceId, requestedAtUtcMs) {
  const normalizedHash = String(apiKeyHash || "").trim().toLowerCase();
  const normalizedDevice = String(deviceId || "").trim();
  const timestamp = Number(requestedAtUtcMs || 0);
  return crypto
    .createHmac("sha256", `VC_OFFLINE_REQ_V1:${normalizedHash}`)
    .update(`${normalizedHash}|${normalizedDevice}|${timestamp}`)
    .digest("hex");
}

class TrialServiceError extends Error {
  constructor(message, httpStatus, statusCode, error) {
    super(message);
    this.name = "TrialServiceError";
    this.httpStatus = httpStatus;
    this.statusCode = String(statusCode);
    this.error = error;
  }
}

function responseBody({ message, token = "", statusCode, error = null, ...extra }) {
  return {
    message,
    token,
    statusCode: String(statusCode),
    error,
    ...extra,
  };
}

function isNonEmptyString(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function normalizeIp(ipAddress) {
  if (!ipAddress || typeof ipAddress !== "string") {
    return "unknown";
  }
  return ipAddress.split(",")[0].trim() || "unknown";
}

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function buildClientDocId(projectId, deviceId) {
  return `${projectId}__${deviceId}`;
}

async function findProjectByApiKey(projectApiKey) {
  const keyHash = hashApiKey(projectApiKey);
  const snapshot = await db
    .collection(PROJECTS_COLLECTION)
    .where("apiKeyHash", "==", keyHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
  };
}

async function getProjectById(projectId) {
  const doc = await db.collection(PROJECTS_COLLECTION).doc(projectId).get();
  if (!doc.exists) {
    return null;
  }
  return {
    id: doc.id,
    ...doc.data(),
  };
}

async function resolveProjectFromApiKey(projectApiKey) {
  const project = await findProjectByApiKey(projectApiKey);
  if (!project) {
    throw new TrialServiceError(
      "Invalid projectApiKey",
      400,
      CODES.INVALID_PROJECT_API_KEY,
      "INVALID_PROJECT_API_KEY"
    );
  }
  if (!project.active) {
    throw new TrialServiceError("Project is inactive", 403, CODES.PROJECT_INACTIVE, "PROJECT_INACTIVE");
  }
  return project;
}

function validateStartTrialInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { projectApiKey, deviceId, systemInfo } = payload;
  if (!isNonEmptyString(projectApiKey, 256)) {
    throw new TrialServiceError(
      "Invalid projectApiKey",
      400,
      CODES.INVALID_PROJECT_API_KEY,
      "INVALID_PROJECT_API_KEY"
    );
  }
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }
  return {
    projectApiKey: projectApiKey.trim(),
    deviceId: deviceId.trim(),
    systemInfo: validateSystemInfo(systemInfo),
  };
}

// Returns trimmed string clamped to maxLength, or undefined when absent/blank.
function sanitizeString(value, maxLength = 256) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

// Returns a finite number clamped to [min, max], or undefined when not numeric.
function sanitizeNumber(value, { min = -1e12, max = 1e12 } = {}) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, num));
}

// Group schema: maps output field -> { type, max }. Unknown payload keys are dropped.
const SYSTEM_INFO_SCHEMA = {
  application: {
    productName: { type: "string", max: 256 },
    unityVersion: { type: "string", max: 64 },
    appVersion: { type: "string", max: 64 },
    platform: { type: "string", max: 64 },
    installMode: { type: "string", max: 64 },
    sandboxType: { type: "string", max: 64 },
    buildGUID: { type: "string", max: 128 },
  },
  device: {
    deviceName: { type: "string", max: 256 },
    deviceModel: { type: "string", max: 256 },
    deviceType: { type: "string", max: 64 },
    deviceUniqueIdentifier: { type: "string", max: 256 },
  },
  hardware: {
    cpu: { type: "string", max: 256 },
    cores: { type: "number", min: 0, max: 4096 },
    frequency: { type: "number", min: 0, max: 1e7 },
    systemRam: { type: "number", min: 0, max: 1e9 },
    gpu: { type: "string", max: 256 },
    graphicsMemory: { type: "number", min: 0, max: 1e9 },
    graphicsApi: { type: "string", max: 128 },
  },
  display: {
    resolution: { type: "string", max: 64 },
    windowSize: { type: "string", max: 64 },
    fullscreenMode: { type: "string", max: 64 },
    dpi: { type: "number", min: 0, max: 1e5 },
  },
  runtime: {
    targetFps: { type: "number", min: -1, max: 1e6 },
    vSyncCount: { type: "number", min: 0, max: 16 },
    qualityLevel: { type: "string", max: 128 },
    country: { type: "string", max: 128 },
    generatedOn: { type: "string", max: 64 },
  },
};

// Legacy clients send flat { os, cpu, gpu }. Lift those into the nested shape
// so old payloads keep validating after the expansion.
function normalizeLegacySystemInfo(systemInfo) {
  const isNested = ["application", "device", "hardware", "display", "runtime"].some(
    (group) => systemInfo[group] && typeof systemInfo[group] === "object"
  );
  if (isNested) {
    return systemInfo;
  }

  const normalized = { ...systemInfo, hardware: { ...(systemInfo.hardware || {}) } };
  if (systemInfo.cpu !== undefined && normalized.hardware.cpu === undefined) {
    normalized.hardware.cpu = systemInfo.cpu;
  }
  if (systemInfo.gpu !== undefined && normalized.hardware.gpu === undefined) {
    normalized.hardware.gpu = systemInfo.gpu;
  }
  if (systemInfo.os !== undefined) {
    normalized.application = { platform: systemInfo.os, ...(systemInfo.application || {}) };
  }
  return normalized;
}

// Sanitize any (partial) systemInfo into the nested shape: clamps values,
// drops unknown keys, omits empty groups. Does NOT enforce required fields.
function sanitizePartialSystemInfo(systemInfo) {
  if (!systemInfo || typeof systemInfo !== "object") {
    return {};
  }

  const source = normalizeLegacySystemInfo(systemInfo);
  const result = {};

  for (const [groupName, fields] of Object.entries(SYSTEM_INFO_SCHEMA)) {
    const groupSource = source[groupName];
    if (!groupSource || typeof groupSource !== "object") {
      continue;
    }
    const groupOut = {};
    for (const [field, spec] of Object.entries(fields)) {
      const raw = groupSource[field];
      const value =
        spec.type === "number"
          ? sanitizeNumber(raw, { min: spec.min, max: spec.max })
          : sanitizeString(raw, spec.max);
      if (value !== undefined) {
        groupOut[field] = value;
      }
    }
    if (Object.keys(groupOut).length > 0) {
      result[groupName] = groupOut;
    }
  }

  return result;
}

// Deep-merge per group: overlay `partial` fields onto `existing`. Both are run
// through the sanitizer first, so the output is clean nested systemInfo.
function mergeSystemInfo(existing, partial) {
  const base = sanitizePartialSystemInfo(existing);
  const overlay = sanitizePartialSystemInfo(partial);
  const merged = {};

  for (const groupName of Object.keys(SYSTEM_INFO_SCHEMA)) {
    const combined = { ...(base[groupName] || {}), ...(overlay[groupName] || {}) };
    if (Object.keys(combined).length > 0) {
      merged[groupName] = combined;
    }
  }

  return merged;
}

function validateSystemInfo(systemInfo) {
  if (!systemInfo || typeof systemInfo !== "object") {
    throw new TrialServiceError("Invalid systemInfo", 400, CODES.INVALID_SYSTEM_INFO, "INVALID_SYSTEM_INFO");
  }

  const result = sanitizePartialSystemInfo(systemInfo);

  // Required: hardware.cpu and hardware.gpu (present in both legacy + new payloads).
  if (!result.hardware || !result.hardware.cpu || !result.hardware.gpu) {
    throw new TrialServiceError(
      "systemInfo.hardware.cpu and systemInfo.hardware.gpu are required",
      400,
      CODES.INVALID_SYSTEM_INFO_FIELDS,
      "INVALID_SYSTEM_INFO_FIELDS"
    );
  }

  return result;
}

function validateVerifyTrialInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { projectApiKey, token, deviceId } = payload;
  if (!isNonEmptyString(projectApiKey, 256)) {
    throw new TrialServiceError(
      "Invalid projectApiKey",
      400,
      CODES.INVALID_PROJECT_API_KEY,
      "INVALID_PROJECT_API_KEY"
    );
  }
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }
  if (token !== null && typeof token !== "string") {
    throw new TrialServiceError("Invalid token", 400, CODES.INVALID_TOKEN_FORMAT, "INVALID_TOKEN");
  }
  if (typeof token === "string" && token.length > 4096) {
    throw new TrialServiceError("Invalid token", 400, CODES.INVALID_TOKEN_FORMAT, "INVALID_TOKEN");
  }

  return {
    projectApiKey: projectApiKey.trim(),
    token: typeof token === "string" ? token.trim() : "",
    deviceId: deviceId.trim(),
  };
}

function validateApplicationType(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_APPLICATION_TYPE;
  }
  if (typeof value !== "string" || !APPLICATION_TYPES.includes(value)) {
    throw new TrialServiceError(
      `Invalid applicationType. Allowed: ${APPLICATION_TYPES.join(", ")}`,
      400,
      CODES.INVALID_APPLICATION_TYPE,
      "INVALID_APPLICATION_TYPE"
    );
  }
  return value;
}

function validateAdminProjectInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { name, description, applicationType } = payload;
  if (!isNonEmptyString(name, 120)) {
    throw new TrialServiceError(
      "Invalid project name",
      400,
      CODES.INVALID_PROJECT_NAME,
      "INVALID_PROJECT_NAME"
    );
  }

  return {
    name: name.trim(),
    description: typeof description === "string" ? description.trim().slice(0, 500) : "",
    applicationType: validateApplicationType(applicationType),
  };
}

function validateProjectIdInput(payload) {
  if (!payload || typeof payload !== "object" || !isNonEmptyString(payload.projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  return {
    projectId: payload.projectId.trim(),
  };
}

function validateAdminCreateClientInput(payload) {
  const { projectId } = validateProjectIdInput(payload);
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }
  if (!isNonEmptyString(payload.deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }
  const deviceId = payload.deviceId.trim();
  const systemInfo = validateSystemInfo(payload.systemInfo);
  const normalizedTrialDays = payload.trialDays === undefined ? 7 : Number(payload.trialDays);
  if (!Number.isInteger(normalizedTrialDays) || normalizedTrialDays < 1 || normalizedTrialDays > 365) {
    throw new TrialServiceError(
      "Invalid trialDays. Allowed range: 1-365",
      400,
      CODES.INVALID_TRIAL_DAYS,
      "INVALID_TRIAL_DAYS"
    );
  }

  return {
    projectId,
    deviceId,
    systemInfo,
    trialDays: normalizedTrialDays,
  };
}

function validateAdminDeviceInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }
  if (!isNonEmptyString(payload.deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }
  if (!isNonEmptyString(payload.projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  return { deviceId: payload.deviceId.trim(), projectId: payload.projectId.trim() };
}

function validateAdminExtendInput(payload) {
  const { deviceId, projectId } = validateAdminDeviceInput(payload);
  const extendDays = Number(payload.extendDays);
  if (!Number.isInteger(extendDays) || extendDays < 1 || extendDays > 365) {
    throw new TrialServiceError(
      "Invalid extendDays. Allowed range: 1-365",
      400,
      CODES.INVALID_EXTEND_DAYS,
      "INVALID_EXTEND_DAYS"
    );
  }

  return {
    projectId,
    deviceId,
    extendDays,
  };
}

// Keeps only primitive param values, clamps key/value length, caps count.
// Silently drops anything that doesn't fit rather than rejecting the whole
// request - one malformed param shouldn't lose the rest of the event.
function sanitizeEventParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }

  const out = {};
  const keys = Object.keys(params).slice(0, MAX_EVENT_PARAMS);
  for (const key of keys) {
    const cleanKey = sanitizeString(key, MAX_EVENT_PARAM_NAME_LENGTH);
    if (!cleanKey) {
      continue;
    }
    const raw = params[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[cleanKey] = raw;
    } else if (typeof raw === "boolean") {
      out[cleanKey] = raw;
    } else if (typeof raw === "string") {
      const cleanValue = sanitizeString(raw, MAX_EVENT_PARAM_VALUE_LENGTH);
      if (cleanValue !== undefined) {
        out[cleanKey] = cleanValue;
      }
    }
    // objects/arrays/null/undefined are dropped - keep event params flat.
  }
  return out;
}

function validateLogEventsInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { projectApiKey, deviceId, events } = payload;
  if (!isNonEmptyString(projectApiKey, 256)) {
    throw new TrialServiceError(
      "Invalid projectApiKey",
      400,
      CODES.INVALID_PROJECT_API_KEY,
      "INVALID_PROJECT_API_KEY"
    );
  }
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS_PER_REQUEST) {
    throw new TrialServiceError(
      `events must be a non-empty array of at most ${MAX_EVENTS_PER_REQUEST} items`,
      400,
      CODES.INVALID_EVENTS,
      "INVALID_EVENTS"
    );
  }

  const cleanEvents = events.map((event) => {
    if (!event || typeof event !== "object" || !isNonEmptyString(event.name, MAX_EVENT_NAME_LENGTH)) {
      throw new TrialServiceError(
        `Invalid event name (required, max ${MAX_EVENT_NAME_LENGTH} chars)`,
        400,
        CODES.INVALID_EVENTS,
        "INVALID_EVENTS"
      );
    }
    const clientTimestamp = Number(event.timestamp);
    return {
      name: event.name.trim(),
      params: sanitizeEventParams(event.params),
      clientTimestamp: Number.isFinite(clientTimestamp) ? clientTimestamp : null,
    };
  });

  return {
    projectApiKey: projectApiKey.trim(),
    deviceId: deviceId.trim(),
    events: cleanEvents,
  };
}

function validateAdminListClientsInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }
  const { projectId } = validateProjectIdInput(payload);
  const parsedLimit = payload.limit === undefined ? 100 : Number(payload.limit);
  const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 200 ? parsedLimit : 100;
  const search = isNonEmptyString(payload.search, 256) ? payload.search.trim().toLowerCase() : "";
  return {
    projectId,
    limit,
    search,
  };
}

function buildClientToken(jwtSecret, deviceId, tokenId, projectId, expiresInSeconds, extraClaims = {}) {
  const claims = {
    projectId,
    deviceId,
    tokenId,
  };
  if (extraClaims && typeof extraClaims === "object") {
    if (extraClaims.apiKeyHash) {
      claims.apiKeyHash = String(extraClaims.apiKeyHash).toLowerCase();
    }
    if (Number.isFinite(extraClaims.trialStart)) {
      claims.trialStart = Number(extraClaims.trialStart);
    }
    if (Number.isFinite(extraClaims.trialEnd)) {
      claims.trialEnd = Number(extraClaims.trialEnd);
    }
    if (Number.isFinite(extraClaims.issuedAtMs)) {
      claims.issuedAtMs = Number(extraClaims.issuedAtMs);
    }
  }
  return jwt.sign(claims, getLicensePrivateKeyPem(), {
    algorithm: "RS256",
    expiresIn: Math.max(1, expiresInSeconds),
  });
}

function detectTokenAlgorithm(token) {
  if (typeof token !== "string") return "HS256";
  const parts = token.split(".");
  if (parts.length !== 3) return "HS256";
  try {
    const headerJson = Buffer.from(parts[0], "base64url").toString("utf8");
    const header = JSON.parse(headerJson);
    if (header && header.alg === "RS256") {
      return "RS256";
    }
  } catch (_) {
    // Fallback to HS256
  }
  return "HS256";
}

function verifyClientTokenSignature(token, jwtSecret) {
  const alg = detectTokenAlgorithm(token);
  const verifyKey = alg === "RS256" ? getLicensePublicKeyPem() : jwtSecret;
  try {
    return jwt.verify(token, verifyKey, {
      algorithms: [alg],
    });
  } catch (error) {
    // If the JWT's internal exp passed because an admin extended trialEnd in Firestore
    // after the token was originally minted, verify cryptographic signature with
    // ignoreExpiration: true and let Firestore's data.trialEnd govern expiration.
    if (error && error.name === "TokenExpiredError") {
      return jwt.verify(token, verifyKey, {
        algorithms: [alg],
        ignoreExpiration: true,
      });
    }
    throw error;
  }
}

async function startTrial(payload, options) {
  const { projectApiKey, deviceId, systemInfo } = validateStartTrialInput(payload);
  const jwtSecret = options?.jwtSecret;
  const ip = normalizeIp(options?.ip);

  if (!isNonEmptyString(jwtSecret, 4096)) {
    throw new TrialServiceError(
      "JWT secret is not configured",
      500,
      CODES.MISSING_JWT_SECRET,
      "MISSING_JWT_SECRET"
    );
  }

  const project = await resolveProjectFromApiKey(projectApiKey);
  const apiKeyHash = project.apiKeyHash || hashApiKey(projectApiKey);
  const now = Date.now();
  const trialStart = now;
  const trialEnd = now + TRIAL_DURATION_MS;
  const tokenId = uuidv4();
  const token = buildClientToken(
    jwtSecret,
    deviceId,
    tokenId,
    project.id,
    Math.floor((trialEnd - now) / 1000),
    {
      apiKeyHash,
      trialStart,
      trialEnd,
      issuedAtMs: now,
    }
  );

  const clientDocId = buildClientDocId(project.id, deviceId);
  const docRef = db.collection(CLIENTS_COLLECTION).doc(clientDocId);
  const clientDoc = {
    deviceId,
    projectId: project.id,
    tokenId,
    trialStart,
    trialEnd,
    systemInfo,
    ip,
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await docRef.create(clientDoc);
  } catch (error) {
    if (error?.code === 6 || error?.code === "already-exists") {
      throw new TrialServiceError(
        "Trial already used",
        409,
        CODES.TRIAL_ALREADY_USED,
        "TRIAL_ALREADY_USED"
      );
    }
    throw error;
  }

  notifyNewClient({
    projectName: project.name,
    projectId: project.id,
    deviceId,
    ip,
    systemInfo,
    trialStart,
    trialEnd,
    source: "client",
  });

  return responseBody({
    message: "Trial started successfully",
    token,
    statusCode: CODES.TRIAL_STARTED,
    error: null,
  });
}

// Fire-and-forget admin notification for a newly registered trial. Never throws
// and is intentionally not awaited so email latency/failures cannot affect the
// trial response.
function notifyNewClient(details) {
  const email = emailService.buildNewClientEmail(details);
  emailService.sendAdminNotification(email).catch((error) => {
    console.error("notifyNewClient failed:", error?.message || error);
  });
}

async function verifyTrial(payload, options) {
  const { projectApiKey, token, deviceId } = validateVerifyTrialInput(payload);
  const jwtSecret = options?.jwtSecret;

  if (!isNonEmptyString(jwtSecret, 4096)) {
    throw new TrialServiceError(
      "JWT secret is not configured",
      500,
      CODES.MISSING_JWT_SECRET,
      "MISSING_JWT_SECRET"
    );
  }

  const project = await resolveProjectFromApiKey(projectApiKey);
  const apiKeyHash = project.apiKeyHash || hashApiKey(projectApiKey);
  const docRef = db.collection(CLIENTS_COLLECTION).doc(buildClientDocId(project.id, deviceId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return responseBody({
      message: "Device never registered. Show Start Trial popup.",
      token: "",
      statusCode: CODES.DEVICE_NEVER_REGISTERED,
      error: null,
    });
  }

  const data = snapshot.data();
  if (data.projectId !== project.id) {
    return responseBody({
      message: "Project mismatch",
      token: "",
      statusCode: CODES.PROJECT_MISMATCH,
      error: "PROJECT_MISMATCH",
    });
  }

  docRef.update({ lastOnline: Date.now() }).catch(() => {});

  const trialEnd = Number(data?.trialEnd || 0);
  const trialStart = Number(data?.trialStart || Date.now());
  const now = Date.now();

  if (!Number.isFinite(trialEnd) || trialEnd <= 0) {
    return responseBody({
      message: "Corrupt trial record",
      token: "",
      statusCode: CODES.CORRUPT_TRIAL_RECORD,
      error: "CORRUPT_TRIAL_RECORD",
    });
  }

  if (!token) {
    if (now <= trialEnd) {
      let activeTokenId = data?.tokenId;
      if (!activeTokenId) {
        activeTokenId = uuidv4();
        docRef.update({ tokenId: activeTokenId }).catch(() => {});
      }
      const reissuedToken = buildClientToken(
        jwtSecret,
        deviceId,
        activeTokenId,
        project.id,
        Math.max(1, Math.floor((trialEnd - now) / 1000)),
        {
          apiKeyHash,
          trialStart,
          trialEnd,
          issuedAtMs: now,
        }
      );
      return responseBody({
        message: "Device registered and trial is active. Start Trial popup is not required.",
        token: reissuedToken,
        statusCode: CODES.DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_ACTIVE,
        error: null,
      });
    }

    return responseBody({
      message: "Trial has expired. Contact admin.",
      token: "",
      statusCode: CODES.DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_EXPIRED,
      error: "TRIAL_EXPIRED",
    });
  }

  let decoded;
  try {
    decoded = verifyClientTokenSignature(token, jwtSecret);
  } catch (error) {
    return responseBody({
      message: "Invalid token",
      token: "",
      statusCode: CODES.INVALID_TOKEN,
      error: "INVALID_TOKEN",
    });
  }

  if (decoded.projectId !== project.id) {
    return responseBody({
      message: "Project mismatch",
      token: "",
      statusCode: CODES.PROJECT_MISMATCH,
      error: "PROJECT_MISMATCH",
    });
  }

  if (decoded.deviceId !== deviceId) {
    return responseBody({
      message: "Device mismatch",
      token: "",
      statusCode: CODES.DEVICE_MISMATCH,
      error: "DEVICE_MISMATCH",
    });
  }

  if (!data?.tokenId || decoded.tokenId !== data.tokenId) {
    return responseBody({
      message: "Token revoked or replaced",
      token: "",
      statusCode: CODES.TOKEN_REVOKED_OR_REPLACED,
      error: "TOKEN_REVOKED_OR_REPLACED",
    });
  }

  if (now > trialEnd) {
    return responseBody({
      message: "Trial expired. Contact admin.",
      token: "",
      statusCode: CODES.TRIAL_EXPIRED,
      error: "TRIAL_EXPIRED",
    });
  }

  // If the client's token was a legacy HS256 token or its embedded trialEnd
  // differs from Firestore's current trialEnd (e.g. after adminExtendTrial),
  // mint a fresh RS256 token so the client's local offline cache stays in sync.
  let verifiedToken = token;
  const needsRefresh =
    (typeof token === "string" && token.split(".").length === 3 && !decoded.apiKeyHash) ||
    (decoded.trialEnd !== undefined && Number(decoded.trialEnd) !== trialEnd);

  if (needsRefresh) {
    verifiedToken = buildClientToken(
      jwtSecret,
      deviceId,
      data.tokenId,
      project.id,
      Math.max(1, Math.floor((trialEnd - now) / 1000)),
      {
        apiKeyHash,
        trialStart,
        trialEnd,
        issuedAtMs: now,
      }
    );
  }

  return responseBody({
    message: "Trial verified successfully",
    token: verifiedToken,
    statusCode: CODES.TRIAL_VERIFIED,
    error: null,
  });
}

// Batch-writes analytics events under the device's existing client doc.
// Requires the device to already be a registered client (via startTrial /
// adminCreateClient) - logEvents never creates a client record itself, so a
// forged/unregistered device can't write data now that firestore.rules
// denies direct client access (this function is the only write path).
async function logEvents(payload) {
  const { projectApiKey, deviceId, events } = validateLogEventsInput(payload);

  const project = await resolveProjectFromApiKey(projectApiKey);
  const clientDocId = buildClientDocId(project.id, deviceId);
  const clientRef = db.collection(CLIENTS_COLLECTION).doc(clientDocId);
  const clientSnapshot = await clientRef.get();
  if (!clientSnapshot.exists) {
    throw new TrialServiceError(
      "Device is not a registered client for this project",
      404,
      CODES.CLIENT_NOT_FOUND,
      "CLIENT_NOT_FOUND"
    );
  }

  const batch = db.batch();
  const eventsRef = clientRef.collection(EVENTS_SUBCOLLECTION);
  events.forEach((event) => {
    const eventDocRef = eventsRef.doc();
    batch.create(eventDocRef, {
      name: event.name,
      params: event.params,
      clientTimestamp: event.clientTimestamp,
      receivedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

  clientRef.update({ lastOnline: Date.now() }).catch(() => {});

  return responseBody({
    message: `${events.length} event(s) logged`,
    token: "",
    statusCode: CODES.EVENTS_LOGGED,
    error: null,
    count: events.length,
  });
}

async function adminCreateProject(payload) {
  const { name, description, applicationType } = validateAdminProjectInput(payload);
  const projectId = uuidv4().replace(/-/g, "").slice(0, 12);
  const projectApiKey = crypto.randomBytes(24).toString("hex");
  const apiKeyHash = hashApiKey(projectApiKey);
  const docRef = db.collection(PROJECTS_COLLECTION).doc(projectId);

  const existing = await docRef.get();
  if (existing.exists) {
    throw new TrialServiceError(
      "Project already exists",
      409,
      CODES.PROJECT_ALREADY_EXISTS,
      "PROJECT_ALREADY_EXISTS"
    );
  }

  await docRef.create({
    name,
    description,
    applicationType,
    apiKey: projectApiKey,
    apiKeyHash,
    apiKeyPreview: `${projectApiKey.slice(0, 6)}...${projectApiKey.slice(-4)}`,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  return responseBody({
    message: "Project created successfully",
    token: "",
    statusCode: CODES.ADMIN_PROJECT_CREATED,
    error: null,
    project: {
      projectId,
      name,
      description,
      applicationType,
      active: true,
      projectApiKey,
    },
  });
}

async function adminListProjects() {
  const snapshot = await db.collection(PROJECTS_COLLECTION).get();
  const projects = snapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      projectId: doc.id,
      name: data.name || "",
      description: data.description || "",
      applicationType: data.applicationType || DEFAULT_APPLICATION_TYPE,
      active: Boolean(data.active),
      apiKeyPreview: data.apiKeyPreview || "",
      projectApiKey: data.apiKey || "",
    };
  });

  return responseBody({
    message: "Projects listed successfully",
    token: "",
    statusCode: CODES.ADMIN_PROJECTS_LISTED,
    error: null,
    projects,
  });
}

async function adminListProjectClients(projectId, payload) {
  if (!isNonEmptyString(projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  const project = await getProjectById(projectId.trim());
  if (!project) {
    throw new TrialServiceError("Project not found", 404, CODES.PROJECT_NOT_FOUND, "PROJECT_NOT_FOUND");
  }
  const { limit, search } = validateAdminListClientsInput({ ...payload, projectId: project.id });
  const snapshot = await db
    .collection(CLIENTS_COLLECTION)
    .where("projectId", "==", project.id)
    .limit(limit)
    .get();

  const now = Date.now();
  const clients = snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      const trialEnd = Number(data.trialEnd || 0);
      return {
        deviceId: data.deviceId || "",
        projectId: data.projectId || "",
        trialStart: Number(data.trialStart || 0),
        trialEnd: Number(data.trialEnd || 0),
        ip: data.ip || "",
        systemInfo: data.systemInfo || {},
        status: trialEnd > now ? "active" : "expired",
        lastOnline: data.lastOnline ? Number(data.lastOnline) : null,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
      };
    })
    .filter((item) => (search ? item.deviceId.toLowerCase().includes(search) : true));

  return responseBody({
    message: "Project clients listed successfully",
    token: "",
    statusCode: CODES.ADMIN_PROJECT_CLIENTS_LISTED,
    error: null,
    project: {
      projectId: project.id,
      name: project.name || "",
      description: project.description || "",
      active: Boolean(project.active),
    },
    clients,
  });
}

async function adminCreateClient(payload, options) {
  const { projectId, deviceId, systemInfo, trialDays } = validateAdminCreateClientInput(payload);
  const jwtSecret = options?.jwtSecret;
  const ip = normalizeIp(options?.ip);

  if (!isNonEmptyString(jwtSecret, 4096)) {
    throw new TrialServiceError(
      "JWT secret is not configured",
      500,
      CODES.MISSING_JWT_SECRET,
      "MISSING_JWT_SECRET"
    );
  }

  const project = await getProjectById(projectId);
  if (!project) {
    throw new TrialServiceError("Project not found", 404, CODES.PROJECT_NOT_FOUND, "PROJECT_NOT_FOUND");
  }
  if (!project.active) {
    throw new TrialServiceError("Project is inactive", 403, CODES.PROJECT_INACTIVE, "PROJECT_INACTIVE");
  }

  const apiKeyHash = project.apiKeyHash || (project.apiKey ? hashApiKey(project.apiKey) : "");
  const now = Date.now();
  const trialStart = now;
  const trialEnd = now + trialDays * 24 * 60 * 60 * 1000;
  const tokenId = uuidv4();
  const token = buildClientToken(
    jwtSecret,
    deviceId,
    tokenId,
    project.id,
    Math.floor((trialEnd - now) / 1000),
    {
      apiKeyHash,
      trialStart,
      trialEnd,
      issuedAtMs: now,
    }
  );

  const docRef = db.collection(CLIENTS_COLLECTION).doc(buildClientDocId(project.id, deviceId));
  const clientDoc = {
    deviceId,
    projectId: project.id,
    tokenId,
    trialStart,
    trialEnd,
    systemInfo,
    ip,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin",
  };

  try {
    await docRef.create(clientDoc);
  } catch (error) {
    if (error?.code === 6 || error?.code === "already-exists") {
      throw new TrialServiceError(
        "Trial already exists for this device in this project",
        409,
        CODES.TRIAL_ALREADY_USED,
        "TRIAL_ALREADY_USED"
      );
    }
    throw error;
  }

  notifyNewClient({
    projectName: project.name,
    projectId: project.id,
    deviceId,
    ip,
    systemInfo,
    trialStart,
    trialEnd,
    source: "admin",
  });

  return responseBody({
    message: "Client added and trial created",
    token,
    statusCode: CODES.ADMIN_CLIENT_CREATED,
    error: null,
  });
}

async function adminRevokeTrial(payload) {
  const { deviceId, projectId } = validateAdminDeviceInput(payload);
  const docRef = db.collection(CLIENTS_COLLECTION).doc(buildClientDocId(projectId, deviceId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new TrialServiceError("Trial not found", 404, CODES.TRIAL_NOT_FOUND, "TRIAL_NOT_FOUND");
  }

  await docRef.update({
    trialEnd: Date.now() - 1,
    tokenId: uuidv4(),
    revokedAt: FieldValue.serverTimestamp(),
    revoked: true,
  });

  return responseBody({
    message: "Trial revoked successfully",
    token: "",
    statusCode: CODES.ADMIN_TRIAL_REVOKED,
    error: null,
  });
}

async function adminExtendTrial(payload, options) {
  const { deviceId, projectId, extendDays } = validateAdminExtendInput(payload);
  const docRef = db.collection(CLIENTS_COLLECTION).doc(buildClientDocId(projectId, deviceId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new TrialServiceError("Trial not found", 404, CODES.TRIAL_NOT_FOUND, "TRIAL_NOT_FOUND");
  }

  const data = snapshot.data() || {};
  const now = Date.now();
  const currentEnd = Number(data.trialEnd || 0);
  const base = Number.isFinite(currentEnd) && currentEnd > now ? currentEnd : now;
  const updatedTrialEnd = base + extendDays * 24 * 60 * 60 * 1000;
  const tokenId = data.tokenId && !data.revoked ? data.tokenId : uuidv4();

  await docRef.update({
    trialEnd: updatedTrialEnd,
    tokenId,
    revoked: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  let updatedToken = "";
  if (options?.jwtSecret) {
    try {
      const project = await getProjectById(projectId);
      const apiKeyHash = project?.apiKeyHash || (project?.apiKey ? hashApiKey(project.apiKey) : "");
      updatedToken = buildClientToken(
        options.jwtSecret,
        deviceId,
        tokenId,
        projectId,
        Math.max(1, Math.floor((updatedTrialEnd - now) / 1000)),
        {
          apiKeyHash,
          trialStart: Number(data.trialStart || now),
          trialEnd: updatedTrialEnd,
          issuedAtMs: now,
        }
      );
    } catch (_) {
      updatedToken = "";
    }
  }

  return responseBody({
    message: "Trial extended successfully",
    token: updatedToken,
    statusCode: CODES.ADMIN_TRIAL_EXTENDED,
    error: null,
  });
}

async function adminIssueOfflineLicense(payload, options) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const jwtSecret = options?.jwtSecret || "offline-rs256";
  const ip = normalizeIp(options?.ip);
  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  if (!isNonEmptyString(projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }

  const project = await getProjectById(projectId);
  if (!project) {
    throw new TrialServiceError("Project not found", 404, CODES.PROJECT_NOT_FOUND, "PROJECT_NOT_FOUND");
  }
  if (!project.active) {
    throw new TrialServiceError("Project is inactive", 403, CODES.PROJECT_INACTIVE, "PROJECT_INACTIVE");
  }

  const projectApiKeyHash = String(
    project.apiKeyHash || (project.apiKey ? hashApiKey(project.apiKey) : "")
  ).toLowerCase();

  let reqObj = payload.offlineRequest;
  if (typeof reqObj === "string" && reqObj.trim().length > 0) {
    try {
      reqObj = JSON.parse(reqObj);
    } catch (_) {
      throw new TrialServiceError(
        "Invalid offline request file format",
        400,
        CODES.INVALID_OFFLINE_REQUEST,
        "INVALID_OFFLINE_REQUEST"
      );
    }
  }

  if (reqObj && typeof reqObj === "object") {
    const reqKeyHash = String(
      reqObj.apiKeyHash || (reqObj.projectApiKey ? hashApiKey(reqObj.projectApiKey) : "")
    ).toLowerCase();

    if (reqKeyHash && projectApiKeyHash && reqKeyHash !== projectApiKeyHash) {
      throw new TrialServiceError(
        "Offline request belongs to a different project",
        400,
        CODES.PROJECT_MISMATCH,
        "PROJECT_MISMATCH"
      );
    }

    if (reqObj.requestSignature || reqObj.format === "vcreq-v1") {
      const expectedSig = computeOfflineRequestSignature(
        projectApiKeyHash,
        reqObj.deviceId,
        reqObj.requestedAtUtcMs
      );
      if (
        typeof reqObj.requestSignature !== "string" ||
        reqObj.requestSignature.trim().toLowerCase() !== expectedSig
      ) {
        throw new TrialServiceError(
          "Offline activation request signature is invalid or tampered",
          400,
          CODES.INVALID_OFFLINE_REQUEST,
          "INVALID_OFFLINE_REQUEST"
        );
      }
    }
  }

  const rawDeviceId = payload.deviceId || reqObj?.deviceId;
  if (!isNonEmptyString(rawDeviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }
  const deviceId = rawDeviceId.trim();

  const rawDays = payload.trialDays ?? payload.extendDays;
  let requestedDays = null;
  if (rawDays !== undefined && rawDays !== null && rawDays !== "") {
    const parsedDays = Number(rawDays);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > 3650) {
      throw new TrialServiceError(
        "Invalid trialDays",
        400,
        CODES.INVALID_TRIAL_DAYS,
        "INVALID_TRIAL_DAYS"
      );
    }
    requestedDays = parsedDays;
  }

  const now = Date.now();
  const docRef = db.collection(CLIENTS_COLLECTION).doc(buildClientDocId(project.id, deviceId));
  const snapshot = await docRef.get();

  let trialStart = now;
  let trialEnd = now + (requestedDays || 7) * DAY_MS;
  let tokenId = uuidv4();
  let finalSystemInfo = {};

  const incomingSystemInfoRaw = payload.systemInfo || reqObj?.systemInfo;

  if (!snapshot.exists) {
    finalSystemInfo = incomingSystemInfoRaw
      ? validateSystemInfo(incomingSystemInfoRaw)
      : {
          os: "Windows",
          cpu: "Offline Compute Node",
          gpu: "Standard GPU",
          hardware: { cpu: "Offline Compute Node", gpu: "Standard GPU" },
          system: { os: "Windows" },
        };

    const clientDoc = {
      deviceId,
      projectId: project.id,
      tokenId,
      trialStart,
      trialEnd,
      systemInfo: finalSystemInfo,
      ip: ip !== "unknown" ? ip : "offline-activation",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "admin-offline",
    };

    await docRef.create(clientDoc);

    notifyNewClient({
      projectName: project.name,
      projectId: project.id,
      deviceId,
      ip: clientDoc.ip,
      systemInfo: finalSystemInfo,
      trialStart,
      trialEnd,
      source: "admin",
    });
  } else {
    const existingData = snapshot.data() || {};
    trialStart = Number(existingData.trialStart || now);
    const currentEnd = Number(existingData.trialEnd || 0);
    tokenId = existingData.tokenId && !existingData.revoked ? existingData.tokenId : uuidv4();

    if (requestedDays !== null) {
      const base = Number.isFinite(currentEnd) && currentEnd > now ? currentEnd : now;
      trialEnd = base + requestedDays * DAY_MS;
    } else if (Number.isFinite(currentEnd) && currentEnd > now) {
      trialEnd = currentEnd;
    } else {
      trialEnd = now + 7 * DAY_MS;
    }

    finalSystemInfo = existingData.systemInfo || {};
    if (incomingSystemInfoRaw && typeof incomingSystemInfoRaw === "object") {
      const partial = sanitizePartialSystemInfo(incomingSystemInfoRaw);
      if (Object.keys(partial).length > 0) {
        finalSystemInfo = mergeSystemInfo(finalSystemInfo, partial);
      }
    }

    await docRef.update({
      trialEnd,
      tokenId,
      revoked: false,
      systemInfo: finalSystemInfo,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const token = buildClientToken(
    jwtSecret,
    deviceId,
    tokenId,
    project.id,
    Math.max(1, Math.floor((trialEnd - now) / 1000)),
    {
      apiKeyHash: projectApiKeyHash,
      trialStart,
      trialEnd,
      issuedAtMs: now,
    }
  );

  const licenseFile = {
    format: "vclic-v1",
    projectId: project.id,
    projectName: project.name || "",
    apiKeyHash: projectApiKeyHash,
    deviceId,
    deviceName: finalSystemInfo?.device?.deviceName || "",
    trialStart,
    trialEnd,
    issuedAtUtcMs: now,
    token,
  };

  return responseBody({
    message: "Offline license issued successfully",
    token,
    statusCode: CODES.ADMIN_OFFLINE_LICENSE_ISSUED,
    error: null,
    licenseFile,
    client: {
      deviceId,
      projectId: project.id,
      trialStart,
      trialEnd,
      systemInfo: finalSystemInfo,
      status: "active",
    },
  });
}

async function adminUpdateClientSystemInfo(payload) {
  const { deviceId, projectId } = validateAdminDeviceInput(payload);
  if (!payload.systemInfo || typeof payload.systemInfo !== "object") {
    throw new TrialServiceError("Invalid systemInfo", 400, CODES.INVALID_SYSTEM_INFO, "INVALID_SYSTEM_INFO");
  }

  const partial = sanitizePartialSystemInfo(payload.systemInfo);
  if (Object.keys(partial).length === 0) {
    throw new TrialServiceError(
      "No valid systemInfo fields provided",
      400,
      CODES.INVALID_SYSTEM_INFO_FIELDS,
      "INVALID_SYSTEM_INFO_FIELDS"
    );
  }

  const docRef = db.collection(CLIENTS_COLLECTION).doc(buildClientDocId(projectId, deviceId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new TrialServiceError("Trial not found", 404, CODES.TRIAL_NOT_FOUND, "TRIAL_NOT_FOUND");
  }

  const data = snapshot.data() || {};
  const merged = mergeSystemInfo(data.systemInfo, partial);

  await docRef.update({
    systemInfo: merged,
    systemInfoUpdatedAt: FieldValue.serverTimestamp(),
    systemInfoUpdatedBy: "admin",
  });

  return responseBody({
    message: "Client details updated",
    token: "",
    statusCode: CODES.ADMIN_CLIENT_UPDATED,
    error: null,
    systemInfo: merged,
  });
}

async function adminListClients(payload) {
  const { projectId } = validateProjectIdInput(payload);
  return adminListProjectClients(projectId, payload);
}

async function adminGetNotifications() {
  const now = Date.now();
  const DAY_24H = 24 * 60 * 60 * 1000;
  const DAY_3 = 3 * DAY_MS;

  const projectNames = await loadProjectNameMap();

  const [newSnap, expiringSnap, expiredSnap] = await Promise.all([
    // New clients in last 24h (createdAt is a Firestore Timestamp)
    db.collection(CLIENTS_COLLECTION)
      .where("createdAt", ">", Timestamp.fromMillis(now - DAY_24H))
      .limit(30)
      .get(),
    // Expiring in next 3 days
    db.collection(CLIENTS_COLLECTION)
      .where("trialEnd", ">", now)
      .where("trialEnd", "<=", now + DAY_3)
      .limit(30)
      .get(),
    // Expired in last 24h
    db.collection(CLIENTS_COLLECTION)
      .where("trialEnd", ">", now - DAY_24H)
      .where("trialEnd", "<=", now)
      .limit(30)
      .get(),
  ]);

  const notifications = [];

  newSnap.docs.forEach(doc => {
    const data = doc.data() || {};
    notifications.push({
      id: `new_${doc.id}`,
      type: "NEW_CLIENT",
      deviceId: data.deviceId || "",
      projectId: data.projectId || "",
      projectName: projectNames[data.projectId] || data.projectId || "",
      ip: data.ip || "",
      timestamp: data.createdAt?.toMillis ? data.createdAt.toMillis() : now,
    });
  });

  expiringSnap.docs.forEach(doc => {
    const data = doc.data() || {};
    if (data.revoked) return;
    const trialEnd = Number(data.trialEnd || 0);
    notifications.push({
      id: `expiring_${doc.id}`,
      type: "EXPIRING",
      deviceId: data.deviceId || "",
      projectId: data.projectId || "",
      projectName: projectNames[data.projectId] || data.projectId || "",
      trialEnd,
      timestamp: trialEnd,
    });
  });

  expiredSnap.docs.forEach(doc => {
    const data = doc.data() || {};
    if (data.revoked) return;
    const trialEnd = Number(data.trialEnd || 0);
    notifications.push({
      id: `expired_${doc.id}`,
      type: "EXPIRED",
      deviceId: data.deviceId || "",
      projectId: data.projectId || "",
      projectName: projectNames[data.projectId] || data.projectId || "",
      trialEnd,
      timestamp: trialEnd,
    });
  });

  notifications.sort((a, b) => b.timestamp - a.timestamp);

  return responseBody({
    message: `${notifications.length} notification(s)`,
    token: "",
    statusCode: CODES.ADMIN_CLIENTS_LISTED,
    error: null,
    notifications,
  });
}

async function adminListClientEvents(projectId, deviceId, options = {}) {
  if (!isNonEmptyString(projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }

  const parsedLimit = options.limit === undefined ? 100 : Number(options.limit);
  const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 500 ? parsedLimit : 100;
  const nameFilter = isNonEmptyString(options.name, MAX_EVENT_NAME_LENGTH) ? options.name.trim() : "";

  const clientRef = db
    .collection(CLIENTS_COLLECTION)
    .doc(buildClientDocId(projectId.trim(), deviceId.trim()));
  const clientSnapshot = await clientRef.get();
  if (!clientSnapshot.exists) {
    throw new TrialServiceError(
      "Client not found",
      404,
      CODES.CLIENT_NOT_FOUND,
      "CLIENT_NOT_FOUND"
    );
  }

  let query = clientRef.collection(EVENTS_SUBCOLLECTION).orderBy("receivedAt", "desc").limit(limit);
  if (nameFilter) {
    query = clientRef
      .collection(EVENTS_SUBCOLLECTION)
      .where("name", "==", nameFilter)
      .orderBy("receivedAt", "desc")
      .limit(limit);
  }

  const snapshot = await query.get();
  const events = snapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: data.name || "",
      params: data.params || {},
      clientTimestamp: data.clientTimestamp === null ? null : Number(data.clientTimestamp),
      receivedAt: data.receivedAt?.toMillis ? data.receivedAt.toMillis() : null,
    };
  });

  return responseBody({
    message: `Found ${events.length} event(s)`,
    token: "",
    statusCode: CODES.EVENTS_LOGGED,
    error: null,
    events,
  });
}

// Sequential funnel: for each event name in `steps` (in order), count how
// many devices have at least one event matching AND that event occurs after
// their previous step's event. Read-only, project-scoped.
async function adminFunnel(payload) {
  const { projectId, steps, windowDays } = validateFunnelInput(payload);
  const cutoffMs = Date.now() - windowDays * DAY_MS;

  // 1. All events in window for this project (scoped via collectionGroup).
  const snapshot = await db
    .collectionGroup(EVENTS_SUBCOLLECTION)
    .where("receivedAt", ">", Timestamp.fromMillis(cutoffMs))
    .get();

  // 2. Bucket per device: [{name, timeMs}, ...] sorted ascending.
  const byDevice = new Map();
  snapshot.docs.forEach((doc) => {
    const parentPath = doc.ref.parent.parent?.path || "";                  // clients/{clientDocId}
    const clientDocId = parentPath.split("/")[1] || "";
    const sep = clientDocId.indexOf("__");
    if (sep < 0) return;
    if (clientDocId.slice(0, sep) !== projectId) return;
    const deviceId = clientDocId.slice(sep + 2);
    const data = doc.data() || {};
    const timeMs = data.receivedAt?.toMillis ? data.receivedAt.toMillis() : 0;
    if (!timeMs) return;
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push({ name: data.name || "", timeMs });
  });
  byDevice.forEach((list) => list.sort((a, b) => a.timeMs - b.timeMs));

  // 3. For each device, walk steps in order.
  const stepCounts = new Array(steps.length).fill(0);
  byDevice.forEach((events) => {
    let cursor = 0;
    for (let i = 0; i < steps.length; i += 1) {
      const stepName = steps[i];
      let found = false;
      while (cursor < events.length) {
        if (events[cursor].name === stepName) {
          found = true;
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      if (!found) break;
      stepCounts[i] += 1;
    }
  });

  const startCount = stepCounts[0] || 0;
  const funnelSteps = steps.map((name, index) => {
    const count = stepCounts[index];
    const pctOfStart = startCount === 0 ? 0 : Math.round((count / startCount) * 100);
    const pctOfPrev = index === 0
      ? 100
      : (stepCounts[index - 1] === 0 ? 0 : Math.round((count / stepCounts[index - 1]) * 100));
    return { name, count, pctOfStart, pctOfPrev };
  });

  return responseBody({
    message: "Funnel computed",
    token: "",
    statusCode: CODES.ADMIN_CLIENTS_LISTED,
    error: null,
    projectId,
    windowDays,
    totalDevicesInWindow: byDevice.size,
    steps: funnelSteps,
  });
}

function validateFunnelInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }
  if (!isNonEmptyString(payload.projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  if (!Array.isArray(payload.steps) || payload.steps.length < 2 || payload.steps.length > 8) {
    throw new TrialServiceError(
      "steps must be an array of 2-8 event names",
      400,
      CODES.INVALID_EVENTS,
      "INVALID_EVENTS"
    );
  }
  const steps = payload.steps.map((s) => {
    if (!isNonEmptyString(s, MAX_EVENT_NAME_LENGTH)) {
      throw new TrialServiceError(
        `Invalid step name (max ${MAX_EVENT_NAME_LENGTH} chars)`,
        400,
        CODES.INVALID_EVENTS,
        "INVALID_EVENTS"
      );
    }
    return s.trim();
  });
  const parsedDays = Number(payload.windowDays);
  const windowDays = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 90 ? parsedDays : 30;
  return { projectId: payload.projectId.trim(), steps, windowDays };
}

// D1/D7/D30 return rate by install cohort.
// A device's "install day" = the day of its earliest event (session_start
// preferred, else any event). "Returned on day N" = has any event on
// install_day + N.
async function adminRetention(payload) {
  if (!payload || !isNonEmptyString(payload.projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  const parsedDays = Number(payload.windowDays);
  const windowDays = Number.isInteger(parsedDays) && parsedDays >= 7 && parsedDays <= 60 ? parsedDays : 30;
  const projectId = payload.projectId.trim();
  const cutoffMs = Date.now() - (windowDays + 30) * DAY_MS;

  const snapshot = await db
    .collectionGroup(EVENTS_SUBCOLLECTION)
    .where("receivedAt", ">", Timestamp.fromMillis(cutoffMs))
    .get();

  const byDevice = new Map();                                              // deviceId -> Set<dayKey>
  const installDay = new Map();                                            // deviceId -> earliest dayKey
  snapshot.docs.forEach((doc) => {
    const parentPath = doc.ref.parent.parent?.path || "";
    const clientDocId = parentPath.split("/")[1] || "";
    const sep = clientDocId.indexOf("__");
    if (sep < 0) return;
    if (clientDocId.slice(0, sep) !== projectId) return;
    const deviceId = clientDocId.slice(sep + 2);
    const data = doc.data() || {};
    const timeMs = data.receivedAt?.toMillis ? data.receivedAt.toMillis() : 0;
    if (!timeMs) return;
    const dayKey = new Date(timeMs).toISOString().slice(0, 10);
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, new Set());
    byDevice.get(deviceId).add(dayKey);
    const existing = installDay.get(deviceId);
    if (!existing || dayKey < existing) installDay.set(deviceId, dayKey);
  });

  // Cohort per install day: count of devices, plus how many returned on
  // day+1 / +7 / +30.
  const cohorts = new Map();                                               // dayKey -> {size, d1, d7, d30}
  installDay.forEach((installKey, deviceId) => {
    if (!cohorts.has(installKey)) cohorts.set(installKey, { day: installKey, size: 0, d1: 0, d7: 0, d30: 0 });
    const cohort = cohorts.get(installKey);
    cohort.size += 1;
    const days = byDevice.get(deviceId);
    const install = new Date(installKey + "T00:00:00Z");
    [1, 7, 30].forEach((offset) => {
      const target = new Date(install);
      target.setUTCDate(target.getUTCDate() + offset);
      const targetKey = target.toISOString().slice(0, 10);
      if (days.has(targetKey)) {
        cohort[`d${offset}`] += 1;
      }
    });
  });

  const cohortsList = Array.from(cohorts.values()).sort((a, b) => a.day.localeCompare(b.day));

  return responseBody({
    message: "Retention computed",
    token: "",
    statusCode: CODES.ADMIN_CLIENTS_LISTED,
    error: null,
    projectId,
    windowDays,
    cohorts: cohortsList,
  });
}

// Bucket devices by hardware/country signals from their systemInfo and
// aggregate event counts + error counts per bucket. Read-only.
async function adminHardwareBreakdown(payload) {
  if (!payload || !isNonEmptyString(payload.projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  const projectId = payload.projectId.trim();
  const parsedDays = Number(payload.windowDays);
  const windowDays = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 90 ? parsedDays : 30;
  const cutoffMs = Date.now() - windowDays * DAY_MS;

  // 1. All clients for this project.
  const clientsSnapshot = await db
    .collection(CLIENTS_COLLECTION)
    .where("projectId", "==", projectId)
    .limit(1000)
    .get();

  const clientInfo = new Map();                                            // deviceId -> {gpu, cpu, os, country}
  clientsSnapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const si = data.systemInfo || {};
    clientInfo.set(data.deviceId || "", {
      gpu: si.hardware?.gpu || "Unknown",
      cpu: si.hardware?.cpu || "Unknown",
      os: si.application?.platform || "Unknown",
      country: (si.runtime?.country || "Unknown").replace(/\s*\(local\)\s*$/i, "").trim() || "Unknown",
    });
  });

  // 2. Events window.
  const eventsSnapshot = await db
    .collectionGroup(EVENTS_SUBCOLLECTION)
    .where("receivedAt", ">", Timestamp.fromMillis(cutoffMs))
    .get();

  const buckets = { gpu: {}, cpu: {}, os: {}, country: {} };
  const errorBuckets = { gpu: {}, cpu: {}, os: {}, country: {} };

  eventsSnapshot.docs.forEach((doc) => {
    const parentPath = doc.ref.parent.parent?.path || "";
    const clientDocId = parentPath.split("/")[1] || "";
    const sep = clientDocId.indexOf("__");
    if (sep < 0) return;
    if (clientDocId.slice(0, sep) !== projectId) return;
    const deviceId = clientDocId.slice(sep + 2);
    const info = clientInfo.get(deviceId);
    if (!info) return;
    const data = doc.data() || {};
    const name = data.name || "";
    const isError = name === "error_reported" || name === "exception_caught" || name === "kiosk_hardware_fault";

    ["gpu", "cpu", "os", "country"].forEach((facet) => {
      const key = info[facet];
      buckets[facet][key] = (buckets[facet][key] || 0) + 1;
      if (isError) errorBuckets[facet][key] = (errorBuckets[facet][key] || 0) + 1;
    });
  });

  function topN(obj, n = 10) {
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
  }

  return responseBody({
    message: "Hardware breakdown computed",
    token: "",
    statusCode: CODES.ADMIN_CLIENTS_LISTED,
    error: null,
    projectId,
    windowDays,
    activity: {
      gpu: topN(buckets.gpu),
      cpu: topN(buckets.cpu),
      os: topN(buckets.os),
      country: topN(buckets.country),
    },
    errors: {
      gpu: topN(errorBuckets.gpu),
      cpu: topN(errorBuckets.cpu),
      os: topN(errorBuckets.os),
      country: topN(errorBuckets.country),
    },
  });
}

// Recent events across every device in a project (for the live-tail page).
async function adminRecentEvents(projectId, sinceMs, limit) {
  if (!isNonEmptyString(projectId, 120)) {
    throw new TrialServiceError("Invalid projectId", 400, CODES.INVALID_PROJECT_ID, "INVALID_PROJECT_ID");
  }
  const cap = Math.min(500, Math.max(1, Number(limit) || 200));
  const cutoffMs = Number.isFinite(sinceMs) && sinceMs > 0 ? sinceMs : Date.now() - 5 * 60 * 1000;

  const snapshot = await db
    .collectionGroup(EVENTS_SUBCOLLECTION)
    .where("receivedAt", ">", Timestamp.fromMillis(cutoffMs))
    .orderBy("receivedAt", "desc")
    .limit(cap * 3)                                                        // over-fetch since we still have to filter by project
    .get();

  const events = [];
  for (const doc of snapshot.docs) {
    if (events.length >= cap) break;
    const parentPath = doc.ref.parent.parent?.path || "";
    const clientDocId = parentPath.split("/")[1] || "";
    const sep = clientDocId.indexOf("__");
    if (sep < 0) continue;
    if (clientDocId.slice(0, sep) !== projectId.trim()) continue;
    const deviceId = clientDocId.slice(sep + 2);
    const data = doc.data() || {};
    events.push({
      id: doc.id,
      deviceId,
      name: data.name || "",
      params: data.params || {},
      clientTimestamp: data.clientTimestamp === null ? null : Number(data.clientTimestamp),
      receivedAt: data.receivedAt?.toMillis ? data.receivedAt.toMillis() : null,
    });
  }

  return responseBody({
    message: `${events.length} event(s)`,
    token: "",
    statusCode: CODES.EVENTS_LOGGED,
    error: null,
    events,
  });
}

async function adminSearchAllClients(query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) {
    return responseBody({ message: 'Query too short', token: '', statusCode: CODES.ADMIN_CLIENTS_LISTED, error: null, clients: [], query: q });
  }

  const projectNames = await loadProjectNameMap();
  const snapshot = await db.collection(CLIENTS_COLLECTION).limit(500).get();
  const now = Date.now();

  const clients = snapshot.docs
    .map(doc => {
      const data = doc.data() || {};
      const si = data.systemInfo || {};
      const hw = si.hardware || {};
      const dev = si.device || {};
      const runtime = si.runtime || {};
      const app = si.application || {};
      const trialEnd = Number(data.trialEnd || 0);

      const searchable = [
        data.deviceId || '', data.ip || '',
        hw.cpu || '', hw.gpu || '',
        dev.deviceName || '', dev.deviceModel || '',
        runtime.country || '', app.platform || '',
        si.os || '', si.cpu || '', si.gpu || '',
        data.projectId || '', projectNames[data.projectId] || '',
      ].join('\n').toLowerCase();

      if (!searchable.includes(q)) return null;

      return {
        deviceId: data.deviceId || '',
        projectId: data.projectId || '',
        projectName: projectNames[data.projectId] || data.projectId || '',
        trialStart: Number(data.trialStart || 0),
        trialEnd,
        ip: data.ip || '',
        systemInfo: data.systemInfo || {},
        status: data.revoked ? 'revoked' : trialEnd > now ? 'active' : 'expired',
        lastOnline: data.lastOnline ? Number(data.lastOnline) : null,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
      };
    })
    .filter(Boolean);

  return responseBody({ message: `Found ${clients.length} client(s)`, token: '', statusCode: CODES.ADMIN_CLIENTS_LISTED, error: null, clients, query: q });
}

// Build a projectId -> name map so digest emails can show friendly names.
async function loadProjectNameMap() {
  const snapshot = await db.collection(PROJECTS_COLLECTION).get();
  const map = {};
  snapshot.docs.forEach((doc) => {
    map[doc.id] = (doc.data() || {}).name || doc.id;
  });
  return map;
}

function mapClientForDigest(doc, projectNames) {
  const data = doc.data() || {};
  return {
    ref: doc.ref,
    deviceId: data.deviceId || "",
    projectId: data.projectId || "",
    projectName: projectNames[data.projectId] || data.projectId || "",
    trialEnd: Number(data.trialEnd || 0),
    revoked: Boolean(data.revoked),
    expiringNotifiedAt: data.expiringNotifiedAt || null,
    expiredNotifiedAt: data.expiredNotifiedAt || null,
  };
}

/**
 * Daily scan that emails admins about trials expiring within the next 3 days
 * and trials that have recently expired. Per-document marker fields
 * (`expiringNotifiedAt` / `expiredNotifiedAt`) make repeat runs idempotent so
 * the same trial is never reported twice. Revoked trials are skipped (those are
 * deliberate admin actions, not lapses).
 *
 * @returns {Promise<{expiringCount: number, expiredCount: number}>}
 */
async function runTrialExpiryScan(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const projectNames = await loadProjectNameMap();

  // Expiring soon: trialEnd in (now, now + window]. Single-field range query.
  const expiringSnap = await db
    .collection(CLIENTS_COLLECTION)
    .where("trialEnd", ">", now)
    .where("trialEnd", "<=", now + EXPIRING_SOON_WINDOW_MS)
    .get();

  // Recently expired: trialEnd in (now - window, now]. Bounding the lower edge
  // keeps the scan small; the marker field prevents missed/duplicate sends.
  const expiredSnap = await db
    .collection(CLIENTS_COLLECTION)
    .where("trialEnd", ">", now - EXPIRING_SOON_WINDOW_MS)
    .where("trialEnd", "<=", now)
    .get();

  const expiring = expiringSnap.docs
    .map((doc) => mapClientForDigest(doc, projectNames))
    .filter((c) => !c.revoked && !c.expiringNotifiedAt);

  const expired = expiredSnap.docs
    .map((doc) => mapClientForDigest(doc, projectNames))
    .filter((c) => !c.revoked && !c.expiredNotifiedAt);

  if (expiring.length > 0) {
    const email = emailService.buildExpiringEmail(expiring);
    const result = await emailService.sendAdminNotification(email);
    if (result.status !== "error") {
      const batch = db.batch();
      expiring.forEach((c) => batch.update(c.ref, { expiringNotifiedAt: FieldValue.serverTimestamp() }));
      await batch.commit();
    }
  }

  if (expired.length > 0) {
    const email = emailService.buildExpiredEmail(expired);
    const result = await emailService.sendAdminNotification(email);
    if (result.status !== "error") {
      const batch = db.batch();
      expired.forEach((c) => batch.update(c.ref, { expiredNotifiedAt: FieldValue.serverTimestamp() }));
      await batch.commit();
    }
  }

  console.log(`Trial expiry scan complete: ${expiring.length} expiring, ${expired.length} expired`);
  return { expiringCount: expiring.length, expiredCount: expired.length };
}

module.exports = {
  CODES,
  TrialServiceError,
  responseBody,
  computeOfflineRequestSignature,
  adminCreateClient,
  adminCreateProject,
  adminExtendTrial,
  adminIssueOfflineLicense,
  adminListClients,
  adminGetNotifications,
  adminListClientEvents,
  adminListProjectClients,
  adminListProjects,
  adminRevokeTrial,
  adminSearchAllClients,
  adminUpdateClientSystemInfo,
  adminFunnel,
  adminRetention,
  adminHardwareBreakdown,
  adminRecentEvents,
  startTrial,
  verifyTrial,
  logEvents,
  runTrialExpiryScan,
};
