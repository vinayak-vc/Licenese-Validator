# Project Overview

## What this is

Firebase-backed trial licensing system, originally: verify/issue device trial
licenses for Unity (and other) client apps. Now being extended into a general
analytics ingestion + dashboard system, reusing the same per-project,
per-device data model.

Two repos:

- `C:\ReactApp\LicenceRegistration` (this repo) — Firebase Cloud Functions
  backend + Firestore + React admin dashboard (`admin-panel/`).
- `C:\Unity\unityvc-base-project` — Unity base project template that
  integrates as a client (`Assets\Modules\License Verifier`,
  `Assets\BaseScripts\Internal\Scripts\Analytics`).

## Components

- `functions/` — Cloud Functions (Express apps via `onRequest`).
  - `index.js` — HTTP endpoint wiring (`startTrial`, `verifyTrial`,
    `adminApi`, `trialExpiryDigest` scheduled job, `logEvents`).
  - `trialService.js` — all business logic, validation, Firestore access.
  - `emailService.js` — admin email notifications (Brevo).
- `admin-panel/` — React (Vite + Tailwind) dashboard. Pages: Dashboard,
  ClientRegistry, GlobalSearch, HardwareInsights, IntegrationHub,
  ProjectSettings, Login. `AnalyticsDashboard` page planned (see roadmap.md).
- `admin-panel-legacy/` — old static HTML/JS admin panel, superseded by
  `admin-panel/`. Not actively developed.
- `firestore.rules` — Firestore security rules. All access goes through
  Cloud Functions (Admin SDK); direct client SDK access is denied.

## Data model (see architecture.md for detail)

- `projects/{projectId}` — one per client product/game/app.
- `clients/{projectId}__{deviceId}` — one per installed device per project.
- `clients/{projectId}__{deviceId}/events/{eventId}` — analytics events
  (new, added for the analytics extension).

## Who uses this

- Admins: create projects, share `projectApiKey`, monitor devices, revoke/
  extend trials, review analytics.
- Client app developers: integrate `startTrial`/`verifyTrial`/`logEvents`
  APIs into their Unity (or other) app.
