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
