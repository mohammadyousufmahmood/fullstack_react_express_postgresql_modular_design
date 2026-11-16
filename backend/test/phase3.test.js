const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');
const { createAccount } = require('../src/modules/auth/auth.service');

const PASSWORD = 'phase3-test-password';

function emailAddress() {
  return `phase3-${crypto.randomBytes(4).toString('hex')}@example.com`;
}

class CookieJar {
  constructor() {
    this.pairs = new Map();
  }

  store(response) {
    const cookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];

    for (const cookie of cookies) {
      const pair = cookie.split(';')[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value) {
        this.pairs.delete(name);
      } else {
        this.pairs.set(name, value);
      }
    }

    return cookies;
  }

  header() {
    return [...this.pairs.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  sessionId() {
    const raw = this.pairs.get('sid');
    assert.equal(typeof raw, 'string');
    const decoded = decodeURIComponent(raw);
    assert.equal(decoded.startsWith('s:'), true);
    return decoded.slice(2, decoded.lastIndexOf('.'));
  }
}

async function withServer(fn, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function send(baseUrl, jar, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) {
    headers.cookie = cookie;
  }

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  jar.store(response);
  return response;
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

test.after(async () => {
  await pool.query(
    `WITH removed AS (
       DELETE FROM users
       WHERE email LIKE 'phase3-%@example.com'
       RETURNING id::text
     )
     DELETE FROM sessions
     WHERE sess->>'userId' IN (SELECT id FROM removed)`,
  );
  await pool.end();
});

test('login rotates the session and logout invalidates it', async () => {
  const email = emailAddress();
  const account = await createAccount({ email, password: PASSWORD, roleName: 'member' });

  await withServer(async (baseUrl) => {
    const jar = new CookieJar();
    const csrfResponse = await send(baseUrl, jar, '/auth/csrf');
    const csrfBody = await readJson(csrfResponse);
    const beforeLogin = jar.sessionId();
    const setCookie = csrfResponse.headers.getSetCookie()[0];

    assert.equal(csrfResponse.status, 200);
    assert.equal(typeof csrfBody.csrfToken, 'string');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(setCookie, /Secure/i);

    const loginResponse = await send(baseUrl, jar, '/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfBody.csrfToken,
      },
      body: JSON.stringify({ email: email.toUpperCase(), password: PASSWORD }),
    });
    const loginBody = await readJson(loginResponse);
    const afterLogin = jar.sessionId();

    assert.equal(loginResponse.status, 200);
    assert.deepEqual(loginBody.user, account);
    assert.notEqual(loginBody.csrfToken, csrfBody.csrfToken);
    assert.notEqual(afterLogin, beforeLogin);
    assert.equal(JSON.stringify(loginBody).includes('password'), false);

    const oldSession = await pool.query('SELECT 1 FROM sessions WHERE sid = $1', [beforeLogin]);
    const newSession = await pool.query('SELECT sess FROM sessions WHERE sid = $1', [afterLogin]);
    assert.equal(oldSession.rowCount, 0);
    assert.equal(newSession.rows[0].sess.userId, account.id);
    assert.equal(JSON.stringify(newSession.rows[0].sess).includes(PASSWORD), false);

    const meResponse = await send(baseUrl, jar, '/auth/me');
    assert.equal(meResponse.status, 200);
    assert.deepEqual(await readJson(meResponse), { user: account });

    const staleLogout = await send(baseUrl, jar, '/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfBody.csrfToken },
    });
    assert.equal(staleLogout.status, 403);

    const logoutResponse = await send(baseUrl, jar, '/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': loginBody.csrfToken },
    });
    assert.equal(logoutResponse.status, 204);
    assert.equal(jar.header().includes('sid='), false);

    const afterLogout = await pool.query('SELECT 1 FROM sessions WHERE sid = $1', [afterLogin]);
    assert.equal(afterLogout.rowCount, 0);

    const meAfterLogout = await send(baseUrl, jar, '/auth/me');
    assert.equal(meAfterLogout.status, 401);
  });
});

test('authentication failures stay generic', async () => {
  const email = emailAddress();
  await createAccount({ email, password: PASSWORD, roleName: 'member' });

  await withServer(async (baseUrl) => {
    const wrongPassword = await loginError(baseUrl, email, 'wrong-password-value');
    const unknownUser = await loginError(baseUrl, 'missing-phase3@example.com', PASSWORD);

    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.body, unknownUser.body);
    assert.deepEqual(wrongPassword.body, {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
    });

    await pool.query('UPDATE users SET is_active = false WHERE email = $1', [email]);
    const inactive = await loginError(baseUrl, email, PASSWORD);
    assert.deepEqual(inactive.body, wrongPassword.body);
  });
});

test('login rejects a missing or wrong CSRF token', async () => {
  const email = emailAddress();
  await createAccount({ email, password: PASSWORD, roleName: 'member' });

  await withServer(async (baseUrl) => {
    const jar = new CookieJar();
    const missing = await send(baseUrl, jar, '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(missing.status, 403);
    assert.equal((await readJson(missing)).error.code, 'CSRF_INVALID');

    const csrfBody = await readJson(await send(baseUrl, jar, '/auth/csrf'));
    const wrong = await send(baseUrl, jar, '/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'not-the-token',
      },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(wrong.status, 403);

    const accepted = await send(baseUrl, jar, '/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfBody.csrfToken,
      },
      body: JSON.stringify({ email, password: 'still-wrong' }),
    });
    assert.equal(accepted.status, 401);
  });
});

test('login attempts are rate limited', async () => {
  const email = emailAddress();

  await withServer(async (baseUrl) => {
    const jar = new CookieJar();
    const csrfBody = await readJson(await send(baseUrl, jar, '/auth/csrf'));
    const statuses = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await send(baseUrl, jar, '/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfBody.csrfToken,
        },
        body: JSON.stringify({ email, password: 'wrong-password-value' }),
      });
      statuses.push(response.status);
    }

    assert.deepEqual(statuses, [401, 401, 429]);
  }, { loginRateLimit: { max: 2, windowMs: 60_000 } });
});

test('account creation stores Argon2id and does not keep a partial user', async () => {
  const email = emailAddress();
  const account = await createAccount({ email, password: PASSWORD, roleName: 'member' });
  const stored = await pool.query(
    `SELECT users.password_hash, roles.name AS role
     FROM users
     JOIN user_roles ON user_roles.user_id = users.id
     JOIN roles ON roles.id = user_roles.role_id
     WHERE users.id = $1`,
    [account.id],
  );

  assert.equal(stored.rows[0].role, 'member');
  assert.equal(stored.rows[0].password_hash.startsWith('$argon2id$'), true);

  const missingRoleEmail = emailAddress();
  await assert.rejects(
    () => createAccount({ email: missingRoleEmail, password: PASSWORD, roleName: 'missing' }),
    (err) => err.code === 'ROLE_NOT_FOUND',
  );
  const leftover = await pool.query('SELECT 1 FROM users WHERE email = $1', [missingRoleEmail]);
  assert.equal(leftover.rowCount, 0);

  await assert.rejects(
    () => createAccount({ email, password: PASSWORD, roleName: 'member' }),
    (err) => err.statusCode === 409 && err.code === 'EMAIL_TAKEN',
  );
});

async function loginError(baseUrl, email, password) {
  const jar = new CookieJar();
  const csrfBody = await readJson(await send(baseUrl, jar, '/auth/csrf'));
  const response = await send(baseUrl, jar, '/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfBody.csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });

  return { status: response.status, body: await readJson(response) };
}
