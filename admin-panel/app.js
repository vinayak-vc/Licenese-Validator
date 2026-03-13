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
const output = document.getElementById("output");
const clientsTableBody = document.getElementById("clientsTableBody");
const searchInput = document.getElementById("searchInput");
const projectSelect = document.getElementById("projectSelect");
const selectedProjectInfo = document.getElementById("selectedProjectInfo");
const projectApiKeyField = document.getElementById("projectApiKeyField");
const copyProjectApiKeyBtn = document.getElementById("copyProjectApiKeyBtn");
const projectApiKeyHint = document.getElementById("projectApiKeyHint");

let selectedProjectId = "";
let cachedProjects = [];

function renderResponse(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "-";
  }
  return new Date(ms).toLocaleString();
}

function renderClients(clients) {
  clientsTableBody.innerHTML = "";
  if (!Array.isArray(clients) || !clients.length) {
    clientsTableBody.innerHTML = "<tr><td colspan='5'>No clients found.</td></tr>";
    return;
  }

  for (const client of clients) {
    const tr = document.createElement("tr");
    const system = client.systemInfo || {};
    tr.innerHTML = `
      <td>${client.deviceId || "-"}</td>
      <td>${client.status || "-"}</td>
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
    projectApiKeyHint.textContent = "Share this projectApiKey with the client app developer.";
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

  const json = await response.json();
  renderResponse(json);
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

document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    await signInWithEmailAndPassword(auth, email, password);
    authStatus.textContent = "Logged in.";
  } catch (error) {
    authStatus.textContent = `Login failed: ${error.message}`;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  try {
    await loadClients();
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

document.getElementById("refreshProjectsBtn").addEventListener("click", async () => {
  try {
    await loadProjects();
    if (selectedProjectId) {
      await loadClients();
    }
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

projectSelect.addEventListener("change", async () => {
  selectedProjectId = projectSelect.value;
  const selected = cachedProjects.find((p) => p.projectId === selectedProjectId);
  updateSelectedProjectDetails(selected || null);
  try {
    await loadClients();
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

copyProjectApiKeyBtn.addEventListener("click", async () => {
  const value = projectApiKeyField.value.trim();
  if (!value) {
    renderResponse({ message: "No projectApiKey available for selected project." });
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    projectApiKeyHint.textContent = "Copied projectApiKey to clipboard.";
  } catch (error) {
    renderResponse({ message: "Unable to copy projectApiKey. Copy manually from field." });
  }
});

document.getElementById("createProjectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
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
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

document.getElementById("createClientForm").addEventListener("submit", async (event) => {
  event.preventDefault();
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
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

document.getElementById("revokeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    ensureSelectedProject();
    await callAdmin("POST", "/revokeTrial", {
      projectId: selectedProjectId,
      deviceId: document.getElementById("revokeDeviceId").value.trim(),
    });
    await loadClients();
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

document.getElementById("extendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    ensureSelectedProject();
    await callAdmin("POST", "/extendTrial", {
      projectId: selectedProjectId,
      deviceId: document.getElementById("extendDeviceId").value.trim(),
      extendDays: Number(document.getElementById("extendDays").value || 7),
    });
    await loadClients();
  } catch (error) {
    renderResponse({ message: error.message });
  }
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

  try {
    ensureSelectedProject();
    if (action === "revoke") {
      await callAdmin("POST", "/revokeTrial", { projectId: selectedProjectId, deviceId });
    } else if (action === "extend") {
      await callAdmin("POST", "/extendTrial", {
        projectId: selectedProjectId,
        deviceId,
        extendDays: 7,
      });
    }
    await loadClients();
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

searchInput.addEventListener("keyup", async (event) => {
  if (event.key === "Enter") {
    try {
      await loadClients();
    } catch (error) {
      renderResponse({ message: error.message });
    }
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
    await loadProjects();
    if (selectedProjectId) {
      await loadClients();
    }
  } catch (error) {
    renderResponse({ message: error.message });
  }
});
