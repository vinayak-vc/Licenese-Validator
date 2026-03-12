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
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../firebase");
const { TrialServiceError, startTrial, verifyTrial } = require("../trialService");

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

  it("creates a trial and returns token + trialEnd", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);

    const response = await startTrial(
      {
        deviceId: " device-abc ",
        systemInfo: {
          os: " Windows 11 ",
          cpu: " Intel i7 ",
          gpu: " RTX 3060 ",
        },
      },
      {
        jwtSecret: "test-secret",
        ip: "1.2.3.4, 9.9.9.9",
      }
    );

    expect(response).toEqual({
      token: "signed-jwt",
      trialEnd: 1700604800000,
    });

    expect(db.collection).toHaveBeenCalledWith("trials");
    expect(docMock).toHaveBeenCalledWith("device-abc");
    expect(jwt.sign).toHaveBeenCalledWith(
      { deviceId: "device-abc", tokenId: "token-id-123" },
      "test-secret",
      expect.objectContaining({
        algorithm: "HS256",
      })
    );
    expect(createMock).toHaveBeenCalledWith({
      deviceId: "device-abc",
      tokenId: "token-id-123",
      trialStart: 1700000000000,
      trialEnd: 1700604800000,
      systemInfo: {
        os: "Windows 11",
        cpu: "Intel i7",
        gpu: "RTX 3060",
      },
      ip: "1.2.3.4",
      createdAt: "SERVER_TIMESTAMP",
    });
    expect(FieldValue.serverTimestamp).toHaveBeenCalled();
  });

  it("throws a TRIAL_ALREADY_USED error when doc already exists", async () => {
    createMock.mockRejectedValue({ code: 6 });

    await expect(
      startTrial(
        {
          deviceId: "device-abc",
          systemInfo: {
            os: "Windows",
            cpu: "Intel",
            gpu: "RTX",
          },
        },
        { jwtSecret: "test-secret", ip: "1.2.3.4" }
      )
    ).rejects.toMatchObject({
      message: "Trial already used",
      statusCode: 409,
      code: "TRIAL_ALREADY_USED",
    });
  });

  it("validates required fields", async () => {
    await expect(startTrial({}, { jwtSecret: "secret" })).rejects.toBeInstanceOf(TrialServiceError);
  });
});

describe("trialService.verifyTrial", () => {
  let getMock;
  let docMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getMock = jest.fn();
    docMock = jest.fn().mockReturnValue({
      get: getMock,
    });
    db.collection.mockReturnValue({
      doc: docMock,
    });
  });

  it("returns valid true for active matching trial", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    jwt.verify.mockReturnValue({
      deviceId: "device-1",
      tokenId: "token-1",
    });
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        tokenId: "token-1",
        trialEnd: 1700000100000,
      }),
    });

    const response = await verifyTrial(
      {
        token: "jwt",
        deviceId: "device-1",
      },
      {
        jwtSecret: "secret",
      }
    );

    expect(response).toEqual({
      valid: true,
      trialEnd: 1700000100000,
      reason: "Trial valid",
    });
  });

  it("returns invalid token reason when jwt verification fails", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("bad token");
    });
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        tokenId: "token-1",
        trialEnd: 1700000100000,
      }),
    });

    const response = await verifyTrial(
      {
        token: "bad",
        deviceId: "device-1",
      },
      {
        jwtSecret: "secret",
      }
    );

    expect(response).toEqual({
      valid: false,
      trialEnd: 1700000100000,
      reason: "Invalid token",
    });
  });

  it("returns device mismatch for mismatched token payload", async () => {
    jwt.verify.mockReturnValue({
      deviceId: "different-device",
      tokenId: "token-1",
    });
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        tokenId: "token-1",
        trialEnd: 1700000100000,
      }),
    });

    const response = await verifyTrial(
      {
        token: "jwt",
        deviceId: "device-1",
      },
      {
        jwtSecret: "secret",
      }
    );

    expect(response).toEqual({
      valid: false,
      trialEnd: 1700000100000,
      reason: "Device mismatch",
    });
  });

  it("returns trial expired when server time is beyond trialEnd", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1700000200000);
    jwt.verify.mockReturnValue({
      deviceId: "device-1",
      tokenId: "token-1",
    });
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        tokenId: "token-1",
        trialEnd: 1700000100000,
      }),
    });

    const response = await verifyTrial(
      {
        token: "jwt",
        deviceId: "device-1",
      },
      {
        jwtSecret: "secret",
      }
    );

    expect(response).toEqual({
      valid: false,
      trialEnd: 1700000100000,
      reason: "Trial expired",
    });
  });

  it("returns trial record not found when device never registered and token is empty", async () => {
    getMock.mockResolvedValue({
      exists: false,
    });

    const response = await verifyTrial(
      {
        token: "",
        deviceId: "device-new",
      },
      {
        jwtSecret: "secret",
      }
    );

    expect(response).toEqual({
      valid: false,
      trialEnd: 0,
      reason: "Trial record not found",
    });
  });

  it("returns token required when device exists but token is empty", async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        tokenId: "token-1",
        trialEnd: 1700000100000,
      }),
    });

    const response = await verifyTrial(
      {
        token: "",
        deviceId: "device-1",
      },
      {
        jwtSecret: "secret",
      }
    );

    expect(response).toEqual({
      valid: false,
      trialEnd: 1700000100000,
      reason: "Token required",
    });
  });
});
