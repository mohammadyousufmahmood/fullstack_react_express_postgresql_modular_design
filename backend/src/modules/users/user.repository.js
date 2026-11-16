const pool = require('../../db/pool');

function findByEmail(email, db = pool) {
  return db.query(
    `SELECT id, email, password_hash, is_active
     FROM users
     WHERE email = $1`,
    [email],
  ).then((result) => result.rows[0] ?? null);
}

function findActiveById(id, db = pool) {
  return db.query(
    `SELECT id, email
     FROM users
     WHERE id = $1 AND is_active = true`,
    [id],
  ).then((result) => result.rows[0] ?? null);
}

function insertUser(db, email, passwordHash) {
  return db.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email`,
    [email, passwordHash],
  ).then((result) => result.rows[0]);
}

function assignRole(db, userId, roleName) {
  return db.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, roles.id
     FROM roles
     WHERE roles.name = $2`,
    [userId, roleName],
  ).then((result) => result.rowCount > 0);
}

module.exports = {
  findByEmail,
  findActiveById,
  insertUser,
  assignRole,
};
