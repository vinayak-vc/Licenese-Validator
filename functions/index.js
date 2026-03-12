"use strict";

const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { TrialServiceError, startTrial, verifyTrial } = require("./trialService");

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
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
  }

  console.error("Unhandled error:", error);
  return res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}

function createBaseApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  return app;
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
  res.status(405).json({
    error: "Method not allowed",
    code: "METHOD_NOT_ALLOWED",
  });
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
  res.status(405).json({
    error: "Method not allowed",
    code: "METHOD_NOT_ALLOWED",
  });
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
