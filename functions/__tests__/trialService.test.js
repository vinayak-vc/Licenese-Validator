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
  adminListProjects,
  adminListProjectClients,
  startTrial,
  verifyTrial,
  logEvents,
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
            update: jest.fn().mockResolvedValue(undefined),
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

  it("adminListProjects exposes projectApiKey for admin panel", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [
              {
                id: "proj1",
                data: () => ({
                  name: "Mining Simulator",
                  description: "Desc",
                  active: true,
                  apiKeyPreview: "abc...123",
                  apiKey: "full-project-api-key",
                }),
              },
            ],
          }),
        };
      }
      return {};
    });

    const response = await adminListProjects();
    expect(response.statusCode).toBe(CODES.ADMIN_PROJECTS_LISTED);
    expect(response.projects[0].projectApiKey).toBe("full-project-api-key");
  });

  it("adminCreateProject defaults applicationType to Game and stores an explicit value", async () => {
    uuidv4.mockReturnValue("11112222333344445555666677778888");
    const create = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            create,
          }),
        };
      }
      return {};
    });

    const response = await adminCreateProject({ name: "Kiosk App" });
    expect(response.project.applicationType).toBe("Game");
    expect(create.mock.calls[0][0].applicationType).toBe("Game");

    const response2 = await adminCreateProject({ name: "Kiosk App 2", applicationType: "Kiosk" });
    expect(response2.project.applicationType).toBe("Kiosk");
  });

  it("adminCreateProject rejects an unknown applicationType", async () => {
    await expect(
      adminCreateProject({ name: "Bad App", applicationType: "NotARealType" })
    ).rejects.toBeInstanceOf(TrialServiceError);
  });
});

describe("logEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockClientsCollectionForEvents({ clientExists, eventCreate, batchCommit }) {
    const clientUpdate = jest.fn().mockResolvedValue(undefined);
    const eventsCollection = { doc: jest.fn(() => ({ id: "event-doc-id" })) };
    const clientDocRef = {
      get: jest.fn().mockResolvedValue({ exists: clientExists }),
      update: clientUpdate,
      collection: jest.fn(() => eventsCollection),
    };
    db.batch = jest.fn(() => ({
      create: eventCreate || jest.fn(),
      commit: batchCommit || jest.fn().mockResolvedValue(undefined),
    }));
    return {
      doc: jest.fn(() => clientDocRef),
      clientUpdate,
    };
  }

  it("logs a batch of events for a registered client", async () => {
    const eventCreate = jest.fn();
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    let clientsCollection;
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return mockProjectsCollection({
          projectByApiKey: { id: "proj1", name: "Project 1", active: true },
        });
      }
      if (name === "clients") {
        clientsCollection = mockClientsCollectionForEvents({
          clientExists: true,
          eventCreate,
          batchCommit,
        });
        return clientsCollection;
      }
      return {};
    });

    const response = await logEvents({
      projectApiKey: "valid-api-key",
      deviceId: "device-1",
      events: [
        { name: "screen_view", params: { screen: "menu" }, timestamp: 1710000000000 },
        { name: "button_click", params: { id: 42, ok: true } },
      ],
    });

    expect(response.statusCode).toBe(CODES.EVENTS_LOGGED);
    expect(response.count).toBe(2);
    expect(eventCreate).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(eventCreate.mock.calls[0][1].name).toBe("screen_view");
    expect(eventCreate.mock.calls[0][1].params).toEqual({ screen: "menu" });
  });

  it("rejects events for a device that isn't a registered client", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "projects") {
        return mockProjectsCollection({
          projectByApiKey: { id: "proj1", name: "Project 1", active: true },
        });
      }
      if (name === "clients") {
        return mockClientsCollectionForEvents({ clientExists: false });
      }
      return {};
    });

    await expect(
      logEvents({
        projectApiKey: "valid-api-key",
        deviceId: "unregistered-device",
        events: [{ name: "screen_view" }],
      })
    ).rejects.toMatchObject({ statusCode: CODES.CLIENT_NOT_FOUND });
  });

  it("rejects an empty or oversized events array", async () => {
    await expect(
      logEvents({ projectApiKey: "k", deviceId: "d", events: [] })
    ).rejects.toBeInstanceOf(TrialServiceError);

    await expect(
      logEvents({
        projectApiKey: "k",
        deviceId: "d",
        events: Array.from({ length: 51 }, () => ({ name: "x" })),
      })
    ).rejects.toBeInstanceOf(TrialServiceError);
  });

  it("rejects an event with a missing name", async () => {
    await expect(
      logEvents({ projectApiKey: "k", deviceId: "d", events: [{ params: {} }] })
    ).rejects.toBeInstanceOf(TrialServiceError);
  });
});
