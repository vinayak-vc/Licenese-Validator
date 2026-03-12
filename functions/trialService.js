"use strict";

const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebase");

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TRIALS_COLLECTION = "trials";

const CODES = {
  TRIAL_STARTED: 1000,
  TRIAL_VERIFIED: 1001,
  ADMIN_CLIENT_CREATED: 1100,
  ADMIN_TRIAL_REVOKED: 1101,
  ADMIN_TRIAL_EXTENDED: 1102,
  DEVICE_NEVER_REGISTERED: 9999,
  DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_ACTIVE: 8888,
  DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_EXPIRED: 7777,
  INVALID_TOKEN: 7001,
  DEVICE_MISMATCH: 7002,
  TOKEN_REVOKED_OR_REPLACED: 7003,
  TRIAL_EXPIRED: 7004,
  CORRUPT_TRIAL_RECORD: 7005,
  TRIAL_NOT_FOUND: 7006,
  TRIAL_ALREADY_USED: 4009,
  INVALID_BODY: 4000,
  INVALID_DEVICE_ID: 4001,
  INVALID_SYSTEM_INFO: 4002,
  INVALID_SYSTEM_INFO_FIELDS: 4003,
  INVALID_TOKEN_FORMAT: 4004,
  INVALID_TRIAL_DAYS: 4010,
  INVALID_EXTEND_DAYS: 4011,
  UNAUTHORIZED: 4030,
  FORBIDDEN: 4031,
  MISSING_JWT_SECRET: 5001,
  INTERNAL_ERROR: 5000,
};

class TrialServiceError extends Error {
  constructor(message, httpStatus, statusCode, error) {
    super(message);
    this.name = "TrialServiceError";
    this.httpStatus = httpStatus;
    this.statusCode = statusCode;
    this.error = error;
  }
}

function responseBody({ message, token = "", statusCode, error = null }) {
  return {
    message,
    token,
    statusCode,
    error,
  };
}

function isNonEmptyString(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function validateStartTrialInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { deviceId, systemInfo } = payload;
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }

  if (!systemInfo || typeof systemInfo !== "object") {
    throw new TrialServiceError("Invalid systemInfo", 400, CODES.INVALID_SYSTEM_INFO, "INVALID_SYSTEM_INFO");
  }

  const { os, cpu, gpu } = systemInfo;
  if (!isNonEmptyString(os, 256) || !isNonEmptyString(cpu, 256) || !isNonEmptyString(gpu, 256)) {
    throw new TrialServiceError(
      "systemInfo.os, systemInfo.cpu, and systemInfo.gpu are required",
      400,
      CODES.INVALID_SYSTEM_INFO_FIELDS,
      "INVALID_SYSTEM_INFO_FIELDS"
    );
  }

  return {
    deviceId: deviceId.trim(),
    systemInfo: {
      os: os.trim(),
      cpu: cpu.trim(),
      gpu: gpu.trim(),
    },
  };
}

function validateVerifyTrialInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { token, deviceId } = payload;
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, CODES.INVALID_DEVICE_ID, "INVALID_DEVICE_ID");
  }

  // Allow null/empty token for first-run device state checks.
  if (token !== null && typeof token !== "string") {
    throw new TrialServiceError("Invalid token", 400, CODES.INVALID_TOKEN_FORMAT, "INVALID_TOKEN");
  }
  if (typeof token === "string" && token.length > 4096) {
    throw new TrialServiceError("Invalid token", 400, CODES.INVALID_TOKEN_FORMAT, "INVALID_TOKEN");
  }

  return {
    token: typeof token === "string" ? token.trim() : "",
    deviceId: deviceId.trim(),
  };
}

function validateAdminCreateClientInput(payload) {
  const { deviceId, systemInfo, trialDays } = validateStartTrialInput(payload);
  const normalizedTrialDays = trialDays === undefined ? 7 : Number(trialDays);
  if (!Number.isInteger(normalizedTrialDays) || normalizedTrialDays < 1 || normalizedTrialDays > 365) {
    throw new TrialServiceError(
      "Invalid trialDays. Allowed range: 1-365",
      400,
      CODES.INVALID_TRIAL_DAYS,
      "INVALID_TRIAL_DAYS"
    );
  }

  return {
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
  return { deviceId: payload.deviceId.trim() };
}

function validateAdminExtendInput(payload) {
  const { deviceId } = validateAdminDeviceInput(payload);
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
    deviceId,
    extendDays,
  };
}

function normalizeIp(ipAddress) {
  if (!ipAddress || typeof ipAddress !== "string") {
    return "unknown";
  }
  return ipAddress.split(",")[0].trim() || "unknown";
}

async function startTrial(payload, options) {
  const { deviceId, systemInfo } = validateStartTrialInput(payload);
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

  const now = Date.now();
  const trialStart = now;
  const trialEnd = now + TRIAL_DURATION_MS;
  const tokenId = uuidv4();

  const token = jwt.sign(
    {
      deviceId,
      tokenId,
    },
    jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: Math.max(1, Math.floor((trialEnd - now) / 1000)),
    }
  );

  const docRef = db.collection(TRIALS_COLLECTION).doc(deviceId);
  const trialDoc = {
    deviceId,
    tokenId,
    trialStart,
    trialEnd,
    systemInfo,
    ip,
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await docRef.create(trialDoc);
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

  return responseBody({
    message: "Trial started successfully",
    token,
    statusCode: CODES.TRIAL_STARTED,
    error: null,
  });
}

async function verifyTrial(payload, options) {
  const { token, deviceId } = validateVerifyTrialInput(payload);
  const jwtSecret = options?.jwtSecret;

  if (!isNonEmptyString(jwtSecret, 4096)) {
    throw new TrialServiceError(
      "JWT secret is not configured",
      500,
      CODES.MISSING_JWT_SECRET,
      "MISSING_JWT_SECRET"
    );
  }

  const docRef = db.collection(TRIALS_COLLECTION).doc(deviceId);
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
  const trialEnd = Number(data?.trialEnd || 0);
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
      return responseBody({
        message: "Device registered and trial is active. Start Trial popup is not required.",
        token: "",
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
    decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    return responseBody({
      message: "Invalid token",
      token: "",
      statusCode: CODES.INVALID_TOKEN,
      error: "INVALID_TOKEN",
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

  return responseBody({
    message: "Trial verified successfully",
    token,
    statusCode: CODES.TRIAL_VERIFIED,
    error: null,
  });
}

async function adminCreateClient(payload, options) {
  const { deviceId, systemInfo, trialDays } = validateAdminCreateClientInput(payload);
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

  const now = Date.now();
  const trialStart = now;
  const trialEnd = now + trialDays * 24 * 60 * 60 * 1000;
  const tokenId = uuidv4();

  const token = jwt.sign(
    {
      deviceId,
      tokenId,
    },
    jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: Math.max(1, Math.floor((trialEnd - now) / 1000)),
    }
  );

  const docRef = db.collection(TRIALS_COLLECTION).doc(deviceId);
  const trialDoc = {
    deviceId,
    tokenId,
    trialStart,
    trialEnd,
    systemInfo,
    ip,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin",
  };

  try {
    await docRef.create(trialDoc);
  } catch (error) {
    if (error?.code === 6 || error?.code === "already-exists") {
      throw new TrialServiceError(
        "Trial already exists for this device",
        409,
        CODES.TRIAL_ALREADY_USED,
        "TRIAL_ALREADY_USED"
      );
    }
    throw error;
  }

  return responseBody({
    message: "Client added and trial created",
    token,
    statusCode: CODES.ADMIN_CLIENT_CREATED,
    error: null,
  });
}

async function adminRevokeTrial(payload) {
  const { deviceId } = validateAdminDeviceInput(payload);
  const docRef = db.collection(TRIALS_COLLECTION).doc(deviceId);
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

async function adminExtendTrial(payload) {
  const { deviceId, extendDays } = validateAdminExtendInput(payload);
  const docRef = db.collection(TRIALS_COLLECTION).doc(deviceId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new TrialServiceError("Trial not found", 404, CODES.TRIAL_NOT_FOUND, "TRIAL_NOT_FOUND");
  }

  const data = snapshot.data() || {};
  const now = Date.now();
  const currentEnd = Number(data.trialEnd || 0);
  const base = Number.isFinite(currentEnd) && currentEnd > now ? currentEnd : now;
  const updatedTrialEnd = base + extendDays * 24 * 60 * 60 * 1000;

  await docRef.update({
    trialEnd: updatedTrialEnd,
    revoked: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return responseBody({
    message: "Trial extended successfully",
    token: "",
    statusCode: CODES.ADMIN_TRIAL_EXTENDED,
    error: null,
  });
}

module.exports = {
  CODES,
  TrialServiceError,
  responseBody,
  adminCreateClient,
  adminExtendTrial,
  adminRevokeTrial,
  startTrial,
  verifyTrial,
};
