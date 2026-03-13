import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgCQ_hBrNj_qzEd3cjkPiSSEUdE8o7_kA",
  authDomain: "licence-registration-1c9ac.firebaseapp.com",
  projectId: "licence-registration-1c9ac",
  appId: "1:844115242528:web:8add82514dbe447e15d645",
};

const ADMIN_API_BASE = "https://us-central1-licence-registration-1c9ac.cloudfunctions.net/adminApi";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const authCard = document.getElementById("authCard");
const panelCard = document.getElementById("panelCard");
const clientsCard = document.getElementById("clientsCard");
const authStatus = document.getElementById("authStatus");
const feedbackBar = document.getElementById("feedbackBar");
const clientCards = document.getElementById("clientCards");
const searchInput = document.getElementById("searchInput");
const projectSelect = document.getElementById("projectSelect");
const selectedProjectName = document.getElementById("selectedProjectName");
const selectedProjectMeta = document.getElementById("selectedProjectMeta");
const projectApiKeyField = document.getElementById("projectApiKeyField");
const copyProjectApiKeyBtn = document.getElementById("copyProjectApiKeyBtn");
const projectApiKeyHint = document.getElementById("projectApiKeyHint");
const loginBtn = document.getElementById("loginBtn");
const refreshBtn = document.getElementById("refreshBtn");
const refreshProjectsBtn = document.getElementById("refreshProjectsBtn");
const logoutBtn = document.getElementById("logoutBtn");
const serverTimeText = document.getElementById("serverTimeText");

let selectedProjectId = "";
let cachedProjects = [];
let feedbackTimeout = null;
let serverTimeOffsetMs = 0;
let serverClockTimer = null;

function showFeedback(type, message, persist = false) {
  feedbackBar.textContent = message;
  feedbackBar.classList.remove("hidden", "success", "error", "info", "warning");
  feedbackBar.classList.add(type);

  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
  }

  if (!persist) {
    feedbackTimeout = setTimeout(() => {
      feedbackBar.classList.add("hidden");
    }, 4200);
  }
}

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "-";
  }
  return new Date(ms).toLocaleString();
}

function normalizeStatus(client) {
  const raw = String(client?.status || "").trim().toLowerCase();
  if (raw === "active" || raw === "expired" || raw === "revoked") {
    return raw;
  }

  const trialEnd = Number(client?.trialEnd || 0);
  if (Number.isFinite(trialEnd) && trialEnd > 0) {
    return trialEnd > Date.now() ? "active" : "expired";
  }
  return "unknown";
}

function ensureSelectedProject() {
  if (!selectedProjectId) {
    throw new Error("Please select a project first.");
  }
}

function updateServerOffsetFromHeader(response) {
  const headerValue = response.headers.get("date");
  if (!headerValue) {
    return;
  }
  const serverMs = Date.parse(headerValue);
  if (!Number.isFinite(serverMs)) {
    return;
  }
  serverTimeOffsetMs = serverMs - Date.now();
}

function renderServerTime() {
  const ms = Date.now() + serverTimeOffsetMs;
  serverTimeText.textContent = new Date(ms).toLocaleString();
}

function startServerClock() {
  if (serverClockTimer) {
    clearInterval(serverClockTimer);
  }
  renderServerTime();
  serverClockTimer = setInterval(renderServerTime, 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderClientCards(clients) {
  clientCards.innerHTML = "";
  if (!Array.isArray(clients) || !clients.length) {
    clientCards.innerHTML = "<div class='empty-card'>No clients found for this project.</div>";
    return;
  }

  for (const client of clients) {
    const deviceId = escapeHtml(client.deviceId || "-");
    const status = normalizeStatus(client);
    const trialEnd = formatDate(Number(client.trialEnd || 0));
    const system = client.systemInfo || {};
    const os = escapeHtml(system.os || "-");
    const cpu = escapeHtml(system.cpu || "-");
    const gpu = escapeHtml(system.gpu || "-");
    const ip = escapeHtml(client.ip || "-");
    const createdAt = escapeHtml(String(client.createdAt || "-"));
    const projectId = escapeHtml(client.projectId || "-");

    const card = document.createElement("details");
    card.className = "client-card";
    card.innerHTML = `
      <summary>
        <div class="client-summary">
          <div class="client-device">${deviceId}</div>
          <span class="status-pill ${status}">${status}</span>
          <div class="trial-end">${escapeHtml(trialEnd)}</div>
          <div class="summary-actions">
            <button class="card-action" data-action="extend" data-device="${deviceId}" type="button">+7d</button>
            <button class="card-action danger" data-action="revoke" data-device="${deviceId}" type="button">Revoke</button>
          </div>
        </div>
      </summary>
      <div class="client-extra">
        <div class="extra-grid">
          <div><span class="muted">Project:</span> ${projectId}</div>
          <div><span class="muted">IP:</span> ${ip}</div>
          <div><span class="muted">OS:</span> ${os}</div>
          <div><span class="muted">CPU:</span> ${cpu}</div>
          <div><span class="muted">GPU:</span> ${gpu}</div>
          <div><span class="muted">Created:</span> ${createdAt}</div>
        </div>
      </div>
    `;
    clientCards.appendChild(card);
  }
}

function updateSelectedProjectDetails(selected) {
  if (!selected) {
    selectedProjectName.textContent = "No project selected";
    selectedProjectMeta.textContent = "[project-id]";
    projectApiKeyField.value = "";
    projectApiKeyHint.textContent = "";
    return;
  }

  selectedProjectName.textContent = selected.name || "Unnamed Project";
  selectedProjectMeta.textContent = `[${selected.projectId}] active: ${Boolean(selected.active)}`;

  const key = selected.projectApiKey || "";
  projectApiKeyField.value = key;
  if (key) {
    projectApiKeyHint.textContent = "Share this projectApiKey securely with the client app developer.";
  } else {
    projectApiKeyHint.textContent = "No projectApiKey stored for this project (legacy record).";
  }
}

function renderProjectSelector(projects) {
  projectSelect.innerHTML = "";

  if (!Array.isArray(projects) || !projects.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No projects available";
    projectSelect.appendChild(option);
    selectedProjectId = "";
    updateSelectedProjectDetails(null);
    return;
  }

  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.projectId;
    option.textContent = `${project.name} (${project.projectId})`;
    projectSelect.appendChild(option);
  }

  if (!selectedProjectId || !projects.some((p) => p.projectId === selectedProjectId)) {
    selectedProjectId = projects[0].projectId;
  }

  projectSelect.value = selectedProjectId;
  const selected = projects.find((p) => p.projectId === selectedProjectId);
  updateSelectedProjectDetails(selected || null);
}

async function withButtonBusy(button, busyText, task) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function callAdmin(method, endpoint, body = null) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please login as admin first.");
  }

  const idToken = await user.getIdToken();
  const headers = {
    Authorization: `Bearer ${idToken}`,
  };
  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });

  updateServerOffsetFromHeader(response);

  let json = {};
  try {
    json = await response.json();
  } catch (_) {
    throw new Error("Server returned a non-JSON response.");
  }

  if (!response.ok || json.error) {
    throw new Error(json.message || json.error || "Request failed");
  }

  return json;
}

async function loadProjects() {
  const response = await callAdmin("GET", "/projects");
  cachedProjects = response.projects || [];
  renderProjectSelector(cachedProjects);
}

async function loadClients() {
  ensureSelectedProject();
  const search = searchInput.value.trim();
  const response = await callAdmin(
    "GET",
    `/projects/${encodeURIComponent(selectedProjectId)}/clients?limit=200&search=${encodeURIComponent(search)}`
  );
  renderClientCards(response.clients || []);
}

loginBtn.addEventListener("click", async () => {
  await withButtonBusy(loginBtn, "Logging in...", async () => {
    try {
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      await signInWithEmailAndPassword(auth, email, password);
      authStatus.textContent = "Logged in.";
      showFeedback("success", "Login successful.");
    } catch (error) {
      authStatus.textContent = `Login failed: ${error.message}`;
      showFeedback("error", `Login failed: ${error.message}`, true);
    }
  });
});

logoutBtn.addEventListener("click", async () => {
  await withButtonBusy(logoutBtn, "Logging out...", async () => {
    await signOut(auth);
    showFeedback("info", "Logged out.");
  });
});

refreshProjectsBtn.addEventListener("click", async () => {
  await withButtonBusy(refreshProjectsBtn, "Refreshing...", async () => {
    try {
      showFeedback("info", "Refreshing projects...");
      await loadProjects();
      if (selectedProjectId) {
        await loadClients();
      }
      showFeedback("success", "Projects refreshed.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

refreshBtn.addEventListener("click", async () => {
  await withButtonBusy(refreshBtn, "Refreshing...", async () => {
    try {
      showFeedback("info", "Refreshing clients...");
      await loadClients();
      showFeedback("success", "Clients refreshed.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

projectSelect.addEventListener("change", async () => {
  selectedProjectId = projectSelect.value;
  const selected = cachedProjects.find((p) => p.projectId === selectedProjectId);
  updateSelectedProjectDetails(selected || null);
  try {
    await loadClients();
    showFeedback("success", "Project switched.");
  } catch (error) {
    showFeedback("error", error.message, true);
  }
});

copyProjectApiKeyBtn.addEventListener("click", async () => {
  const value = projectApiKeyField.value.trim();
  if (!value) {
    showFeedback("warning", "No projectApiKey available for this project.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showFeedback("success", "Project API key copied.");
  } catch (_) {
    showFeedback("error", "Unable to copy projectApiKey. Copy manually from the field.", true);
  }
});

document.getElementById("createProjectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = event.currentTarget.querySelector("button[type='submit']");
  await withButtonBusy(submitBtn, "Creating...", async () => {
    try {
      const response = await callAdmin("POST", "/createProject", {
        name: document.getElementById("projectName").value.trim(),
        description: document.getElementById("projectDescription").value.trim(),
      });
      const createdProjectId = response?.project?.projectId || "";
      await loadProjects();
      if (createdProjectId) {
        selectedProjectId = createdProjectId;
        renderProjectSelector(cachedProjects);
        await loadClients();
      }
      event.currentTarget.reset();
      showFeedback("success", "Project created successfully.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

document.getElementById("createClientForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = event.currentTarget.querySelector("button[type='submit']");
  await withButtonBusy(submitBtn, "Creating...", async () => {
    try {
      ensureSelectedProject();
      await callAdmin("POST", "/createClient", {
        projectId: selectedProjectId,
        deviceId: document.getElementById("createDeviceId").value.trim(),
        systemInfo: {
          os: document.getElementById("createOs").value.trim(),
          cpu: document.getElementById("createCpu").value.trim(),
          gpu: document.getElementById("createGpu").value.trim(),
        },
        trialDays: Number(document.getElementById("createDays").value || 7),
      });
      event.currentTarget.reset();
      document.getElementById("createDays").value = "7";
      await loadClients();
      showFeedback("success", "Client added and trial started.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

document.getElementById("extendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = event.currentTarget.querySelector("button[type='submit']");
  await withButtonBusy(submitBtn, "Extending...", async () => {
    try {
      ensureSelectedProject();
      await callAdmin("POST", "/extendTrial", {
        projectId: selectedProjectId,
        deviceId: document.getElementById("extendDeviceId").value.trim(),
        extendDays: Number(document.getElementById("extendDays").value || 7),
      });
      event.currentTarget.reset();
      document.getElementById("extendDays").value = "7";
      await loadClients();
      showFeedback("success", "Trial extended successfully.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

document.getElementById("revokeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = event.currentTarget.querySelector("button[type='submit']");
  await withButtonBusy(submitBtn, "Revoking...", async () => {
    try {
      ensureSelectedProject();
      await callAdmin("POST", "/revokeTrial", {
        projectId: selectedProjectId,
        deviceId: document.getElementById("revokeDeviceId").value.trim(),
      });
      event.currentTarget.reset();
      await loadClients();
      showFeedback("success", "Trial revoked successfully.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

clientCards.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button.card-action");
  if (!actionButton) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const action = actionButton.getAttribute("data-action");
  const deviceId = actionButton.getAttribute("data-device");
  if (!deviceId) {
    return;
  }

  await withButtonBusy(actionButton, action === "extend" ? "Extending..." : "Revoking...", async () => {
    try {
      ensureSelectedProject();
      if (action === "extend") {
        await callAdmin("POST", "/extendTrial", {
          projectId: selectedProjectId,
          deviceId,
          extendDays: 7,
        });
        showFeedback("success", `Extended ${deviceId} by 7 days.`);
      } else if (action === "revoke") {
        await callAdmin("POST", "/revokeTrial", {
          projectId: selectedProjectId,
          deviceId,
        });
        showFeedback("success", `Revoked trial for ${deviceId}.`);
      }
      await loadClients();
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

searchInput.addEventListener("keyup", async (event) => {
  if (event.key !== "Enter") {
    return;
  }
  try {
    await loadClients();
    showFeedback("success", "Search complete.");
  } catch (error) {
    showFeedback("error", error.message, true);
  }
});

onAuthStateChanged(auth, async (user) => {
  const isLoggedIn = Boolean(user);

  authCard.classList.toggle("hidden", isLoggedIn);
  panelCard.classList.toggle("hidden", !isLoggedIn);
  clientsCard.classList.toggle("hidden", !isLoggedIn);
  logoutBtn.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn) {
    selectedProjectId = "";
    cachedProjects = [];
    renderProjectSelector([]);
    renderClientCards([]);
    return;
  }

  try {
    showFeedback("info", "Loading projects and clients...");
    await loadProjects();
    if (selectedProjectId) {
      await loadClients();
    }
    showFeedback("success", "Admin panel ready.");
  } catch (error) {
    showFeedback("error", error.message, true);
  }
});

startServerClock();
