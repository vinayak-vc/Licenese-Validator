# Changelog

## 2026-03-12

### Added

- Created `functions/package.json` with production dependencies:
  - `firebase-functions`
  - `firebase-admin`
  - `express`
  - `jsonwebtoken`
  - `uuid`
- Added Node.js 20 runtime config and useful scripts (`serve`, `shell`, `deploy`, `logs`).

- Created `functions/firebase.js`:
  - Firebase Admin initialization
  - Firestore instance export

- Created `functions/trialService.js`:
  - Input validation for `startTrial` and `verifyTrial`
  - Trial creation logic with 7-day server-side window
  - UUID `tokenId` generation
  - JWT token generation and verification
  - Firestore integration for `trials` collection
  - Business error model (`TrialServiceError`) with status codes and codes
  - Consistent verification responses (`valid`, `trialEnd`, `reason`)

- Created `functions/index.js`:
  - Firebase Cloud Functions 2nd gen HTTP handlers
  - Express apps for `startTrial` and `verifyTrial`
  - JSON parsing and method guard (`405`)
  - Centralized error handling
  - Secret Manager integration via `defineSecret("JWT_SECRET")`
  - Function exports:
    - `startTrial`
    - `verifyTrial`

- Added `README.md`:
  - Full architecture and flow
  - Firestore schema
  - Endpoint contract documentation
  - Security model and JWT payload
  - Setup and deploy instructions:
    - `npm install -g firebase-tools`
    - `firebase login`
    - `firebase init functions`
    - `firebase deploy --only functions`
  - cURL usage examples
  - Production notes

### Updated

- Installed Firebase CLI tooling compatible with current local Node runtime:
  - Global install adjusted to `firebase-tools@13.35.1` due Node `18.17.1`.
- Installed function dependencies in `functions/` for local runtime usage.
- Added local Firebase project configuration:
  - `firebase.json` with Functions + Firestore emulator config and ports
  - `.firebaserc` with default local project id `demo-licence-registration`
  - `firestore.rules` for local emulator testing
- Added local secret support:
  - `functions/.secret.local` with `JWT_SECRET` for emulator execution
  - `.gitignore` updated to ignore `.secret.local` files
- Updated `README.md` with end-to-end local emulator testing instructions and local endpoint examples.
- Adjusted local emulator ports to avoid collisions on this machine:
  - Functions: `5005`
  - Firestore: `8085`
  - Emulator UI: `4005`
  - Hub: `4405`
  - Logging: `4505`
- Fixed runtime timestamp bug in `functions/trialService.js`:
  - Replaced `admin.firestore.FieldValue.serverTimestamp()` with `FieldValue.serverTimestamp()` from `firebase-admin/firestore` (Admin SDK v12-safe usage).
- Verified local API flow successfully:
  - `startTrial` returns token and `trialEnd`
  - `verifyTrial` returns `valid: true`
- Updated `.gitignore` to ignore local emulator log artifacts (`emulator.log`, `firestore-debug.log`).

### Testing

- Added Jest-based test tooling in `functions/package.json`:
  - Script: `npm test` -> `jest --runInBand --detectOpenHandles`
  - Dev dependencies: `jest`, `supertest`
- Added unit test suite:
  - `functions/__tests__/trialService.test.js`
  - Covers trial creation, duplicate trial handling, validation, token verification, mismatch cases, and expiry logic.
- Added HTTP handler test suite:
  - `functions/__tests__/index.test.js`
  - Covers success responses, method guards, and structured service-error mapping for API endpoints.
- Updated `README.md` with test execution instructions and testing scope summary.

### Added

- Added Postman assets for API verification:
  - `postman/Trial-Licensing.postman_collection.json`
  - `postman/Trial-Licensing-Local.postman_environment.json`
- Collection includes:
  - `1) Start Trial` (auto-generates `deviceId` if empty, stores `token` and `trialEnd`)
  - `2) Verify Trial` (uses captured token/deviceId)
  - `3) Verify Trial (Invalid Token Demo)` (negative-path validation)
- Updated `README.md` with Postman import and execution steps for both:
  - Local emulator base URL
  - Cloud Functions deployed base URL
- Documented multi-machine LAN testing guidance and unique `deviceId` requirement per system.

### Updated

- Updated `/verifyTrial` behavior in `functions/trialService.js` to support first-run clients with no token:
  - Empty string token is now accepted at validation layer.
  - Firestore record existence is checked before JWT validation.
  - If no record exists, response is `valid: false` with `reason: "Trial record not found"`.
  - If record exists but token is empty, response is `valid: false` with `reason: "Token required"`.
- Adjusted invalid-token/device-mismatch responses to include known `trialEnd` when trial record exists.
- Expanded tests in `functions/__tests__/trialService.test.js` for:
  - Unregistered device with empty token
  - Existing device with empty token
- Updated `README.md` to document empty-token verify request and expected reasons.

### Updated

- Standardized API response format for all endpoints and all outcomes:
  - `{ message, token, statusCode, error }`
- Removed `trialEnd` from all API responses (server still uses it internally for validation).
- Refactored `functions/trialService.js` with explicit response code catalog and consistent message/error mapping.
- Implemented requested verify-state codes:
  - `9999`: device never registered (show Start Trial popup)
  - `8888`: device registered, token missing, trial active
  - `7777`: device registered, token missing, trial expired (contact admin)
- Added/updated additional status codes for token/device/record/validation/internal-error paths.
- Updated HTTP error handler in `functions/index.js` to return the standardized response body on all error paths.
- Updated test suites to validate new response contract and code mapping:
  - `functions/__tests__/trialService.test.js`
  - `functions/__tests__/index.test.js`
- Updated Postman assets to validate the new contract and removed obsolete `trialEnd` variable:
  - `postman/Trial-Licensing.postman_collection.json`
  - `postman/Trial-Licensing-Local.postman_environment.json`
- Updated `README.md` with new response contract, status-code reference, and verify behavior documentation.

### Added

- Added secure admin API capabilities in backend:
  - `POST /adminApi/createClient` (add client + create trial)
  - `POST /adminApi/revokeTrial` (revoke trial immediately)
  - `POST /adminApi/extendTrial` (extend trial by days)
- Added Firebase Auth admin middleware in `functions/index.js`:
  - Validates bearer token via `admin.auth().verifyIdToken`
  - Requires custom claim `admin: true`
  - Returns standardized 4030/4031 responses for unauthorized/forbidden requests
- Added admin service operations and validation in `functions/trialService.js`:
  - `adminCreateClient`
  - `adminRevokeTrial`
  - `adminExtendTrial`
  - New status codes for admin workflows (`1100`, `1101`, `1102`) and related validation/auth errors
- Added lightweight web admin panel:
  - `admin-panel/index.html`
  - `admin-panel/app.js`
  - `admin-panel/styles.css`
  - Supports login, add client, revoke trial, extend trial, and response display
- Added Admin Postman collection:
  - `postman/Admin-Trial-Licensing.postman_collection.json`
  - Covers create client, revoke trial, and extend trial with admin bearer token
- Expanded tests:
  - Updated `functions/__tests__/index.test.js` to include admin route handling
  - Updated `functions/__tests__/trialService.test.js` to cover admin service actions
  - Test status: all suites passing
- Updated `README.md` with admin API docs, auth requirements, admin-claim setup, and admin panel setup instructions.

### Updated

- Added new admin endpoint: `POST /adminApi/listClients`
  - Returns standardized response plus `clients` array for management UI.
  - Supports optional `limit` and `search` filter.
- Enhanced admin panel UI to include registered clients management:
  - Replaced placeholder hosting page with full admin interface (`admin-panel/index.html`).
  - Added clients table view with status/system/trial info.
  - Added refresh/search and row-level actions:
    - `+7d` extend
    - `Revoke`
  - Integrated list refresh after create/revoke/extend actions.
- Updated backend and tests:
  - `functions/index.js` wired `/adminApi/listClients`
  - `functions/trialService.js` added `adminListClients` and status code `1103`
  - `functions/__tests__/index.test.js` added list-clients route assertion
  - `functions/__tests__/trialService.test.js` added list-clients service assertion
- Updated `README.md` with `listClients` contract and admin panel client-list usage.

### Added

- Added helper script to manage Firebase admin custom claims:
  - `functions/scripts/setAdminClaim.js`
  - Supports:
    - set admin by UID (`--uid`)
    - set admin by email (`--email`)
    - remove admin claim (`--remove true`)
- Added npm script alias:
  - `npm run set-admin-claim -- --uid <FIREBASE_UID>`
- Updated `README.md` with copy-paste admin-claim commands.
- Fixed argument parser in `setAdminClaim.js` to avoid hanging on flag-only options (e.g. `--help`).

### Updated

- Added malformed JSON parser handling in `functions/index.js` so invalid JSON requests return standardized API response.
- New malformed JSON response:
  - HTTP `400`
  - `statusCode: "4005"`
  - `error: "INVALID_JSON"`
  - `message: "Malformed JSON body"`
- Added regression test in `functions/__tests__/index.test.js` to verify malformed JSON behavior.
- Updated `README.md` with `4005` status code reference.

### Updated

- Refactored backend to multi-project licensing model:
  - New collections: `projects` and `clients`
  - `clients` are project-scoped via doc id `${projectId}__${deviceId}`
- Updated trial APIs to require `projectApiKey`:
  - `startTrial` resolves `projectApiKey -> projectId`
  - `verifyTrial` enforces project-scoped token and client validation
- Added project isolation in JWT payload (`projectId`, `deviceId`, `tokenId`) to prevent cross-project token reuse.
- Added admin project APIs:
  - `POST /adminApi/createProject`
  - `GET /adminApi/projects`
  - `GET /adminApi/projects/{projectId}/clients`
- Updated admin client APIs to be project-aware (`projectId` required for create/revoke/extend/list).
- Added project-level status codes (`1200`, `1201`, `1202`) and project validation codes (`4014`, `7009`).
- Updated test suites for multi-project flow and project APIs.
- Updated `README.md` with new data model, endpoint contracts, and request examples.

- Refreshed Postman collections for project-scoped licensing flow:
  - `postman/Trial-Licensing.postman_collection.json`
  - Added `projectApiKey` in `startTrial` and `verifyTrial` requests
  - Added first-run verify request template with empty token
- Expanded admin Postman coverage:
  - `postman/Admin-Trial-Licensing.postman_collection.json`
  - Added project lifecycle requests:
    - create project
    - list projects
    - list clients by project (GET and POST variants)
  - Updated client admin operations to include `projectId`
  - Added test script in create-project request to auto-capture `projectId` and `projectApiKey`
- Updated local Postman environment:
  - `postman/Trial-Licensing-Local.postman_environment.json`
  - Added `adminBaseUrl`, `projectApiKey`, `projectId`, and `adminIdToken` variables

### Updated

- Admin project visibility enhancements:
  - `adminCreateProject` now persists project `apiKey` in project document for admin retrieval.
  - `adminListProjects` now returns `projectApiKey` for each project (admin-only API).
- Admin panel enhancements:
  - Added `projectApiKey` display field for selected project.
  - Added "Copy" action to copy selected project's `projectApiKey` to clipboard.
  - Added contextual hint for legacy projects that do not have a stored `projectApiKey`.
- Updated `README.md`:
  - Clarified that `projectApiKey` is visible via admin projects endpoint.
  - Added project item response example with `projectApiKey`.
  - Documented admin panel ability to view/copy `projectApiKey`.

## 2026-03-13

### Added

- Added a complete admin/developer operations guide:
  - `docs/ADMIN_DEVELOPER_SYSTEM_GUIDE.md`
  - Includes end-to-end architecture, roles, flows, API usage, status code behavior, deployment, and troubleshooting.

### Updated

- Updated `README.md` with a dedicated **System Guide** section linking to:
  - `docs/ADMIN_DEVELOPER_SYSTEM_GUIDE.md`
- Changed API contract typing for `statusCode` from number to string across the project.
- Backend updates:
  - `functions/trialService.js`: all `CODES` values converted to string literals.
  - `responseBody()` and `TrialServiceError` now normalize `statusCode` as string.
  - Added `CODES.METHOD_NOT_ALLOWED` and used it in `functions/index.js`.
- Test updates:
  - `functions/__tests__/index.test.js` now expects string status codes.
  - Jest suites pass with updated contract.
- Postman updates:
  - `postman/Trial-Licensing.postman_collection.json`
  - `postman/Admin-Trial-Licensing.postman_collection.json`
  - Assertions updated to validate string status codes.
- Documentation updates:
  - `README.md` and `docs/ADMIN_DEVELOPER_SYSTEM_GUIDE.md` examples now show `statusCode` as string.

### Updated

- Improved Admin Panel UX and visual design:
  - Applied full dark theme styling in `admin-panel/styles.css`.
  - Removed raw API response panel from `admin-panel/index.html`.
  - Added global visual feedback bar (info/success/warning/error states).
  - Added loading/disabled button states for login, refresh, create, extend, and revoke actions.
  - Added status pills in clients table for clearer active/expired/revoked visibility.
  - Improved empty-state messaging and responsive layout behavior for mobile screens.
- Refactored `admin-panel/app.js`:
  - Removed `renderResponse` / raw JSON output flow.
  - Added centralized feedback handling and better API error surfacing for operators.
  - Added action-level success/error messaging after each operation.

