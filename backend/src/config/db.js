const { Pool } = require("pg");
const env = require("./env");

const hasSslModeInUrl = /sslmode=/i.test(env.DATABASE_URL);
const poolConfig = {
  connectionString: env.DATABASE_URL,
};

if (env.NODE_ENV === "production" && !hasSslModeInUrl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

const query = (text, params) => pool.query(text, params);

const withTransaction = async (operation) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  withTransaction,
};

