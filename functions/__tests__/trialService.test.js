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
  adminCreateProject,
  adminListProjectClients,
  startTrial,
  verifyTrial,
} = require("../trialService");

function mockProjectsCollection({ projectDoc, projectByApiKey }) {
  return {
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          empty: !projectByApiKey,
          docs: projectByApiKey
            ? [
                {
                  id: projectByApiKey.id,
                  data: () => projectByApiKey,
                },
              ]
            : [],
        }),
      }),
    }),
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: Boolean(projectDoc),
        id: projectDoc?.id || "",
        data: () => projectDoc || {},
      }),
      create: jest.fn().mockResolvedValue(undefined),
    }),
    get: jest.fn().mockResolvedValue({
      docs: [],
    }),
  };
}

describe("project-scoped startTrial/verifyTrial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue("token-id-123");
    jwt.sign.mockReturnValue("signed-jwt");
  });

  it("startTrial succeeds with valid projectApiKey", async () => {
    const clientCreate = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return mockProjectsCollection({
          projectByApiKey: {
            id: "proj1",
            name: "Project 1",
            active: true,
          },
        });
      }
      if (name === "clients") {
        return {
          doc: jest.fn().mockReturnValue({
            create: clientCreate,
          }),
        };
      }
      return {};
    });

    const response = await startTrial(
      {
        projectApiKey: "valid-api-key",
        deviceId: "device-1",
        systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
      },
      { jwtSecret: "secret", ip: "1.2.3.4" }
    );

    expect(response.statusCode).toBe(CODES.TRIAL_STARTED);
    expect(response.token).toBe("signed-jwt");
    expect(clientCreate).toHaveBeenCalled();
  });

  it("startTrial rejects invalid projectApiKey", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return mockProjectsCollection({
          projectByApiKey: null,
        });
      }
      return {};
    });

    await expect(
      startTrial(
        {
          projectApiKey: "bad",
          deviceId: "device-1",
          systemInfo: { os: "Windows", cpu: "Intel", gpu: "RTX" },
        },
        { jwtSecret: "secret", ip: "1.2.3.4" }
      )
    ).rejects.toMatchObject({
      statusCode: CODES.INVALID_PROJECT_API_KEY,
    });
  });

  it("verifyTrial rejects cross-project token reuse", async () => {
    jwt.verify.mockReturnValue({
      projectId: "proj2",
      deviceId: "device-1",
      tokenId: "tok1",
    });

    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return mockProjectsCollection({
          projectByApiKey: {
            id: "proj1",
            name: "Project 1",
            active: true,
          },
        });
      }
      if (name === "clients") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                deviceId: "device-1",
                projectId: "proj1",
                tokenId: "tok1",
                trialEnd: Date.now() + 10000,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await verifyTrial(
      {
        projectApiKey: "valid-api-key",
        deviceId: "device-1",
        token: "jwt",
      },
      { jwtSecret: "secret" }
    );

    expect(response.statusCode).toBe(CODES.PROJECT_MISMATCH);
  });
});

describe("admin project APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue("proj-uuid-123");
  });

  it("adminCreateProject returns projectId + projectApiKey", async () => {
    const createMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            create: createMock,
          }),
        };
      }
      return {};
    });

    const response = await adminCreateProject({
      name: "Mining Simulator",
      description: "Trial licensing",
    });

    expect(response.statusCode).toBe(CODES.ADMIN_PROJECT_CREATED);
    expect(response.project.projectId).toBeTruthy();
    expect(response.project.projectApiKey).toBeTruthy();
    expect(createMock).toHaveBeenCalled();
  });

  it("adminListProjectClients returns project clients", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              id: "proj1",
              data: () => ({
                name: "Mining Simulator",
                active: true,
              }),
            }),
          }),
        };
      }
      if (name === "clients") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                docs: [
                  {
                    data: () => ({
                      deviceId: "device-1",
                      projectId: "proj1",
                      trialStart: 1,
                      trialEnd: Date.now() + 20000,
                      systemInfo: {},
                      ip: "1.2.3.4",
                    }),
                  },
                ],
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await adminListProjectClients("proj1", { limit: 20 });
    expect(response.statusCode).toBe(CODES.ADMIN_PROJECT_CLIENTS_LISTED);
    expect(response.clients.length).toBe(1);
  });

  it("adminListProjectClients rejects invalid projectId", async () => {
    await expect(adminListProjectClients("", {})).rejects.toBeInstanceOf(TrialServiceError);
  });
});
