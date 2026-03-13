import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Replace with your real Firebase web app config.
const firebaseConfig = {
  apiKey: "AIzaSyAgCQ_hBrNj_qzEd3cjkPiSSEUdE8o7_kA",
  authDomain: "licence-registration-1c9ac.firebaseapp.com",
  projectId: "licence-registration-1c9ac",
  appId: "1:844115242528:web:8add82514dbe447e15d645",
};

// Replace with your deployed admin API URL.
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

async function callAdmin(endpoint, body = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please login as admin first.");
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  renderResponse(json);
  return json;
}

async function loadClients() {
  try {
    const search = searchInput.value.trim();
    const response = await callAdmin("/listClients", { limit: 200, search });
    renderClients(response.clients || []);
  } catch (error) {
    renderResponse({ message: error.message });
  }
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
  await loadClients();
});

document.getElementById("createClientForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await callAdmin("/createClient", {
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
    await callAdmin("/revokeTrial", {
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
    await callAdmin("/extendTrial", {
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
    if (action === "revoke") {
      await callAdmin("/revokeTrial", { deviceId });
    } else if (action === "extend") {
      await callAdmin("/extendTrial", { deviceId, extendDays: 7 });
    }
    await loadClients();
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

searchInput.addEventListener("keyup", async (event) => {
  if (event.key === "Enter") {
    await loadClients();
  }
});

onAuthStateChanged(auth, async (user) => {
  const isLoggedIn = Boolean(user);
  authCard.classList.toggle("hidden", isLoggedIn);
  panelCard.classList.toggle("hidden", !isLoggedIn);
  clientsCard.classList.toggle("hidden", !isLoggedIn);
  if (isLoggedIn) {
    await loadClients();
  } else {
    renderClients([]);
  }
});
