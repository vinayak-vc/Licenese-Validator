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
