const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const fileArg = process.argv[2];

if (!fileArg) {
  console.error("Usage: node scripts/run-sql-file.js <relative-path-to-sql-file>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const hasSslModeInUrl = /sslmode=/i.test(process.env.DATABASE_URL);
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

if (process.env.NODE_ENV === "production" && !hasSslModeInUrl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

const run = async () => {
  const sqlPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }

  const sql = fs.readFileSync(sqlPath, "utf-8");
  await pool.query(sql);
  console.log(`Applied SQL file: ${fileArg}`);
};

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });

