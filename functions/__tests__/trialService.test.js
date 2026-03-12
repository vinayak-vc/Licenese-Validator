"use strict";

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
  },
}));

jest.mock("../firebase", () => ({
  db: {
    collection: jest.fn(),
  },
}));

const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { db } = require("../firebase");
const {
  CODES,
  TrialServiceError,
  adminCreateClient,
  adminExtendTrial,
  adminListClients,
  adminRevokeTrial,
  startTrial,
  verifyTrial,
} = require("../trialService");

describe("trialService.startTrial", () => {
  let createMock;
  let docMock;

  beforeEach(() => {
    jest.clearAllMocks();
    createMock = jest.fn().mockResolvedValue(undefined);
    docMock = jest.fn().mockReturnValue({
      create: createMock,
    });
    db.collection.mockReturnValue({
      doc: docMock,
    });
    uuidv4.mockReturnValue("token-id-123");
    jwt.sign.mockReturnValue("signed-jwt");
  });

  it("returns standardized success response", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    const response = await startTrial(
      {
        deviceId: "device-abc",
        systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
      },
      { jwtSecret: "secret", ip: "1.2.3.4" }
    );

    expect(response).toEqual({
      message: "Trial started successfully",
      token: "signed-jwt",
      statusCode: CODES.TRIAL_STARTED,
      error: null,
    });
  });

  it("throws standardized duplicate-trial error", async () => {
    createMock.mockRejectedValue({ code: 6 });
    await expect(
      startTrial(
        {
          deviceId: "device-abc",
          systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
        },
        { jwtSecret: "secret" }
      )
    ).rejects.toMatchObject({
      httpStatus: 409,
      statusCode: CODES.TRIAL_ALREADY_USED,
      error: "TRIAL_ALREADY_USED",
    });
  });

  it("validates startTrial body", async () => {
    await expect(startTrial({}, { jwtSecret: "secret" })).rejects.toBeInstanceOf(TrialServiceError);
  });
});

describe("trialService.verifyTrial", () => {
  let getMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getMock = jest.fn();
    db.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: getMock,
      }),
    });
  });

  it("returns 9999 when device never registered", async () => {
    getMock.mockResolvedValue({ exists: false });
    const response = await verifyTrial(
      { token: "", deviceId: "device-1" },
      { jwtSecret: "secret" }
    );

    expect(response).toEqual({
      message: "Device never registered. Show Start Trial popup.",
      token: "",
      statusCode: CODES.DEVICE_NEVER_REGISTERED,
      error: null,
    });
  });

  it("returns 8888 when device exists, token missing, and trial is active", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ tokenId: "token-1", trialEnd: 2000 }),
    });

    const response = await verifyTrial(
      { token: null, deviceId: "device-1" },
      { jwtSecret: "secret" }
    );

    expect(response).toEqual({
      message: "Device registered and trial is active. Start Trial popup is not required.",
      token: "",
      statusCode: CODES.DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_ACTIVE,
      error: null,
    });
  });

  it("returns 7777 when device exists, token missing, and trial is expired", async () => {
    jest.spyOn(Date, "now").mockReturnValue(3000);
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ tokenId: "token-1", trialEnd: 2000 }),
    });

    const response = await verifyTrial(
      { token: "", deviceId: "device-1" },
      { jwtSecret: "secret" }
    );

    expect(response).toEqual({
      message: "Trial has expired. Contact admin.",
      token: "",
      statusCode: CODES.DEVICE_REGISTERED_TOKEN_MISSING_TRIAL_EXPIRED,
      error: "TRIAL_EXPIRED",
    });
  });

  it("returns verified response for valid token", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    jwt.verify.mockReturnValue({ deviceId: "device-1", tokenId: "token-1" });
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ tokenId: "token-1", trialEnd: 2000 }),
    });

    const response = await verifyTrial(
      { token: "jwt", deviceId: "device-1" },
      { jwtSecret: "secret" }
    );

    expect(response).toEqual({
      message: "Trial verified successfully",
      token: "jwt",
      statusCode: CODES.TRIAL_VERIFIED,
      error: null,
    });
  });

  it("returns invalid-token response when jwt verification fails", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid");
    });
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ tokenId: "token-1", trialEnd: 2000 }),
    });

    const response = await verifyTrial(
      { token: "bad", deviceId: "device-1" },
      { jwtSecret: "secret" }
    );

    expect(response).toEqual({
      message: "Invalid token",
      token: "",
      statusCode: CODES.INVALID_TOKEN,
      error: "INVALID_TOKEN",
    });
  });
});

describe("trialService.admin actions", () => {
  let getMock;
  let createMock;
  let updateMock;
  let querySnapshotMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getMock = jest.fn();
    createMock = jest.fn().mockResolvedValue(undefined);
    updateMock = jest.fn().mockResolvedValue(undefined);
    querySnapshotMock = {
      docs: [],
    };
    const collectionApi = {
      doc: jest.fn().mockReturnValue({
        get: getMock,
        create: createMock,
        update: updateMock,
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(querySnapshotMock),
    };
    db.collection.mockReturnValue(collectionApi);
    uuidv4.mockReturnValue("admin-token-id");
    jwt.sign.mockReturnValue("admin-created-token");
  });

  it("adminCreateClient returns success contract with token", async () => {
    const response = await adminCreateClient(
      {
        deviceId: "device-new",
        systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
        trialDays: 10,
      },
      {
        jwtSecret: "secret",
        ip: "1.2.3.4",
      }
    );

    expect(response).toEqual({
      message: "Client added and trial created",
      token: "admin-created-token",
      statusCode: CODES.ADMIN_CLIENT_CREATED,
      error: null,
    });
  });

  it("adminRevokeTrial updates trial and returns success", async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ trialEnd: Date.now() + 10000 }),
    });

    const response = await adminRevokeTrial({ deviceId: "device-1" });

    expect(updateMock).toHaveBeenCalled();
    expect(response).toEqual({
      message: "Trial revoked successfully",
      token: "",
      statusCode: CODES.ADMIN_TRIAL_REVOKED,
      error: null,
    });
  });

  it("adminExtendTrial extends trial and returns success", async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ trialEnd: Date.now() + 10000 }),
    });

    const response = await adminExtendTrial({ deviceId: "device-1", extendDays: 7 });

    expect(updateMock).toHaveBeenCalled();
    expect(response).toEqual({
      message: "Trial extended successfully",
      token: "",
      statusCode: CODES.ADMIN_TRIAL_EXTENDED,
      error: null,
    });
  });

  it("adminListClients returns mapped client rows", async () => {
    querySnapshotMock.docs = [
      {
        id: "device-1",
        data: () => ({
          deviceId: "device-1",
          trialStart: 1,
          trialEnd: Date.now() + 10000,
          systemInfo: { os: "Windows" },
          revoked: false,
        }),
      },
    ];

    const response = await adminListClients({ limit: 20, search: "device" });

    expect(response.statusCode).toBe(CODES.ADMIN_CLIENTS_LISTED);
    expect(Array.isArray(response.clients)).toBe(true);
    expect(response.clients[0].deviceId).toBe("device-1");
  });
});
