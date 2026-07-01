import { auth } from '../firebase';

let serverTimeOffsetMs = 0;

export function getServerTime() {
  return Date.now() + serverTimeOffsetMs;
}

function updateServerOffset(response) {
  const headerValue = response.headers.get("date");
  if (!headerValue) return;
  const serverMs = Date.parse(headerValue);
  if (!Number.isFinite(serverMs)) return;
  serverTimeOffsetMs = serverMs - Date.now();
}

export async function callAdmin(method, endpoint, body = null) {
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

  const response = await fetch(`${import.meta.env.VITE_ADMIN_API_BASE}${endpoint}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });

  updateServerOffset(response);

  let json = {};
  try {
    json = await response.json();
  } catch (_) {
    throw new Error("Server returned a non-JSON response.");
  }

  // The backend might return errors as standard HTTP codes or a JSON error field.
  if (!response.ok || json.error) {
    const err = new Error(json.message || json.error || "Request failed");
    err.statusCode = json.statusCode || response.status;
    throw err;
  }

  return json;
}

export const api = {
  getProjects: () => callAdmin('GET', '/projects'),
  getClients: (projectId, search = '') => 
    callAdmin('GET', `/projects/${encodeURIComponent(projectId)}/clients?limit=200&search=${encodeURIComponent(search)}`),
  createProject: (data) => callAdmin('POST', '/createProject', data),
  createClient: (data) => callAdmin('POST', '/createClient', data),
  updateClient: (data) => callAdmin('POST', '/updateClient', data),
  extendTrial: (data) => callAdmin('POST', '/extendTrial', data),
  revokeTrial: (data) => callAdmin('POST', '/revokeTrial', data),
  searchClients: (q) => callAdmin('GET', `/clients/search?q=${encodeURIComponent(q)}`),
  getNotifications: () => callAdmin('GET', '/notifications'),
  getClientEvents: (projectId, deviceId, { limit = 200, name = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (name) params.set('name', name);
    return callAdmin(
      'GET',
      `/projects/${encodeURIComponent(projectId)}/clients/${encodeURIComponent(deviceId)}/events?${params.toString()}`
    );
  },
  getFunnel: (projectId, steps, windowDays = 30) =>
    callAdmin('POST', '/funnel', { projectId, steps, windowDays }),
  getRetention: (projectId, windowDays = 30) =>
    callAdmin('POST', '/retention', { projectId, windowDays }),
  getHardwareBreakdown: (projectId, windowDays = 30) =>
    callAdmin('POST', '/hardwareBreakdown', { projectId, windowDays }),
  getRecentEvents: (projectId, sinceMs, limit = 200) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sinceMs) params.set('since', String(sinceMs));
    return callAdmin(
      'GET',
      `/projects/${encodeURIComponent(projectId)}/recent-events?${params.toString()}`
    );
  },
};
