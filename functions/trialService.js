"use strict";

const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebase");

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TRIALS_COLLECTION = "trials";

class TrialServiceError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = "TrialServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
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
    throw new TrialServiceError("Invalid request body", 400, "INVALID_BODY");
  }

  const { deviceId, systemInfo } = payload;
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, "INVALID_DEVICE_ID");
  }

  if (!systemInfo || typeof systemInfo !== "object") {
    throw new TrialServiceError("Invalid systemInfo", 400, "INVALID_SYSTEM_INFO");
  }

  const { os, cpu, gpu } = systemInfo;
  if (!isNonEmptyString(os, 256) || !isNonEmptyString(cpu, 256) || !isNonEmptyString(gpu, 256)) {
    throw new TrialServiceError(
      "systemInfo.os, systemInfo.cpu, and systemInfo.gpu are required",
      400,
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
    throw new TrialServiceError("Invalid request body", 400, "INVALID_BODY");
  }

  const { token, deviceId } = payload;
  if (!isNonEmptyString(deviceId, 256)) {
    throw new TrialServiceError("Invalid deviceId", 400, "INVALID_DEVICE_ID");
  }
  if (typeof token !== "string") {
    throw new TrialServiceError("Invalid token", 400, "INVALID_TOKEN");
  }
  if (token.length > 4096) {
    throw new TrialServiceError("Invalid token", 400, "INVALID_TOKEN");
  }

  return {
    token: token.trim(),
    deviceId: deviceId.trim(),
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
    throw new TrialServiceError("JWT secret is not configured", 500, "MISSING_JWT_SECRET");
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
      throw new TrialServiceError("Trial already used", 409, "TRIAL_ALREADY_USED");
    }
    throw error;
  }

  return {
    token,
    trialEnd,
  };
}

async function verifyTrial(payload, options) {
  const { token, deviceId } = validateVerifyTrialInput(payload);
  const jwtSecret = options?.jwtSecret;

  if (!isNonEmptyString(jwtSecret, 4096)) {
    throw new TrialServiceError("JWT secret is not configured", 500, "MISSING_JWT_SECRET");
  }

  const docRef = db.collection(TRIALS_COLLECTION).doc(deviceId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return {
      valid: false,
      trialEnd: 0,
      reason: "Trial record not found",
    };
  }

  const data = snapshot.data();
  const trialEnd = Number(data?.trialEnd || 0);

  if (!token) {
    return {
      valid: false,
      trialEnd,
      reason: "Token required",
    };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    return {
      valid: false,
      trialEnd,
      reason: "Invalid token",
    };
  }

  if (decoded.deviceId !== deviceId) {
    return {
      valid: false,
      trialEnd,
      reason: "Device mismatch",
    };
  }

  if (!data?.tokenId || decoded.tokenId !== data.tokenId) {
    return {
      valid: false,
      trialEnd,
      reason: "Token revoked or replaced",
    };
  }

  if (!Number.isFinite(trialEnd) || trialEnd <= 0) {
    return {
      valid: false,
      trialEnd: 0,
      reason: "Corrupt trial record",
    };
  }

  if (Date.now() > trialEnd) {
    return {
      valid: false,
      trialEnd,
      reason: "Trial expired",
    };
  }

  return {
    valid: true,
    trialEnd,
    reason: "Trial valid",
  };
}

module.exports = {
  TrialServiceError,
  startTrial,
  verifyTrial,
};
