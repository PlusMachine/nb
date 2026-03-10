import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "../src/client";

const run = async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
};

run().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
