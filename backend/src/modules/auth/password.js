const crypto = require('crypto');
const argon2 = require('argon2');

// OWASP password-storage baseline for Argon2id: 19 MiB, 2 iterations, parallelism 1.
const HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

let dummyHashPromise;

function dummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(crypto.randomBytes(32).toString('hex'), HASH_OPTIONS);
  }
  return dummyHashPromise;
}

function hashPassword(password) {
  return argon2.hash(password, HASH_OPTIONS);
}

// Unknown emails still run a verify so the response time stays close to a real check.
async function passwordMatches(passwordHash, password) {
  try {
    const hash = passwordHash ?? await dummyHash();
    const matches = await argon2.verify(hash, password);
    return Boolean(passwordHash) && matches;
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  passwordMatches,
};
