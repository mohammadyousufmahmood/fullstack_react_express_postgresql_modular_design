# Phase 2: Identity Schema and Database Migrations

## Objective

This phase installs the database tables required for user accounts, roles, permissions, and server-side sessions.

The server does **not** run migrations on startup. Use `npm run migrate` whenever the database schema needs to change.

## Design Decisions

### Forward-only migrations

SQL migration files are stored in `backend/migrations/`. The runner at `backend/src/db/migrate.js` records each applied filename and its SHA-256 checksum in `schema_migrations`.

- A second run skips migrations that have already been applied and whose checksums still match.
- If an applied migration file has changed, the runner stops and instructs you to create a new migration file.
- A PostgreSQL advisory lock prevents concurrent migration commands from applying the same migration at the same time.
- Each migration and its checksum record are committed in one transaction.

### User accounts

- `users.email` must be stored in lowercase and is unique.
- Mixed-case email values such as `User@example.com` are rejected by the database.
- Duplicate email addresses are rejected.
- `password_hash` cannot be blank.
- No user accounts are seeded. The migration inserts role and permission definitions only; it creates no default administrator and stores no passwords in SQL.

Application code should normalize email addresses to lowercase before inserting them.

### Role-based access control (RBAC)

The schema includes `roles`, `permissions`, `user_roles`, and `role_permissions`.

- Deleting a user automatically deletes that user's `user_roles` assignments.
- A role cannot be deleted while it is assigned to users.
- A permission cannot be deleted while it is granted to a role.

These constraints help prevent accidental removal of authorization data.

#### Seeded roles and permissions

| Role | Permissions |
|---|---|
| `admin` | `records.read`, `records.create`, `records.update`, `records.delete`, `users.manage` |
| `member` | `records.read`, `records.create`, `records.update`, `records.delete` |

The `member` role does not receive `users.manage`. Record ownership restrictions will be implemented with the records feature in a later phase.

### Server-side sessions

The `sessions` table uses the column names expected by `connect-pg-simple`:

- `sid`
- `sess`
- `expire`

The table name is `sessions`. The session store uses `tableName: 'sessions'`, because the library's default table name is `session`.

The `expire` column uses `timestamp without time zone` to match the library's expiration comparison using `to_timestamp()`.

## Migration Runner

File: `backend/src/db/migrate.js`

The runner:

1. Connects using the existing `DB_*` settings.
2. Acquires a PostgreSQL advisory lock.
3. Creates `schema_migrations` if it does not exist.
4. Checks migration files against stored SHA-256 checksums.
5. Skips already-applied, unchanged migrations.
6. Runs each pending SQL file in a transaction and records its checksum.
7. Releases the advisory lock.

If a migration fails, its transaction is rolled back. Applied migration files must not be edited; add a new migration for subsequent schema changes.

## What `npm run migrate` Does

Run the command from the `backend` directory:

```bash
npm run migrate
```

The first run applies pending migrations. A subsequent run makes no schema changes if all applied migration checksums match.

There is no new HTTP route. `GET /health` continues to report database readiness. If the identity tables are missing, the server logs:

```text
Identity schema is not installed. Run npm run migrate.
```

The server continues running and does not automatically modify the schema.

## Database Setup Notes

### PostgreSQL 18 schema permissions

On the development machine, the `auth_user` role needed permission to create objects in the `public` schema. The database owner granted this privilege:

```sql
GRANT CREATE ON SCHEMA public TO auth_user;
```

This is environment-specific setup, not a migration that the application runs automatically. Apply it only with an appropriately privileged database role and according to your environment's security policy.

### Previous experimental table

The `auth_app` database had an empty `users` table from an earlier experiment, with a `bigint` ID and an integer role column. That empty table was dropped so this migration could create the intended Phase 2 schema.

Do not drop tables in a populated or shared environment without checking their data and dependencies first.

## Files

### Created

- `backend/migrations/001_identity_and_sessions.sql`
- `backend/src/db/migrate.js`
- `backend/test/phase2.test.js`

### Modified

- `backend/package.json` — added the `npm run migrate` script.
- `backend/src/server.js` — warns when `users` or `sessions` is missing.
- `backend/README.md` — added Phase 2 notes.

## Commands

Run these commands from `backend`:

```bash
npm run migrate
npm test
npm run dev
```

Check database readiness in another terminal:

```powershell
curl.exe http://127.0.0.1:3000/health
```

## Verification Results

All seven tests passed, including the Phase 1 checks. `GET /health` returned HTTP 200 with `"database": "up"`, and startup did not warn about a missing identity schema. The development server was stopped afterward, leaving port 3000 free.

## Acceptance Criteria

- [x] `npm run migrate` applies `001_identity_and_sessions.sql` once.
- [x] A second run applies no additional changes.
- [x] The `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`, and `schema_migrations` tables exist.
- [x] `admin` has all five seeded permissions.
- [x] `member` has only the four `records.*` permissions.
- [x] No user account is seeded.
- [x] Mixed-case email values are rejected.
- [x] Duplicate email addresses are rejected.
- [x] Deleting a permission that is still granted to a role is rejected.
- [x] Deleting a user removes that user's role assignments.
- [x] All seven tests pass, including Phase 1 checks.
- [x] The health endpoint returns HTTP 200 when the database is ready and the identity schema is installed.
- [x] The server does not run migrations automatically at startup.

## Phase 2 Outcome

The database now has a versioned identity schema, seeded RBAC definitions, and the table structure needed for PostgreSQL-backed sessions. Later phases can build authorization middleware and record ownership enforcement on this foundation.

# Phase 3: Login, logout, and sessions

## Objective

This phase lets a person prove who they are and keeps that proof on the server. The browser receives an opaque session id in an HttpOnly cookie. The password and the session contents stay in PostgreSQL.

There is no public registration route. An administrator account is created with `npm run create-admin`.

## Design decisions

### Passwords

Passwords are hashed with Argon2id using the OWASP baseline: 19 MiB of memory, 2 iterations, and parallelism 1. Login compares hashes with `argon2.verify`. An unknown email still runs a verify against a dummy hash so the failure is not obviously faster than a wrong password.

Unknown emails, wrong passwords, and inactive accounts all return the same `401` body: `INVALID_CREDENTIALS` / `Invalid email or password`.

New passwords must be 12 to 200 characters and must not be the email address or a short list of obvious passwords. Login accepts any non-empty password up to 200 characters and then returns the generic error when it does not match. The login response never includes `password_hash`.

### Sessions

`express-session` stores sessions through `connect-pg-simple` in the `sessions` table. The cookie name is `sid`. It is HttpOnly, `SameSite=Lax`, and `Secure` only when `NODE_ENV=production`. The default lifetime is 8 hours.

`saveUninitialized` is false, so a request that never touches the session does not create a row. After a successful login the server calls `session.regenerate`, which deletes the pre-login session and issues a new id. Logout destroys the row and clears the cookie. A later request with the old cookie is not authenticated.

The session JSON stores `userId`. It does not store the password.

### CSRF

`SameSite=Lax` blocks a foreign site from posting with the session cookie. State-changing requests also require the `x-csrf-token` header. `GET /auth/csrf` puts a random token in the server-side session and returns it in JSON. Login replaces that token because the session id changed. The client should keep the token in memory. Do not put the session id or the CSRF token in `localStorage`.

### Login rate limit

`POST /auth/login` allows 10 attempts per client IP and email in 15 minutes, in this process's memory. A second server process has its own counter. The limit runs after the CSRF check, so only requests that present a token consume it. Extra attempts receive `429 TOO_MANY_REQUESTS`.

### Administrator setup

`npm run create-admin` reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment of that command. It hashes the password, inserts the user, and assigns the `admin` role in one transaction. It does not reset the password when the email already exists. Do not write the administrator password into `.env` or into source control.

`SESSION_SECRET` must be at least 32 characters. Production refuses the placeholder from `.env.example`.

## Request flow

### `GET /auth/csrf`

1. Session middleware starts an anonymous session when the token is stored.
2. The response is `{ "csrfToken": "..." }` and a `Set-Cookie` header for `sid`.

### `POST /auth/login`

1. The JSON parser reads `email` and `password`.
2. The CSRF middleware compares `x-csrf-token` with the token in the session.
3. The rate limiter counts the attempt.
4. The email is trimmed and lowercased. Argon2id verifies the password.
5. On success, the session id is regenerated, `userId` is stored, and a new CSRF token is returned with the user id and email.
6. On failure, the response is the generic `401`.

### `POST /auth/logout`

1. CSRF is checked against the token from the latest login response.
2. `requireAuth` loads the active user from the session.
3. The session row is deleted and the cookie is cleared. The response is `204`.

### `GET /auth/me`

1. `requireAuth` requires a session whose user is still active.
2. The response is `{ "user": { "id", "email" } }`. An inactive or missing user becomes `401`, and that session is destroyed.

## Files

### Created

- `backend/src/session.js`
- `backend/src/middleware/csrf.js`
- `backend/src/middleware/requireAuth.js`
- `backend/src/middleware/loginRateLimit.js`
- `backend/src/modules/auth/password.js`
- `backend/src/modules/auth/auth.validation.js`
- `backend/src/modules/auth/auth.service.js`
- `backend/src/modules/auth/auth.controller.js`
- `backend/src/modules/auth/auth.routes.js`
- `backend/src/modules/auth/sessionState.js`
- `backend/src/modules/users/user.repository.js`
- `backend/src/scripts/create-admin.js`
- `backend/test/phase3.test.js`

### Modified

- `backend/src/config/env.js`
- `backend/src/app.js`
- `backend/src/server.js`
- `backend/package.json`
- `backend/.env.example`
- `backend/.env` — local `SESSION_SECRET` only; the value is not committed

## Commands

From `backend`:

```powershell
npm test
npm run dev
```

Create the first administrator in a PowerShell session. Pick a unique password of at least 12 characters. This does not print the password back.

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "replace-with-a-long-unique-password"
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD
```

Exercise the cookie flow:

```powershell
curl.exe -c cookies.txt http://127.0.0.1:3000/auth/csrf
curl.exe -b cookies.txt -c cookies.txt -X POST http://127.0.0.1:3000/auth/login -H "Content-Type: application/json" -H "x-csrf-token: TOKEN_FROM_THE_CSRF_RESPONSE" --data "{\"email\":\"admin@example.com\",\"password\":\"YOUR_PASSWORD\"}"
curl.exe -b cookies.txt http://127.0.0.1:3000/auth/me
curl.exe -b cookies.txt -c cookies.txt -X POST http://127.0.0.1:3000/auth/logout -H "x-csrf-token: TOKEN_FROM_THE_LOGIN_RESPONSE"
```

Use the CSRF token from the login response for logout. The token from `GET /auth/csrf` was replaced when the session id rotated.

## Acceptance criteria

- `POST /auth/login` with a correct password returns the user id and email, a new CSRF token, and a new `sid` cookie.
- The pre-login session row is gone after login. Logout deletes the authenticated session.
- Wrong password, unknown email, and inactive user return the same `401` body.
- A missing or wrong CSRF token returns `403`.
- Login attempts past the configured maximum return `429`.
- Stored passwords start with `$argon2id$`.
- Creating an account for a role that does not exist leaves no user row.
- `npm test` still passes the Phase 1 and Phase 2 checks.
