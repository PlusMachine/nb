import { pool } from "../src/client";
import { runMigrations } from "./migrate-lib";

const run = async () => {
  await runMigrations();
  await pool.end();
};

run().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
