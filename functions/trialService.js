"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebase");

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECTS_COLLECTION = "projects";
const CLIENTS_COLLECTION = "clients";

const CODES = {
  TRIAL_STARTED: "1000",
  TRIAL_VERIFIED: "1001",
  ADMIN_CLIENT_CREATED: "1100",
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
  UNAUTHORIZED: "4030",
  FORBIDDEN: "4031",
  MISSING_JWT_SECRET: "5001",
  INTERNAL_ERROR: "5000",
  METHOD_NOT_ALLOWED: "4050",
};

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

function validateSystemInfo(systemInfo) {
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
    os: os.trim(),
    cpu: cpu.trim(),
    gpu: gpu.trim(),
  };
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

function validateAdminProjectInput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TrialServiceError("Invalid request body", 400, CODES.INVALID_BODY, "INVALID_BODY");
  }

  const { name, description } = payload;
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

function buildClientToken(jwtSecret, deviceId, tokenId, projectId, expiresInSeconds) {
  return jwt.sign(
    {
      projectId,
      deviceId,
      tokenId,
    },
    jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: Math.max(1, expiresInSeconds),
    }
  );
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
  const now = Date.now();
  const trialStart = now;
  const trialEnd = now + TRIAL_DURATION_MS;
  const tokenId = uuidv4();
  const token = buildClientToken(
    jwtSecret,
    deviceId,
    tokenId,
    project.id,
    Math.floor((trialEnd - now) / 1000)
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

  return responseBody({
    message: "Trial started successfully",
    token,
    statusCode: CODES.TRIAL_STARTED,
    error: null,
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

  return responseBody({
    message: "Trial verified successfully",
    token,
    statusCode: CODES.TRIAL_VERIFIED,
    error: null,
  });
}

async function adminCreateProject(payload) {
  const { name, description } = validateAdminProjectInput(payload);
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

  const now = Date.now();
  const trialStart = now;
  const trialEnd = now + trialDays * 24 * 60 * 60 * 1000;
  const tokenId = uuidv4();
  const token = buildClientToken(
    jwtSecret,
    deviceId,
    tokenId,
    project.id,
    Math.floor((trialEnd - now) / 1000)
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

async function adminExtendTrial(payload) {
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

async function adminListClients(payload) {
  const { projectId } = validateProjectIdInput(payload);
  return adminListProjectClients(projectId, payload);
}

module.exports = {
  CODES,
  TrialServiceError,
  responseBody,
  adminCreateClient,
  adminCreateProject,
  adminExtendTrial,
  adminListClients,
  adminListProjectClients,
  adminListProjects,
  adminRevokeTrial,
  startTrial,
  verifyTrial,
};
