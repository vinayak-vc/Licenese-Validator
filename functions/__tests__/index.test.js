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

jest.mock("../firebase", () => ({
  admin: {
    auth: jest.fn(() => ({
      verifyIdToken: jest.fn(async () => ({ uid: "admin-uid", admin: true })),
    })),
  },
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
      INVALID_JSON: 4005,
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
    adminCreateClient: jest.fn(),
    adminCreateProject: jest.fn(),
    adminListProjects: jest.fn(),
    adminListProjectClients: jest.fn(),
    adminListClients: jest.fn(),
    adminRevokeTrial: jest.fn(),
    adminExtendTrial: jest.fn(),
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

  it("POST /adminApi/createClient returns standardized response", async () => {
    trialService.adminCreateClient.mockResolvedValue({
      message: "Client added and trial created",
      token: "new-client-token",
      statusCode: 1100,
      error: null,
    });

    const res = await request(functionsExports.adminApi)
      .post("/createClient")
      .set("Authorization", "Bearer valid-admin-token")
      .send({
        deviceId: "device-1",
        systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
        trialDays: 7,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Client added and trial created",
      token: "new-client-token",
      statusCode: 1100,
      error: null,
    });
  });

  it("POST /adminApi/listClients returns client list payload", async () => {
    trialService.adminListClients.mockResolvedValue({
      message: "Clients listed successfully",
      token: "",
      statusCode: 1103,
      error: null,
      clients: [{ deviceId: "device-1", status: "active" }],
    });

    const res = await request(functionsExports.adminApi)
      .post("/listClients")
      .set("Authorization", "Bearer valid-admin-token")
      .send({ limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Clients listed successfully",
      token: "",
      statusCode: 1103,
      error: null,
      clients: [{ deviceId: "device-1", status: "active" }],
    });
  });

  it("returns standardized error for malformed JSON", async () => {
    const res = await request(functionsExports.verifyTrial)
      .post("/")
      .set("Content-Type", "application/json")
      .send('{"token":"abc" "deviceId":"device-1"}');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "Malformed JSON body",
      token: "",
      statusCode: 4005,
      error: "INVALID_JSON",
    });
  });

  it("GET /adminApi/projects returns project list payload", async () => {
    trialService.adminListProjects.mockResolvedValue({
      message: "Projects listed successfully",
      token: "",
      statusCode: 1201,
      error: null,
      projects: [{ projectId: "proj1", name: "Mining Simulator" }],
    });

    const res = await request(functionsExports.adminApi)
      .get("/projects")
      .set("Authorization", "Bearer valid-admin-token");

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(1201);
    expect(Array.isArray(res.body.projects)).toBe(true);
  });
});
