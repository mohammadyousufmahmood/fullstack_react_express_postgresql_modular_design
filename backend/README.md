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

The table name is `sessions`. In Phase 3, configure the session store with `tableName: 'sessions'`, because the library's default table name is `session`.

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

The database now has a versioned identity schema, seeded RBAC definitions, and the table structure needed for PostgreSQL-backed sessions. Later phases can build authentication, session management, authorization middleware, and record ownership enforcement on this foundation.
