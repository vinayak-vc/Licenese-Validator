"use strict";

const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { admin } = require("./firebase");
const {
  CODES,
  TrialServiceError,
  responseBody,
  adminCreateClient,
  adminExtendTrial,
  adminListClients,
  adminRevokeTrial,
  startTrial,
  verifyTrial,
} = require("./trialService");

const JWT_SECRET = defineSecret("JWT_SECRET");

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function sendError(res, error) {
  if (error instanceof TrialServiceError) {
    return res.status(error.httpStatus).json(
      responseBody({
        message: error.message,
        token: "",
        statusCode: error.statusCode,
        error: error.error,
      })
    );
  }

  console.error("Unhandled error:", error);
  return res.status(500).json(
    responseBody({
      message: "Internal server error",
      token: "",
      statusCode: CODES.INTERNAL_ERROR,
      error: "INTERNAL_ERROR",
    })
  );
}

function createBaseApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  return app;
}

async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      throw new TrialServiceError(
        "Missing Bearer token",
        401,
        CODES.UNAUTHORIZED,
        "UNAUTHORIZED"
      );
    }

    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) {
      throw new TrialServiceError(
        "Missing Bearer token",
        401,
        CODES.UNAUTHORIZED,
        "UNAUTHORIZED"
      );
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded.admin) {
      throw new TrialServiceError(
        "Admin privileges required",
        403,
        CODES.FORBIDDEN,
        "FORBIDDEN"
      );
    }

    req.adminUser = {
      uid: decoded.uid,
      email: decoded.email || "",
    };
    return next();
  } catch (error) {
    return sendError(res, error);
  }
}

const startTrialApp = createBaseApp();
startTrialApp.post("/", async (req, res) => {
  try {
    const jwtSecret = JWT_SECRET.value() || process.env.JWT_SECRET;
    const result = await startTrial(req.body, {
      jwtSecret,
      ip: getRequestIp(req),
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

startTrialApp.all("*", (req, res) => {
  res.status(405).json(
    responseBody({
      message: "Method not allowed",
      token: "",
      statusCode: 4050,
      error: "METHOD_NOT_ALLOWED",
    })
  );
});

const verifyTrialApp = createBaseApp();
verifyTrialApp.post("/", async (req, res) => {
  try {
    const jwtSecret = JWT_SECRET.value() || process.env.JWT_SECRET;
    const result = await verifyTrial(req.body, {
      jwtSecret,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

verifyTrialApp.all("*", (req, res) => {
  res.status(405).json(
    responseBody({
      message: "Method not allowed",
      token: "",
      statusCode: 4050,
      error: "METHOD_NOT_ALLOWED",
    })
  );
});

exports.startTrial = onRequest(
  {
    cors: true,
    region: "us-central1",
    secrets: [JWT_SECRET],
  },
  startTrialApp
);

exports.verifyTrial = onRequest(
  {
    cors: true,
    region: "us-central1",
    secrets: [JWT_SECRET],
  },
  verifyTrialApp
);

const adminApp = createBaseApp();
adminApp.use(requireAdmin);

adminApp.post("/createClient", async (req, res) => {
  try {
    const jwtSecret = JWT_SECRET.value() || process.env.JWT_SECRET;
    const result = await adminCreateClient(req.body, {
      jwtSecret,
      ip: getRequestIp(req),
      adminUser: req.adminUser,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

adminApp.post("/revokeTrial", async (req, res) => {
  try {
    const result = await adminRevokeTrial(req.body, {
      adminUser: req.adminUser,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

adminApp.post("/extendTrial", async (req, res) => {
  try {
    const result = await adminExtendTrial(req.body, {
      adminUser: req.adminUser,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

adminApp.post("/listClients", async (req, res) => {
  try {
    const result = await adminListClients(req.body, {
      adminUser: req.adminUser,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

adminApp.all("*", (req, res) => {
  res.status(405).json(
    responseBody({
      message: "Method not allowed",
      token: "",
      statusCode: 4050,
      error: "METHOD_NOT_ALLOWED",
    })
  );
});

exports.adminApi = onRequest(
  {
    cors: true,
    region: "us-central1",
    secrets: [JWT_SECRET],
  },
  adminApp
);
