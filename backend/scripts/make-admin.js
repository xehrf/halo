const { Pool } = require("pg");
require("dotenv").config();

const email = process.argv[2]?.trim()?.toLowerCase();

if (!email) {
  console.error("Usage: npm run admin:promote -- user@example.com");
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
  const result = await pool.query(
    `UPDATE users
     SET role = 'admin', updated_at = NOW()
     WHERE email = $1
     RETURNING id, full_name, email, role`,
    [email]
  );

  if (result.rowCount === 0) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const user = result.rows[0];
  console.log(`User promoted: #${user.id} ${user.email} -> ${user.role}`);
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

