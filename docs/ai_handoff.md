# AI Handoff

## Current state (2026-07-01)

Analytics extension fully wired end-to-end: Unity client -> logEvents
Cloud Function -> Firestore `events` subcollection -> React
`AnalyticsDashboard` page. Backend tests 33/33 passing, admin panel Vite
build passes. Undeployed. Firestore rules locked down but also undeployed.

## Modified files (this session, both repos)

### ReactApp/LicenceRegistration

- `firestore.rules` — locked down (`if true` -> `if false`).
- `docs/*` — new: project-overview, architecture, roadmap, tasks, decisions,
  ai_handoff.
- `functions/trialService.js` — `applicationType` on projects; `logEvents`
  batch endpoint (writes to `clients/{projectId}__{deviceId}/events`);
  `adminListClientEvents` read endpoint; new CODES:
  `INVALID_APPLICATION_TYPE`, `INVALID_EVENTS`, `CLIENT_NOT_FOUND`,
  `EVENTS_LOGGED`.
- `functions/index.js` — public `logEvents` `onRequest`; admin
  `GET /projects/:projectId/clients/:deviceId/events` route.
- `functions/__tests__/trialService.test.js` — 6 new tests; suite is 33/33.
- `admin-panel/src/lib/api.js` — `getClientEvents`.
- `admin-panel/src/pages/AnalyticsDashboard.jsx` (new) — event
  counts/top-events/app-type filter; client-side aggregation like
  `HardwareInsights.jsx`.
- `admin-panel/src/App.jsx`, `components/layout/Sidebar.jsx` — routing +
  sidebar entry for `/analytics`.
- `postman/Trial-Licensing.postman_collection.json` — `logEvents` request.
- `admin-panel/src/lib/systemInfo.js` — updated `countryToFlag` to return ISO codes for images.
- `admin-panel/src/components/ui/FlagIcon.jsx` (new) — component to render `flagcdn.com` images.
- `admin-panel/src/pages/ClientRegistry.jsx`, `GlobalSearch.jsx`, `HardwareInsights.jsx`, `components/ClientDetailModal.jsx` — integrated `FlagIcon` to bypass Windows' missing native flag emojis.
- `admin-panel/src/lib/sessionGrouping.js`, `ClientAnalytics.jsx` — implemented Solution A (clean session evaluation based on error absence during idle timeout / stream tail).
- `Unity/unityvc-base-project/.../AnalyticsLifecycleTracker.cs` — implemented Solution C (next-boot session recovery via PlayerPrefs, 10s heartbeat, and error tracking).

### Unity/unityvc-base-project

- `AGENTS.md` — added section 16 (Documentation), rest untouched.
- `docs/*` — mirrored from ReactApp.
- `Assets/BaseScripts/Internal/Scripts/Models/Data/GameInfo/ViitorCloudGameInfo.cs`
  — added `ApplicationType` enum + `applicationType` field.
- `Assets/BaseScripts/Internal/Scripts/Analytics/` (new folder):
  `IAnalyticsProvider`, `AnalyticsManager`, `AnalyticsEventTaxonomy`,
  `LicenseRegistrationAnalyticsProvider`, `FirebaseAnalyticsProvider`
  (guarded by `FIREBASE_ANALYTICS_ENABLED`), `UIAutoCapture`,
  `AnalyticsIgnoreAttribute`, `AnalyticsEventName`, `AnalyticsLifecycleTracker`,
  `AnalyticsBootstrapper`, `GameAnalyticsEvents`, `EnterpriseAnalyticsEvents`,
  `KioskAnalyticsEvents`.
- `Assets/BaseScripts/Internal/Editor/Analytics/AnalyticsTaxonomyValidator.cs`
  (new) — `[InitializeOnLoad]` script scanning taxonomy for duplicate event
  names / oversized names / duplicate param keys on every domain reload.

## What still needs a human

1. **Deploy backend changes.** `firebase deploy --only firestore:rules,functions`
   is undeployed. Rules deploy is safe (Cloud Functions bypass rules via
   Admin SDK). Functions deploy adds `logEvents` and the admin
   `list-events` endpoint. **Ask before running** — production Firebase
   project shared with the live license-verification flow.
2. **Open the Unity project in the Editor.** Every `.cs` and `.meta`
   file this session was written without a Unity Editor available, so no
   compile check was run. On first open, watch the Console for import
   errors — hand-authored `.meta` GUIDs may collide (extremely unlikely,
   but Unity is the only tool that can confirm).
3. **Import the Firebase Unity SDK** if you want the Firebase provider to
   actually send events. `FirebaseAnalyticsProvider.cs` compiles as a
   no-op today; define `FIREBASE_ANALYTICS_ENABLED` in Player Settings once
   the SDK is imported.
4. **Attach `AnalyticsBootstrapper`** to a scene that loads at boot, drag
   the active `ViitorCloudGameInfoSo` into its `gameInfo` field. Nothing
   fires until this bootstrapper runs.
5. **Consent flow** — for EU/enterprise/kiosk deployments handling PII,
   set `consentRequired = true` on the bootstrapper and call
   `AnalyticsManager.SetCollectionEnabled(true)` from your consent UI
   after acceptance. Not done here (needs your consent UI).

## Cross-repo contract

The only coupling is the HTTP request/response shape of
`POST /logEvents`. If you change it in either repo, update both. See
each repo's `docs/architecture.md`.
