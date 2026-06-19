"use strict";

jest.mock("jsonwebtoken", () => ({ sign: jest.fn(() => "signed-jwt"), verify: jest.fn() }));
jest.mock("uuid", () => ({ v4: jest.fn(() => "token-id-123") }));
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP") },
}));
jest.mock("../firebase", () => ({ db: { collection: jest.fn(), batch: jest.fn() } }));
jest.mock("../emailService", () => ({
  buildNewClientEmail: jest.fn(() => ({ subject: "new", htmlContent: "h" })),
  buildExpiringEmail: jest.fn(() => ({ subject: "expiring", htmlContent: "h" })),
  buildExpiredEmail: jest.fn(() => ({ subject: "expired", htmlContent: "h" })),
  sendAdminNotification: jest.fn(() => Promise.resolve({ status: "sent", messageId: "m" })),
}));

const { db } = require("../firebase");
const emailService = require("../emailService");
const { runTrialExpiryScan, startTrial } = require("../trialService");

function docFor(data) {
  return { ref: { id: data.deviceId }, data: () => data };
}

describe("runTrialExpiryScan", () => {
  let batchUpdate;
  let batchCommit;

  beforeEach(() => {
    jest.clearAllMocks();
    batchUpdate = jest.fn();
    batchCommit = jest.fn().mockResolvedValue(undefined);
    db.batch.mockReturnValue({ update: batchUpdate, commit: batchCommit });
  });

  it("emails expiring + expired (skipping revoked/already-notified) and marks docs", async () => {
    const now = 1_000_000_000_000;

    // runTrialExpiryScan calls db.collection("clients") once per query
    // (expiring first, expired second), each returning a fresh chain.
    const clientDocSets = [
      [
        docFor({ deviceId: "soon-1", projectId: "p1", trialEnd: now + 86400000 }),
        docFor({ deviceId: "soon-revoked", projectId: "p1", trialEnd: now + 86400000, revoked: true }),
        docFor({ deviceId: "soon-already", projectId: "p1", trialEnd: now + 86400000, expiringNotifiedAt: "x" }),
      ],
      [docFor({ deviceId: "gone-1", projectId: "p1", trialEnd: now - 86400000 })],
    ];
    let clientsQuery = 0;

    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [{ id: "p1", data: () => ({ name: "Proj One" }) }],
          }),
        };
      }
      if (name === "clients") {
        const docs = clientDocSets[clientsQuery++] || [];
        const chain = { where: jest.fn(() => chain), get: jest.fn().mockResolvedValue({ docs }) };
        return chain;
      }
      return {};
    });

    const result = await runTrialExpiryScan({ now });

    expect(result).toEqual({ expiringCount: 1, expiredCount: 1 });
    expect(emailService.buildExpiringEmail).toHaveBeenCalledTimes(1);
    expect(emailService.buildExpiredEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendAdminNotification).toHaveBeenCalledTimes(2);
    // One mark per included client (1 expiring + 1 expired).
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when there are no qualifying clients", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return { get: jest.fn().mockResolvedValue({ docs: [] }) };
      }
      const chain = { where: jest.fn(() => chain), get: jest.fn().mockResolvedValue({ docs: [] }) };
      return chain;
    });

    const result = await runTrialExpiryScan({ now: 1000 });
    expect(result).toEqual({ expiringCount: 0, expiredCount: 0 });
    expect(emailService.sendAdminNotification).not.toHaveBeenCalled();
  });
});

describe("startTrial new-client notification", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fires a new-client admin notification after a successful create", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [{ id: "p1", data: () => ({ id: "p1", name: "Proj One", active: true }) }],
              }),
            }),
          }),
        };
      }
      if (name === "clients") {
        return { doc: jest.fn().mockReturnValue({ create: jest.fn().mockResolvedValue(undefined) }) };
      }
      return {};
    });

    const response = await startTrial(
      {
        projectApiKey: "valid",
        deviceId: "device-1",
        systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
      },
      { jwtSecret: "secret", ip: "1.2.3.4" }
    );

    expect(response.statusCode).toBe("1000");
    expect(emailService.buildNewClientEmail).toHaveBeenCalledTimes(1);
    const arg = emailService.buildNewClientEmail.mock.calls[0][0];
    expect(arg.deviceId).toBe("device-1");
    expect(arg.source).toBe("client");
  });
});
