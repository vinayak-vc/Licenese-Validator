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
const clientsTableBody = document.getElementById("clientsTableBody");
const searchInput = document.getElementById("searchInput");
const projectSelect = document.getElementById("projectSelect");
const selectedProjectInfo = document.getElementById("selectedProjectInfo");
const projectApiKeyField = document.getElementById("projectApiKeyField");
const copyProjectApiKeyBtn = document.getElementById("copyProjectApiKeyBtn");
const projectApiKeyHint = document.getElementById("projectApiKeyHint");
const loginBtn = document.getElementById("loginBtn");
const refreshBtn = document.getElementById("refreshBtn");
const refreshProjectsBtn = document.getElementById("refreshProjectsBtn");
const logoutBtn = document.getElementById("logoutBtn");

let selectedProjectId = "";
let cachedProjects = [];
let feedbackTimeout = null;

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
    }, 4000);
  }
}

function clearFeedback() {
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
  }
  feedbackBar.classList.add("hidden");
}

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "-";
  }
  return new Date(ms).toLocaleString();
}

function normalizeStatus(client) {
  const raw = String(client?.status || "").toLowerCase().trim();
  if (raw === "active") {
    return "active";
  }
  if (raw === "expired") {
    return "expired";
  }
  if (raw === "revoked") {
    return "revoked";
  }

  const trialEnd = Number(client?.trialEnd || 0);
  if (Number.isFinite(trialEnd) && trialEnd > 0) {
    return trialEnd > Date.now() ? "active" : "expired";
  }
  return "unknown";
}

function renderClients(clients) {
  clientsTableBody.innerHTML = "";
  if (!Array.isArray(clients) || !clients.length) {
    clientsTableBody.innerHTML = "<tr><td colspan='5' class='empty-row'>No clients found for this project.</td></tr>";
    return;
  }

  for (const client of clients) {
    const tr = document.createElement("tr");
    const system = client.systemInfo || {};
    const status = normalizeStatus(client);

    tr.innerHTML = `
      <td>${client.deviceId || "-"}</td>
      <td><span class="status-pill ${status}">${status}</span></td>
      <td>${formatDate(client.trialEnd)}</td>
      <td>${(system.os || "-")} / ${(system.cpu || "-")} / ${(system.gpu || "-")}</td>
      <td class="cell-actions">
        <button class="mini" data-action="extend" data-device="${client.deviceId}">+7d</button>
        <button class="mini danger" data-action="revoke" data-device="${client.deviceId}">Revoke</button>
      </td>
    `;
    clientsTableBody.appendChild(tr);
  }
}

function ensureSelectedProject() {
  if (!selectedProjectId) {
    throw new Error("Please select a project first.");
  }
}

function updateSelectedProjectDetails(selected) {
  selectedProjectInfo.textContent = selected
    ? `Selected: ${selected.name} | ID: ${selected.projectId} | Active: ${selected.active}`
    : "No project selected.";

  const key = selected?.projectApiKey || "";
  projectApiKeyField.value = key;

  if (!selected) {
    projectApiKeyHint.textContent = "";
    return;
  }

  if (key) {
    projectApiKeyHint.textContent = "Share this projectApiKey securely with the client app developer.";
  } else {
    projectApiKeyHint.textContent =
      "No projectApiKey stored for this project (legacy record). Create a new project if needed.";
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

  let json = {};
  try {
    json = await response.json();
  } catch (_) {
    throw new Error("Server returned a non-JSON response.");
  }

  if (!response.ok || json.error) {
    const reason = json.message || json.error || "Request failed";
    throw new Error(reason);
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
  const encodedSearch = encodeURIComponent(search);
  const response = await callAdmin(
    "GET",
    `/projects/${encodeURIComponent(selectedProjectId)}/clients?limit=200&search=${encodedSearch}`
  );
  renderClients(response.clients || []);
}

loginBtn.addEventListener("click", async () => {
  await withButtonBusy(loginBtn, "Logging in...", async () => {
    try {
      clearFeedback();
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

projectSelect.addEventListener("change", async () => {
  selectedProjectId = projectSelect.value;
  const selected = cachedProjects.find((p) => p.projectId === selectedProjectId);
  updateSelectedProjectDetails(selected || null);
  try {
    showFeedback("info", "Loading clients...");
    await loadClients();
    showFeedback("success", "Project selected.");
  } catch (error) {
    showFeedback("error", error.message, true);
  }
});

copyProjectApiKeyBtn.addEventListener("click", async () => {
  const value = projectApiKeyField.value.trim();
  if (!value) {
    showFeedback("warning", "No projectApiKey available for selected project.");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    projectApiKeyHint.textContent = "Copied projectApiKey to clipboard.";
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
      const createdProjectId = response?.project?.projectId;
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
      await loadClients();
      event.currentTarget.reset();
      document.getElementById("createDays").value = "7";
      showFeedback("success", "Client trial created successfully.");
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
      await loadClients();
      event.currentTarget.reset();
      showFeedback("success", "Trial revoked successfully.");
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
      await loadClients();
      event.currentTarget.reset();
      document.getElementById("extendDays").value = "7";
      showFeedback("success", "Trial extended successfully.");
    } catch (error) {
      showFeedback("error", error.message, true);
    }
  });
});

clientsTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.getAttribute("data-action");
  const deviceId = button.getAttribute("data-device");
  if (!deviceId) {
    return;
  }

  await withButtonBusy(button, action === "extend" ? "Extending..." : "Revoking...", async () => {
    try {
      ensureSelectedProject();
      if (action === "revoke") {
        await callAdmin("POST", "/revokeTrial", { projectId: selectedProjectId, deviceId });
        showFeedback("success", `Trial revoked for ${deviceId}.`);
      } else if (action === "extend") {
        await callAdmin("POST", "/extendTrial", {
          projectId: selectedProjectId,
          deviceId,
          extendDays: 7,
        });
        showFeedback("success", `Trial extended by 7 days for ${deviceId}.`);
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
    showFeedback("info", "Searching...");
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

  if (!isLoggedIn) {
    renderClients([]);
    selectedProjectId = "";
    cachedProjects = [];
    renderProjectSelector([]);
    projectApiKeyField.value = "";
    projectApiKeyHint.textContent = "";
    return;
  }

  try {
    showFeedback("info", "Loading admin data...");
    await loadProjects();
    if (selectedProjectId) {
      await loadClients();
    }
    showFeedback("success", "Admin panel ready.");
  } catch (error) {
    showFeedback("error", error.message, true);
  }
});
