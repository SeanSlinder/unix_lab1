const { Pool } = require("pg");

function createPool(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  return pool;
}

async function query(pool, text, params) {
  const res = await pool.query(text, params);
  return res;
}

module.exports = { createPool, query };
