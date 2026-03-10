import { pool } from "../src/client";

const run = async () => {
  console.log("Seed scaffold: no seed data yet.");
  await pool.end();
};

run().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
