"use strict";

const request = require("supertest");

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({
    value: jest.fn(() => "mock-secret"),
  })),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onRequest: jest.fn((options, app) => app),
}));

jest.mock("../trialService", () => {
  class TrialServiceError extends Error {
    constructor(message, httpStatus, statusCode, error) {
      super(message);
      this.httpStatus = httpStatus;
      this.statusCode = statusCode;
      this.error = error;
    }
  }

  return {
    CODES: {
      INTERNAL_ERROR: 5000,
    },
    TrialServiceError,
    responseBody: jest.fn(({ message, token = "", statusCode, error = null }) => ({
      message,
      token,
      statusCode,
      error,
    })),
    startTrial: jest.fn(),
    verifyTrial: jest.fn(),
  };
});

const trialService = require("../trialService");
const functionsExports = require("../index");

describe("index HTTP handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST /startTrial returns standardized response", async () => {
    trialService.startTrial.mockResolvedValue({
      message: "Trial started successfully",
      token: "jwt-token",
      statusCode: 1000,
      error: null,
    });

    const res = await request(functionsExports.startTrial).post("/").send({
      deviceId: "device-1",
      systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Trial started successfully",
      token: "jwt-token",
      statusCode: 1000,
      error: null,
    });
  });

  it("GET /startTrial returns standardized method-not-allowed response", async () => {
    const res = await request(functionsExports.startTrial).get("/");
    expect(res.status).toBe(405);
    expect(res.body).toEqual({
      message: "Method not allowed",
      token: "",
      statusCode: 4050,
      error: "METHOD_NOT_ALLOWED",
    });
  });

  it("maps TrialServiceError to standardized response", async () => {
    trialService.startTrial.mockRejectedValue(
      new trialService.TrialServiceError("Trial already used", 409, 4009, "TRIAL_ALREADY_USED")
    );

    const res = await request(functionsExports.startTrial).post("/").send({
      deviceId: "device-1",
      systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: "Trial already used",
      token: "",
      statusCode: 4009,
      error: "TRIAL_ALREADY_USED",
    });
  });

  it("POST /verifyTrial returns standardized response", async () => {
    trialService.verifyTrial.mockResolvedValue({
      message: "Device never registered. Show Start Trial popup.",
      token: "",
      statusCode: 9999,
      error: null,
    });

    const res = await request(functionsExports.verifyTrial).post("/").send({
      token: "",
      deviceId: "device-1",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Device never registered. Show Start Trial popup.",
      token: "",
      statusCode: 9999,
      error: null,
    });
  });
});
