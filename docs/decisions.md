# Decisions

## 2026-07-01 — Reuse license-tracking backend for analytics, don't stand up a separate system

**Decision:** Extend this Firebase project (Firestore + Cloud Functions +
React admin panel) to ingest general analytics events, instead of building
a separate analytics backend. Firebase GA4 stays as a second, independent
provider on the Unity side (`IAnalyticsProvider` abstraction) for standard
mobile metrics (retention, crash-free rate) that GA4/Crashlytics already do
well.

**Why:** This backend already collects rich per-device telemetry
(`systemInfo`: hardware/display/runtime/country) on every trial check-in,
and the admin panel already has a working per-project client registry +
dashboard (`HardwareInsights.jsx`). Correlating custom events with that
existing hardware/device context is free if events nest under the same
client doc; it would require a join/lookup against a separate system
otherwise.

## 2026-07-01 — Events nest under `clients/{clientDocId}/events`, not a top-level collection

**Decision:** `clients/{projectId}__{deviceId}/events/{eventId}` subcollection.

**Why:** Keeps every event auto-correlated with that device's `systemInfo`
without a join. Matches the existing flat `clients` collection + composite
doc id pattern (`buildClientDocId`) already used throughout `trialService.js`.

## 2026-07-01 — `logEvents` requires the device to already be a registered client

**Decision:** `logEvents` looks up `clients/{clientDocId}` and rejects (404
equivalent, `CLIENT_NOT_FOUND`-style code) if it doesn't exist, rather than
silently creating one.

**Why:** Prevents forged/unregistered devices from writing arbitrary event
data now that `firestore.rules` denies direct client access and this
function is the only write path. A device becomes "registered" via the
existing `startTrial`/`adminCreateClient` flow, which already validates
`projectApiKey` and captures `systemInfo` — event logging shouldn't bypass
that.

## 2026-07-01 — Locked down `firestore.rules`

**Decision:** Changed `allow read, write: if true` to `if false`.

**Why:** The Firebase web config ships inside client apps by design and is
not a secret. `if true` meant anyone could read/write/delete every
`projects`/`clients` doc directly via the Firestore SDK, bypassing all
Cloud Function validation. Cloud Functions use the Admin SDK, which ignores
these rules, so this costs nothing functionally. Flagged to the user
directly (not deployed yet — needs explicit confirmation, see tasks.md).
