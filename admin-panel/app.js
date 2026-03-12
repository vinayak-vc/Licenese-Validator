import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Replace with your real Firebase web app config.
const firebaseConfig = {
  apiKey: "REPLACE_API_KEY",
  authDomain: "REPLACE_PROJECT.firebaseapp.com",
  projectId: "REPLACE_PROJECT",
  appId: "REPLACE_APP_ID",
};

// Replace with your deployed admin API URL.
const ADMIN_API_BASE = "https://us-central1-REPLACE_PROJECT.cloudfunctions.net/adminApi";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const authCard = document.getElementById("authCard");
const panelCard = document.getElementById("panelCard");
const authStatus = document.getElementById("authStatus");
const output = document.getElementById("output");

function renderResponse(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

async function callAdmin(endpoint, body) {
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
  } catch (error) {
    renderResponse({ message: error.message });
  }
});

onAuthStateChanged(auth, (user) => {
  const isLoggedIn = Boolean(user);
  authCard.classList.toggle("hidden", isLoggedIn);
  panelCard.classList.toggle("hidden", !isLoggedIn);
});
