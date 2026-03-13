# Trial Licensing System Guide (Admin + Developer)

## 1) Purpose

This backend supports multi-project trial licensing:

- One Firebase project can host multiple software products
- Each product is represented as a `project`
- Each installed machine is represented as a `client/device`
- Trial validation is always server-time based (client clock is ignored)

## 2) Roles

### Admin

- Creates projects
- Shares `projectApiKey` with client app developers
- Monitors registered devices
- Revokes or extends trials

### Developer (Client App Developer)

- Integrates `startTrial` and `verifyTrial` APIs
- Stores received token locally
- Sends `projectApiKey` + `deviceId` on every verify call

## 3) Data Model

## Projects Collection

Path: `projects/{projectId}`

```json
{
  "name": "Mining Simulator",
  "description": "Trial licensing",
  "apiKey": "project-api-key",
  "apiKeyHash": "sha256-hash",
  "apiKeyPreview": "ab12cd...9f0e",
  "active": true,
  "createdAt": "timestamp"
}
```

## Clients Collection

Path: `clients/{projectId}__{deviceId}`

```json
{
  "deviceId": "device-hash",
  "projectId": "abc123def456",
  "tokenId": "uuid",
  "trialStart": 1710000000000,
  "trialEnd": 1710600000000,
  "systemInfo": {
    "os": "Windows 11",
    "cpu": "Intel i7",
    "gpu": "RTX 3060"
  },
  "ip": "x.x.x.x",
  "createdAt": "timestamp"
}
```

## 4) Admin Usage Flow

1. Login to Admin Panel
2. Create Project
3. Copy `projectApiKey` from selected project view
4. Share `projectApiKey` securely with app developer
5. Monitor project clients in panel
6. Revoke trial immediately if abuse is detected
7. Extend trial when approved

## 5) Developer Integration Flow

1. Receive `projectApiKey` from admin
2. User installs desktop app
3. On "Start Trial", call `POST /startTrial`
4. Save returned `token` locally
5. On every app launch, call `POST /verifyTrial`
6. Interpret status codes for UX behavior

## 6) API Flow (Client Side)

## Start Trial

Endpoint: `POST /startTrial`

Request:

```json
{
  "projectApiKey": "<project-api-key>",
  "deviceId": "<device-id>",
  "systemInfo": {
    "os": "Windows 11",
    "cpu": "Intel i7",
    "gpu": "RTX 3060"
  }
}
```

Success:

```json
{
  "message": "Trial started successfully",
  "token": "<jwt>",
  "statusCode": "1000",
  "error": null
}
```

## Verify Trial

Endpoint: `POST /verifyTrial`

Request:

```json
{
  "projectApiKey": "<project-api-key>",
  "deviceId": "<device-id>",
  "token": "<jwt-or-empty>"
}
```

Important statuses:

- `1001`: trial valid
- `9999`: device never registered
- `8888`: registered + token missing + trial active
- `7777`: registered + token missing + trial expired
- `7001`: invalid token
- `7009`: project mismatch

## 7) API Flow (Admin Side)

All admin endpoints require:

- Header: `Authorization: Bearer <firebase-id-token>`
- User must have custom claim: `admin: true`

Endpoints:

- `POST /adminApi/createProject`
- `GET /adminApi/projects`
- `GET /adminApi/projects/{projectId}/clients`
- `POST /adminApi/createClient`
- `POST /adminApi/revokeTrial`
- `POST /adminApi/extendTrial`

## 8) Security Model

- `projectApiKey` identifies project for client APIs
- Server maps `projectApiKey -> projectId`
- JWT payload includes `projectId`, `deviceId`, `tokenId`
- `verifyTrial` enforces project + device + tokenId match
- Admin APIs are protected by Firebase Auth admin claims
- Malformed JSON and validation errors always return standardized JSON

## 9) Standard Response Contract

All APIs return:

```json
{
  "message": "string",
  "token": "string",
  "statusCode": "1000",
  "error": null
}
```

Some admin list endpoints include additional fields such as `projects` or `clients`.

## 10) Deployment + Runtime

Backend:

```bash
npx firebase-tools deploy --only functions
```

Admin panel:

```bash
npx firebase-tools deploy --only hosting
```

## 11) Troubleshooting

- `INVALID_JSON (4005)`: request body is malformed JSON
- `INVALID_PROJECT_API_KEY (4014)`: wrong or unknown project key
- `PROJECT_INACTIVE (7008/403)`: project disabled
- `UNAUTHORIZED (4030)`: missing/invalid bearer token
- `FORBIDDEN (4031)`: token valid but user is not admin

## 12) Operational Best Practices

- Share `projectApiKey` only with trusted client developers
- Rotate keys if leaked (create new project key workflow)
- Keep project and client logs reviewed regularly
- Use Firestore index on `clients.projectId` for fast project filtering

