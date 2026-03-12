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
