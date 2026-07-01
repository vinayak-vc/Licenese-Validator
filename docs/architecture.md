# Architecture

## Backend (functions/)

Each Cloud Function is a tiny Express app wrapped in `onRequest`
(`index.js`). Business logic lives in `trialService.js` — functions in
`index.js` only: parse the request, call a `trialService` function, map the
result/error to a JSON response via `responseBody()` / `TrialServiceError`.

Standard response contract (every endpoint):

```json
{ "message": "string", "token": "string", "statusCode": "1000", "error": null }
```

Error codes are centralized in `trialService.CODES`. Adding a new error case
means adding a code there, not inventing an ad hoc string.

### Auth model

- `startTrial`, `verifyTrial`, `logEvents` — public, device-facing. No
  Firebase Auth. Identity is `projectApiKey` (hashed, looked up via
  `apiKeyHash`) + `deviceId`. `verifyTrial` additionally checks a JWT
  (`tokenId` must match the stored value, so revoking = rotating `tokenId`).
- `adminApi/*` — gated by `requireAdmin` middleware: Firebase Auth Bearer
  token + custom claim `admin: true`.

### Firestore schema

```
projects/{projectId}
  name, description, apiKey, apiKeyHash, apiKeyPreview, active,
  applicationType ("Game" | "Enterprise" | "Kiosk", default "Game"),
  createdAt

clients/{projectId}__{deviceId}          <- flat collection, composite doc id
  deviceId, projectId, tokenId, trialStart, trialEnd, systemInfo, ip,
  lastOnline, revoked, createdAt

clients/{projectId}__{deviceId}/events/{eventId}   <- subcollection (new)
  name, params (map), clientTimestamp, receivedAt (server timestamp)
```

Events nest under the client doc (not a separate top-level collection) so
every event is already correlated with that device's `systemInfo`
(hardware/OS/country) with no join required — same reasoning `HardwareInsights`
already leans on for license telemetry.

`buildClientDocId(projectId, deviceId)` is the single source of truth for
the composite id — always go through it, never concatenate manually.

### Firestore security rules

`firestore.rules` denies all direct client SDK access
(`allow read, write: if false`). Cloud Functions use the Admin SDK, which
bypasses rules entirely, so this has no effect on the app — it only closes
off direct Firestore access from anyone holding the (non-secret) Firebase
web config.

### Secrets

`JWT_SECRET` and `BREVO_API_KEY` are Firebase Functions secrets
(`defineSecret`), not env vars — never move these into `.env` or hardcode.

## Admin panel (admin-panel/)

React + Vite + Tailwind. Firebase Auth for admin login (`AuthContext`).
`ProjectContext` holds `selectedProjectId`, drives every page. `lib/api.js`
wraps `adminApi` calls with the Bearer token. Pages read via
`api.getClients(projectId)` etc and do client-side aggregation (see
`HardwareInsights.jsx` for the established pattern: fetch clients, aggregate
in a `useMemo`, render distributions). Follow this pattern for new analytics
views rather than introducing a new data-fetching approach.

## Unity client integration

`Assets\Modules\License Verifier\Script\LicenseVerifier.cs` in the Unity
repo is the reference integration: builds a `DeviceSystemInfo` payload,
POSTs via `ServerCommunication.Instance.SendRequestPost`, matches
`projectApiKey` = `gameID` from `ViitorCloudGameInfoSo`. New analytics
providers on the Unity side follow this same pattern (see
`unityvc-base-project/docs/architecture.md` for the Unity-side engine).

## Cross-repo contract

The only coupling between the two repos is the HTTP contract (endpoint URLs,
request/response shapes) documented here and in
`docs/ADMIN_DEVELOPER_SYSTEM_GUIDE.md`. Changing a request/response shape on
one side requires updating the other — there is no shared type definition.
