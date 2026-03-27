import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db } from "../src/client";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(scriptDir, "../drizzle");

export const runMigrations = async () => {
  await migrate(db, { migrationsFolder });
};
