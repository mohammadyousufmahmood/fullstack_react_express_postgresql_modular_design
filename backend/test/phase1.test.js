const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');
const AppError = require('../src/errors/AppError');
const errorHandler = require('../src/middleware/errorHandler');

async function withServer(fn) {
  const server = createApp().listen(0, '127.0.0.1');
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

function mockResponse() {
  return {
    headersSent: false,
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test.after(async () => {
  await pool.end();
});

test('unknown routes return the error envelope', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found: GET /does-not-exist',
      },
    });
    assert.equal(Object.hasOwn(body, 'stack'), false);
  });
});

test('malformed JSON is rejected before routing', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_JSON');
  });
});

test('health reports whether PostgreSQL accepts a query', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      status: 'ok',
      database: 'up',
    });
  });
});

test('operational errors keep their public code', () => {
  const res = mockResponse();

  errorHandler(new AppError(409, 'CONFLICT', 'Already exists'), {}, res, () => {});

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: {
      code: 'CONFLICT',
      message: 'Already exists',
    },
  });
});

test('unexpected errors stay generic', () => {
  const res = mockResponse();

  errorHandler(new Error('password=secret detail'), {}, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  assert.equal(res.body.error.message, 'Internal server error');
  assert.equal(JSON.stringify(res.body).includes('secret'), false);
});
