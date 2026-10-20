-- Identity, authorization reference data, and the session store.
-- Applied once by src/db/migrate.js. Add a new file for later changes.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email)),
  CONSTRAINT users_email_length_chk CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT users_password_hash_not_blank_chk CHECK (char_length(password_hash) > 0)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_name_unique UNIQUE (name),
  CONSTRAINT roles_name_format_chk CHECK (name ~ '^[a-z][a-z0-9_]{1,63}$')
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_name_unique UNIQUE (name),
  CONSTRAINT permissions_name_format_chk CHECK (name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

-- Assignments disappear with the user. A role that is still assigned cannot be deleted.
CREATE TABLE user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id),
  CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT
);

-- Grants disappear with the role. A permission that is still granted cannot be deleted.
CREATE TABLE role_permissions (
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id),
  CONSTRAINT role_permissions_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_permission_id_fkey
    FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE RESTRICT
);

CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);
CREATE INDEX role_permissions_permission_id_idx ON role_permissions (permission_id);

-- Column names and types match connect-pg-simple.
-- Phase 3 must set tableName to "sessions"; the library's default table name is "session".
-- expire is timestamp without time zone because the library compares it with to_timestamp().
CREATE TABLE sessions (
  sid varchar NOT NULL,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT sessions_pkey PRIMARY KEY (sid),
  CONSTRAINT sessions_sid_not_blank_chk CHECK (char_length(sid) > 0)
);

CREATE INDEX sessions_expire_idx ON sessions (expire);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- Reference data only. There is no default user and no password in this migration.
INSERT INTO roles (name, description)
VALUES
  ('admin', 'Full application administration'),
  ('member', 'Standard account for working with records');

INSERT INTO permissions (name, description)
VALUES
  ('records.read', 'View records'),
  ('records.create', 'Create records'),
  ('records.update', 'Update records'),
  ('records.delete', 'Delete records'),
  ('users.manage', 'Create accounts and assign roles');

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.name LIKE 'records.%'
WHERE roles.name = 'member';
