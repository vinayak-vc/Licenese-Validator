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
    constructor(message, statusCode, code) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }

  return {
    TrialServiceError,
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

  it("POST /startTrial returns service response", async () => {
    trialService.startTrial.mockResolvedValue({
      token: "jwt-token",
      trialEnd: 1770000000000,
    });

    const res = await request(functionsExports.startTrial)
      .post("/")
      .set("x-forwarded-for", "10.10.10.10")
      .send({
        deviceId: "device-1",
        systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: "jwt-token",
      trialEnd: 1770000000000,
    });
    expect(trialService.startTrial).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        jwtSecret: "mock-secret",
        ip: "10.10.10.10",
      })
    );
  });

  it("GET /startTrial returns 405", async () => {
    const res = await request(functionsExports.startTrial).get("/");
    expect(res.status).toBe(405);
    expect(res.body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("maps TrialServiceError to structured HTTP response", async () => {
    trialService.startTrial.mockRejectedValue(
      new trialService.TrialServiceError("Trial already used", 409, "TRIAL_ALREADY_USED")
    );

    const res = await request(functionsExports.startTrial).post("/").send({
      deviceId: "device-1",
      systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "Trial already used",
      code: "TRIAL_ALREADY_USED",
    });
  });

  it("POST /verifyTrial returns service response", async () => {
    trialService.verifyTrial.mockResolvedValue({
      valid: true,
      trialEnd: 1770000000000,
      reason: "Trial valid",
    });

    const res = await request(functionsExports.verifyTrial).post("/").send({
      token: "jwt-token",
      deviceId: "device-1",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      trialEnd: 1770000000000,
      reason: "Trial valid",
    });
    expect(trialService.verifyTrial).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        jwtSecret: "mock-secret",
      })
    );
  });
});
