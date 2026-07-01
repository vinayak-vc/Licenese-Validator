# Roadmap

## Done — analytics extension

- [x] Lock down `firestore.rules` (direct client access was wide open).
- [x] `applicationType` field on `projects` (Game/Enterprise/Kiosk).
- [x] `logEvents` batch ingestion endpoint + `events` subcollection.
- [x] `adminListClientEvents` admin read endpoint for the dashboard.
- [x] Unity: `IAnalyticsProvider` / `AnalyticsManager` core engine.
- [x] Unity: `LicenseRegistrationAnalyticsProvider`.
- [x] Unity: `FirebaseAnalyticsProvider` (guarded).
- [x] Unity: `ApplicationType` enum on `ViitorCloudGameInfo`.
- [x] Unity: automatic UI capture (`UIAutoCapture`).
- [x] Unity: typed per-app-type event helpers (Game/Enterprise/Kiosk).
- [x] Unity: lifecycle tracker + bootstrapper + consent gate.
- [x] Admin panel: `AnalyticsDashboard.jsx` page.
- [x] Postman: `logEvents` request added.
- [x] Editor taxonomy collision check.

## Not deployed / pending human action

- Deploy rules + functions changes to Firebase (needs explicit
  confirmation — see decisions.md).
- Verify Unity code compiles inside the Editor (no Editor available at
  authoring time; see Unity repo's `docs/ai_handoff.md`).
- Attach `AnalyticsBootstrapper` to a boot scene and wire consent UI.

## Backlog / future

- Firestore-triggered server-side event aggregation (only needed once
  client-side aggregation in the dashboard becomes slow at scale).
- Filter existing dashboard pages (HardwareInsights, ClientRegistry) by
  `applicationType`, not just the new Analytics page.
