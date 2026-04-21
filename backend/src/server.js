const app = require("./app");
const env = require("./config/env");
const db = require("./config/db");

const server = app.listen(env.PORT, () => {
  console.log(`Halo API is running on port ${env.PORT}`);
});

const shutdown = async () => {
  console.log("Graceful shutdown started...");
  server.close(async () => {
    await db.pool.end();
    console.log("Server stopped");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

