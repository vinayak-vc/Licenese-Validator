# Trial Licensing System Backend

Production-grade backend for desktop trial licensing using:

- Node.js
- Firebase Cloud Functions (2nd gen)
- Firebase Admin SDK
- Firestore
- JWT

## Project Structure

```text
functions/
  index.js
  trialService.js
  firebase.js
  package.json
README.md
CHANGELOG.md
```

## Architecture

- `functions/index.js`: HTTP entry points for `startTrial` and `verifyTrial`
- `functions/trialService.js`: business logic, validation, JWT generation/verification, Firestore operations
- `functions/firebase.js`: Firebase Admin initialization and Firestore instance

Server time (`Date.now()` in Cloud Functions runtime) is the source of truth for trial validation.

## Firestore Data Model

Collection: `projects`  
Document ID: `projectId`

```json
{
  "name": "string",
  "description": "string",
  "apiKeyHash": "sha256",
  "apiKeyPreview": "abc123...f9e1",
  "active": true,
  "createdAt": "timestamp"
}
```

Collection: `clients`  
Document ID: `${projectId}__${deviceId}`

```json
{
  "deviceId": "string",
  "projectId": "string",
  "tokenId": "string",
  "trialStart": 0,
  "trialEnd": 0,
  "systemInfo": {
    "os": "string",
    "cpu": "string",
    "gpu": "string"
  },
  "ip": "string",
  "createdAt": "timestamp"
}
```

## API Endpoints

After deployment, each endpoint URL is:

- `https://<region>-<project-id>.cloudfunctions.net/startTrial`
- `https://<region>-<project-id>.cloudfunctions.net/verifyTrial`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/createClient`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/createProject`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/revokeTrial`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/extendTrial`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/listClients`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/projects`
- `https://<region>-<project-id>.cloudfunctions.net/adminApi/projects/{projectId}/clients`

## Unified Response Contract

All responses (success/error) use:

```json
{
  "message": "string",
  "token": "string",
  "statusCode": 1000,
  "error": null
}
```

### 1) POST `/startTrial`

Request:

```json
{
  "projectApiKey": "<project-api-key>",
  "deviceId": "device-123",
  "systemInfo": {
    "os": "Windows 11",
    "cpu": "Intel i7-12700H",
    "gpu": "NVIDIA RTX 3060"
  }
}
```

Behavior:

- Rejects if `deviceId` already exists in Firestore
- Creates 7-day trial using server time
- Generates `tokenId` (UUID)
- Generates JWT with payload `{ deviceId, tokenId }`
- Stores trial record in Firestore

Success response:

```json
{
  "message": "Trial started successfully",
  "token": "<jwt-token>",
  "statusCode": 1000,
  "error": null
}
```

### 2) POST `/verifyTrial`

Request:

```json
{ "projectApiKey": "<project-api-key>", "token": "<jwt-token>", "deviceId": "device-123" }
```

For first-run checks (no local token yet), `token` can be an empty string:

```json
{ "projectApiKey": "<project-api-key>", "token": "", "deviceId": "device-123" }
```

Behavior:

- Resolves `projectApiKey -> projectId`
- Loads Firestore client record by `projectId + deviceId`
- If record does not exist: returns status code `9999`
- If record exists and token is empty while trial active: returns status code `8888`
- If record exists and token is empty while trial expired: returns status code `7777`
- Verifies JWT signature (when token provided)
- Confirms token payload `projectId` matches request project
- Confirms token payload `deviceId` matches request
- Verifies `tokenId` matches stored token id
- Checks trial expiry against server time

Key verify responses:

```json
{
  "message": "Device never registered. Show Start Trial popup.",
  "token": "",
  "statusCode": 9999,
  "error": null
}
```

```json
{
  "message": "Device registered and trial is active. Start Trial popup is not required.",
  "token": "",
  "statusCode": 8888,
  "error": null
}
```

```json
{
  "message": "Trial has expired. Contact admin.",
  "token": "",
  "statusCode": 7777,
  "error": "TRIAL_EXPIRED"
}
```

```json
{
  "message": "Trial verified successfully",
  "token": "<jwt-token>",
  "statusCode": 1001,
  "error": null
}
```

### StatusCode Reference

- `1000`: Trial started successfully
- `1001`: Trial verified successfully
- `1100`: Admin created client trial
- `1101`: Admin revoked trial
- `1102`: Admin extended trial
- `1103`: Admin listed clients
- `1200`: Admin project created
- `1201`: Admin projects listed
- `1202`: Admin project clients listed
- `9999`: Device never registered
- `8888`: Device registered, token missing, trial active
- `7777`: Device registered, token missing, trial expired
- `7001`: Invalid token
- `7002`: Device mismatch
- `7003`: Token revoked or replaced
- `7004`: Trial expired
- `7005`: Corrupt trial record
- `7009`: Project mismatch
- `4000`: Invalid request body
- `4005`: Malformed JSON body
- `4001`: Invalid deviceId
- `4002`: Invalid systemInfo
- `4003`: Invalid systemInfo fields
- `4004`: Invalid token format
- `4014`: Invalid project API key
- `4009`: Trial already used
- `5000`: Internal server error
- `5001`: Missing JWT secret

## Admin API

Admin endpoints require:

- `Authorization: Bearer <Firebase ID token>`
- Authenticated Firebase user must have custom claim: `admin: true`

### POST `/adminApi/createClient`

Request:

```json
{
  "projectId": "abc123def456",
  "deviceId": "device-123",
  "systemInfo": {
    "os": "Windows 11",
    "cpu": "Intel i7",
    "gpu": "RTX 3060"
  },
  "trialDays": 7
}
```

### POST `/adminApi/revokeTrial`

Request:

```json
{
  "projectId": "abc123def456",
  "deviceId": "device-123"
}
```

### POST `/adminApi/extendTrial`

Request:

```json
{
  "projectId": "abc123def456",
  "deviceId": "device-123",
  "extendDays": 7
}
```

### POST `/adminApi/listClients`

Request:

```json
{
  "projectId": "abc123def456",
  "limit": 200,
  "search": "device-123"
}
```

Response includes `clients` array in addition to standard fields:

```json
{
  "message": "Clients listed successfully",
  "token": "",
  "statusCode": 1103,
  "error": null,
  "clients": [
    {
      "deviceId": "device-123",
      "status": "active",
      "trialStart": 0,
      "trialEnd": 0,
      "systemInfo": {
        "os": "Windows",
        "cpu": "Intel",
        "gpu": "RTX"
      }
    }
  ]
}
```

### Admin Auth Setup

Create admin users in Firebase Authentication, then assign admin claim once:

```js
// Run in a trusted Node environment with Admin SDK credentials.
await admin.auth().setCustomUserClaims("<FIREBASE_UID>", { admin: true });
```

This repo includes a ready script:

From `functions/`:

```bash
npm run set-admin-claim -- --uid <FIREBASE_UID>
```

Or by email:

```bash
npm run set-admin-claim -- --email <ADMIN_EMAIL>
```

Remove admin claim:

```bash
npm run set-admin-claim -- --uid <FIREBASE_UID> --remove true
```

Unauthorized/forbidden responses:

- `4030`: Missing/invalid bearer token
- `4031`: User is authenticated but not admin

## Input Rules And Error Handling

### `POST /startTrial` input rules

- `projectApiKey`: required, non-empty string, max 256 chars
- `deviceId`: required, non-empty string, max 256 chars
- `systemInfo`: required object
- `systemInfo.os`: required, non-empty string, max 256 chars
- `systemInfo.cpu`: required, non-empty string, max 256 chars
- `systemInfo.gpu`: required, non-empty string, max 256 chars

Error scenarios:

- duplicate device trial -> HTTP `409`, body `statusCode: 4009`
- invalid body/fields -> HTTP `400`, body `statusCode: 4000/4001/4002/4003`
- missing server secret -> HTTP `500`, body `statusCode: 5001`

### `POST /verifyTrial` input rules

- `projectApiKey`: required, non-empty string, max 256 chars
- `deviceId`: required, non-empty string, max 256 chars
- `token`: optional for first-run checks, can be:
  - empty string `""`
  - `null`
  - non-empty JWT string (max 4096 chars)

Error/decision scenarios:

- invalid `token` type/oversize -> HTTP `400`, body `statusCode: 4004`
- invalid `projectApiKey` -> HTTP `400`, body `statusCode: 4014`
- device not registered -> HTTP `200`, body `statusCode: 9999`
- registered + token missing + trial active -> HTTP `200`, body `statusCode: 8888`
- registered + token missing + trial expired -> HTTP `200`, body `statusCode: 7777`
- invalid JWT -> HTTP `200`, body `statusCode: 7001`
- JWT device mismatch -> HTTP `200`, body `statusCode: 7002`
- tokenId mismatch/revoked token -> HTTP `200`, body `statusCode: 7003`
- trial expired with token -> HTTP `200`, body `statusCode: 7004`
- corrupt trial record -> HTTP `200`, body `statusCode: 7005`

## Security

- JWT signing algorithm: `HS256`
- JWT payload:

```json
{
  "projectId": "string",
  "deviceId": "string",
  "tokenId": "string"
}
```

- Secret storage:
  - Preferred: Firebase Functions Secret Manager (`JWT_SECRET`)
  - Fallback supported: `process.env.JWT_SECRET`

Set secret:

```bash
firebase functions:secrets:set JWT_SECRET
```

## Setup

0. Ensure Node.js 20+ is installed (Firebase Functions runtime target is Node 20).

1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

2. Login

```bash
firebase login
```

3. Initialize Firebase functions in project root (if not already initialized)

```bash
firebase init functions
```

4. Install dependencies

```bash
cd functions
npm install
```

## Deploy

```bash
firebase deploy --only functions
```

This deploys:

- `startTrial` (HTTP function)
- `verifyTrial` (HTTP function)

## Local Development

From `functions/`:

```bash
npm run serve
```

## Tests

From `functions/`:

```bash
npm test
```

Current test coverage includes:

- Service-layer unit tests for `startTrial` and `verifyTrial`
- HTTP handler tests for `startTrial` and `verifyTrial` routes
- Validation/error-path checks and expiry/device/token mismatch behavior

## Postman Testing

Import these files into Postman:

- [Trial-Licensing.postman_collection.json](/I:/Vinayak_Projects/LicenceRegistration/postman/Trial-Licensing.postman_collection.json)
- [Trial-Licensing-Local.postman_environment.json](/I:/Vinayak_Projects/LicenceRegistration/postman/Trial-Licensing-Local.postman_environment.json)
- [Admin-Trial-Licensing.postman_collection.json](/I:/Vinayak_Projects/LicenceRegistration/postman/Admin-Trial-Licensing.postman_collection.json)

## Admin Panel

Admin panel files:

- [index.html](/I:/Vinayak_Projects/LicenceRegistration/admin-panel/index.html)
- [app.js](/I:/Vinayak_Projects/LicenceRegistration/admin-panel/app.js)
- [styles.css](/I:/Vinayak_Projects/LicenceRegistration/admin-panel/styles.css)

Setup:

1. Open `admin-panel/app.js`
2. Set `firebaseConfig` with your Firebase web app config
3. Set `ADMIN_API_BASE` to your deployed function base:
   - `https://us-central1-<project-id>.cloudfunctions.net/adminApi`
4. Serve locally (example):
   - `npx serve admin-panel`
5. Login with Firebase Auth admin user and use:
   - Create/select project
   - Add new client trial
   - Revoke trial immediately
   - Extend trial duration
   - List/search registered clients
   - View/copy selected project's `projectApiKey`
   - Use row action buttons (`+7d`, `Revoke`) directly from table

### How to run in Postman

1. Import collection and environment files.
2. Select the environment.
3. Set `baseUrl`:
   - Local emulator: `http://127.0.0.1:5005/demo-licence-registration/us-central1`
   - Cloud deploy: `https://us-central1-<your-project-id>.cloudfunctions.net`
4. Run request `1) Start Trial`.
   - It auto-generates `deviceId` if empty.
   - It auto-saves `token` from response.
5. Run request `2) Verify Trial`.
   - Uses saved `token` and `deviceId`.
6. Optional: run `3) Verify Trial (Invalid Token Demo)` to confirm rejection flow.

### Testing from several LAN systems

- Best option: test against deployed Cloud Functions URL (`https://...cloudfunctions.net`) so every machine can call the same backend.
- If you test local emulator from multiple machines, you must expose emulator host IP/port and update `baseUrl` accordingly.
- Use a unique `deviceId` per machine; reusing a `deviceId` will correctly return `Trial already used`.

## Local Testing (Functions + Firestore Emulator)

This repo now includes:

- `firebase.json` (functions + firestore emulator config)
- `.firebaserc` (default local demo project id)
- `firestore.rules` (open local rules for emulator testing only)
- `functions/.secret.local` (local `JWT_SECRET` for emulator)

Run local emulators from project root:

```bash
npx firebase-tools emulators:start --only functions,firestore
```

If you are not logged in, emulators can still run for this demo project (`demo-licence-registration`), but deploy and secret management require `firebase login`.

Local endpoint examples:

```bash
curl -X POST "http://127.0.0.1:5005/demo-licence-registration/us-central1/startTrial" \
  -H "Content-Type: application/json" \
  -d "{\"projectApiKey\":\"<project-api-key>\",\"deviceId\":\"device-local-1\",\"systemInfo\":{\"os\":\"Windows 11\",\"cpu\":\"Intel i7\",\"gpu\":\"RTX 3060\"}}"
```

```bash
curl -X POST "http://127.0.0.1:5005/demo-licence-registration/us-central1/verifyTrial" \
  -H "Content-Type: application/json" \
  -d "{\"projectApiKey\":\"<project-api-key>\",\"deviceId\":\"device-local-1\",\"token\":\"<jwt-token>\"}"
```

## Example cURL Calls

Start trial:

```bash
curl -X POST "https://<region>-<project-id>.cloudfunctions.net/startTrial" \
  -H "Content-Type: application/json" \
  -d "{\"projectApiKey\":\"<project-api-key>\",\"deviceId\":\"device-123\",\"systemInfo\":{\"os\":\"Windows 11\",\"cpu\":\"Intel i7\",\"gpu\":\"RTX 3060\"}}"
```

Verify trial:

```bash
curl -X POST "https://<region>-<project-id>.cloudfunctions.net/verifyTrial" \
  -H "Content-Type: application/json" \
  -d "{\"projectApiKey\":\"<project-api-key>\",\"deviceId\":\"device-123\",\"token\":\"<jwt-token>\"}"
```

## Production Notes

- One-trial-per-device-per-project enforced by Firestore document ID (`${projectId}__${deviceId}`)
- Trial tokens are project-scoped (`projectId` in JWT payload)
- Trial creation is race-safe via Firestore `create()` semantics
- Client time is ignored; server time is always used for validity checks
- Input validation and structured error responses included
### POST `/adminApi/createProject`

Request:

```json
{
  "name": "Mining Simulator",
  "description": "Trial licensing for mining simulator"
}
```

Response includes `projectId` and `projectApiKey`.

### GET `/adminApi/projects`

Lists all projects and includes `projectApiKey` (admin-only endpoint).

Example project item:

```json
{
  "projectId": "abc123def456",
  "name": "Mining Simulator",
  "description": "Trial licensing",
  "active": true,
  "apiKeyPreview": "ab12cd...9f0e",
  "projectApiKey": "full-project-api-key"
}
```

### GET `/adminApi/projects/{projectId}/clients`

Lists clients belonging to one project.
