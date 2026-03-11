import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "../src/client";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(scriptDir, "../drizzle");

const run = async () => {
  await migrate(db, { migrationsFolder });
  await pool.end();
};

run().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
