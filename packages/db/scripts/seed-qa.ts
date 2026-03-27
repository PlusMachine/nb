import { pool } from "../src";
import { runMigrations } from "./migrate-lib";
import { seedQaFixtures } from "./seed-qa-lib";

const run = async () => {
  await runMigrations();
  await seedQaFixtures();
};

run()
  .catch((error) => {
    console.error("seed-qa failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
