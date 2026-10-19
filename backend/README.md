# Backend API — Phase 1: Foundation

> **Status:** Implemented and verified  
> **Scope:** API shell, environment validation, PostgreSQL connection pool, readiness check, and centralized error handling  
> **Out of scope:** Authentication, database schema, migrations, and application records

## Overview

Phase 1 establishes a stable foundation for the backend API. It provides startup configuration validation, one shared PostgreSQL connection pool, a database readiness endpoint, and a consistent error-response format that future modules can reuse.

### Goals

- Fail fast at startup when required configuration is missing or invalid.
- Reuse PostgreSQL connections through a shared `pg.Pool`.
- Expose a readiness endpoint that checks database connectivity.
- Return a consistent error envelope for API failures.
- Keep shared infrastructure separate from business modules.
- Make the Express app testable without starting the production server.

## Architecture and Design Decisions

### Project structure

Business features live under `src/modules/<feature>/`. At this stage, **Health** is the only feature module. Shared configuration, database access, logging, and HTTP error handling remain outside the modules because they are infrastructure used across the application.

```text
backend/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   └── env.js
│   ├── db/
│   │   └── pool.js
│   ├── errors/
│   │   └── AppError.js
│   ├── lib/
│   │   └── logger.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── notFound.js
│   └── modules/
│       └── health/
│           ├── health.controller.js
│           └── health.routes.js
└── test/
    └── phase1.test.js
```

### Application and server separation

- `src/app.js` creates and configures the Express application.
- `src/server.js` is the only file responsible for listening on a port.
- Tests can create the app and run it on a temporary port without launching the normal server.
- The project uses **CommonJS**, matching `"type": "commonjs"` in `package.json`.

### PostgreSQL connection pooling

The application uses a shared `pg.Pool`. A pool reuses database connections across requests and avoids creating a new connection for every query. A single shared client could become a bottleneck when requests need database access.

The readiness check runs `SELECT 1`. It does not use user input, so parameterized queries are not needed for this query. Use parameterized queries when future database queries include values supplied by users or other external input.

### Configuration and secrets

- `src/config/env.js` validates configuration at startup.
- `backend/.env` contains local environment values and must remain untracked.
- `backend/.env.example` documents the required configuration using placeholders only.
- `NODE_ENV` and `CLIENT_ORIGIN` were added to the existing `.env`; existing database settings were left unchanged.

Never commit real passwords, tokens, or other secrets.

### Centralized errors

Expected application errors use `AppError`, such as a request to an unknown route. Unexpected errors are logged with their stack trace and returned to clients as a generic `500 Internal server error`. Sensitive database details and secrets are not exposed in HTTP responses.

All error responses use this envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found: GET /missing"
  }
}
```

Express 5 automatically forwards rejected promises from asynchronous route handlers to error-handling middleware. Routes therefore do not need a separate async wrapper. The health controller intentionally catches database failures and responds with `503 Service Unavailable`, since that is a known readiness failure rather than an unknown application error.

### HTTP middleware and security defaults

The middleware order is intentional:

1. CORS
2. JSON body parser
3. Feature routes
4. 404 handler
5. Centralized error handler

The error handler is last and uses Express's four-argument signature.

Additional defaults:

- CORS allows only the configured `CLIENT_ORIGIN`.
- `credentials: true` allows credentialed browser requests, which will be needed for a future session-cookie flow. Credentialed CORS cannot use `Access-Control-Allow-Origin: *`.
- JSON request bodies are limited to **100 KB**.
- The `X-Powered-By` header is disabled.

## Health Endpoint

### `GET /health`

This is a **readiness check**: it reports whether the API can reach PostgreSQL. If PostgreSQL is unavailable, the process stays running and the endpoint returns `503`, making the dependency failure visible without immediately terminating the server.

**Success — HTTP `200 OK`**

```json
{
  "status": "ok",
  "database": "up"
}
```

**Database unavailable — HTTP `503 Service Unavailable`**

```json
{
  "status": "error",
  "database": "down"
}
```

### Request flow

#### `GET /health`

1. `server.js` loads the environment configuration, creates the app, and starts listening.
2. CORS and the JSON parser run.
3. `health.routes.js` matches `GET /health`.
4. `getHealth` executes `pool.query('SELECT 1')`.
5. The endpoint returns `200` if the query succeeds or `503` if the database connection fails.

#### `GET /missing`

1. No route matches the request.
2. `notFound` passes an `AppError` with status `404` and code `NOT_FOUND`.
3. `errorHandler` returns the standard error envelope without exposing a stack trace.

Example response:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found: GET /missing"
  }
}
```

#### Malformed JSON

A `POST` request with `Content-Type: application/json` and an invalid body such as `{` is rejected by `express.json` before the route runs. The error handler responds with HTTP `400 Bad Request` and code `INVALID_JSON`.

Example response shape:

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Invalid JSON request body"
  }
}
```

## Files Added and Updated

### Created

- `backend/.gitignore`
- `backend/.env.example`
- `backend/src/config/env.js`
- `backend/src/lib/logger.js`
- `backend/src/errors/AppError.js`
- `backend/src/db/pool.js`
- `backend/src/middleware/notFound.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/modules/health/health.controller.js`
- `backend/src/modules/health/health.routes.js`
- `backend/src/app.js`
- `backend/src/server.js`
- `backend/test/phase1.test.js`

### Modified

- `backend/package.json` — `npm test` runs Node.js's built-in test runner.
- `backend/.env` — added `NODE_ENV` and `CLIENT_ORIGIN`; existing database settings were preserved.

## Running the Project

Run these commands from the `backend` directory.

### Run the tests

```bash
npm test
```

### Start the development server

```bash
npm run dev
```

### Start without file watching

```bash
npm start
```

`npm start` runs the server normally without development file watching.

## Manual API Checks

Start the server with `npm run dev`. In a second PowerShell terminal, use `curl.exe` (rather than `curl`, which may be an alias for `Invoke-WebRequest` in PowerShell).

### Check database readiness

```powershell
curl.exe http://127.0.0.1:3000/health
```

Expected: HTTP `200` and `"database": "up"` while PostgreSQL is available.

### Check the 404 response

```powershell
curl.exe http://127.0.0.1:3000/missing
```

Expected: HTTP `404` and `error.code` equal to `NOT_FOUND`.

### Check malformed JSON handling

```powershell
curl.exe -X POST http://127.0.0.1:3000/health `
  -H "Content-Type: application/json" `
  --data "{"
```

Expected: HTTP `400` and `error.code` equal to `INVALID_JSON`.

## Verification Results

The following checks were completed for Phase 1:

- All **5 automated tests passed**.
- A real `SELECT 1` query succeeded against the local `auth_app` PostgreSQL database.
- A live server on port `3000` returned:
  - `200` for `/health` when PostgreSQL was available.
  - `404` for an unknown route.
  - `400` for malformed JSON.
- The verification server was stopped after testing, leaving port `3000` available for `npm run dev`.

One test intentionally throws a fake error containing `password=secret detail`. The logger records the original error for testing purposes, while the HTTP response remains the generic `Internal server error`. This confirms that unexpected error details are not returned to the client.

## Acceptance Criteria

- [x] `npm test` passes.
- [x] `GET /health` returns HTTP `200` and `"database": "up"` while PostgreSQL is running.
- [x] An unknown path returns HTTP `404` with `error.code: "NOT_FOUND"`.
- [x] Malformed JSON returns HTTP `400` with `error.code: "INVALID_JSON"`.
- [x] `backend/.env` is excluded from version control.
- [x] `backend/.env.example` contains placeholders only and no real database password.

## Scope of the Next Phase

Phase 1 is infrastructure only. It does **not** implement authentication, authorization, roles or permissions, database schema migrations, or application records. Those can be added as separate modules on top of this foundation.
