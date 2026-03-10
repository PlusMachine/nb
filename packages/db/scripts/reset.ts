import { sql } from "drizzle-orm";

import { db, pool } from "../src/client";

const run = async () => {
  await db.execute(sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  console.log("Database reset complete. Run db:migrate next.");
  await pool.end();
};

run().catch((error) => {
  console.error("Reset failed", error);
  process.exit(1);
});
