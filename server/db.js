/**
 * db.js — Neon Serverless Postgres connection layer
 *
 * Uses @neondatabase/serverless for connection pooling
 * and parameterized queries to prevent SQL injection.
 */

const { neon } = require("@neondatabase/serverless");

let sql = null;

function getDB() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not configured. Check your .env file.");
    }
    sql = neon(url);
  }
  return sql;
}

/**
 * Execute a parameterized SQL query.
 * @param {string} query  — SQL with $1, $2… placeholders
 * @param {any[]}  params — Bind parameters
 * @returns {Promise<any[]>} — Array of row objects
 */
async function query(queryText, params = []) {
  const db = getDB();
  try {
    const rows = await db(queryText, params);
    return rows;
  } catch (err) {
    // Enrich error with query context in dev
    if (process.env.NODE_ENV !== "production") {
      err.query = queryText;
      err.params = params;
    }
    throw err;
  }
}

module.exports = { query, getDB };
