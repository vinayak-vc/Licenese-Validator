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

Collection: `trials`  
Document ID: `deviceId`

```json
{
  "deviceId": "string",
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

### 1) POST `/startTrial`

Request:

```json
{
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
  "token": "<jwt-token>",
  "trialEnd": 1760000000000
}
```

### 2) POST `/verifyTrial`

Request:

```json
{
  "token": "<jwt-token>",
  "deviceId": "device-123"
}
```

Behavior:

- Verifies JWT signature
- Confirms token payload `deviceId` matches request
- Loads Firestore trial record by `deviceId`
- Verifies `tokenId` matches stored token id
- Checks trial expiry against server time

Response:

```json
{
  "valid": true,
  "trialEnd": 1760000000000,
  "reason": "Trial valid"
}
```

## Security

- JWT signing algorithm: `HS256`
- JWT payload:

```json
{
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

### How to run in Postman

1. Import collection and environment files.
2. Select the environment.
3. Set `baseUrl`:
   - Local emulator: `http://127.0.0.1:5005/demo-licence-registration/us-central1`
   - Cloud deploy: `https://us-central1-<your-project-id>.cloudfunctions.net`
4. Run request `1) Start Trial`.
   - It auto-generates `deviceId` if empty.
   - It auto-saves `token` and `trialEnd` from response.
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
  -d "{\"deviceId\":\"device-local-1\",\"systemInfo\":{\"os\":\"Windows 11\",\"cpu\":\"Intel i7\",\"gpu\":\"RTX 3060\"}}"
```

```bash
curl -X POST "http://127.0.0.1:5005/demo-licence-registration/us-central1/verifyTrial" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"device-local-1\",\"token\":\"<jwt-token>\"}"
```

## Example cURL Calls

Start trial:

```bash
curl -X POST "https://<region>-<project-id>.cloudfunctions.net/startTrial" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"device-123\",\"systemInfo\":{\"os\":\"Windows 11\",\"cpu\":\"Intel i7\",\"gpu\":\"RTX 3060\"}}"
```

Verify trial:

```bash
curl -X POST "https://<region>-<project-id>.cloudfunctions.net/verifyTrial" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"device-123\",\"token\":\"<jwt-token>\"}"
```

## Production Notes

- One-trial-per-device enforced by Firestore document ID (`deviceId`)
- Trial creation is race-safe via Firestore `create()` semantics
- Client time is ignored; server time is always used for validity checks
- Input validation and structured error responses included
