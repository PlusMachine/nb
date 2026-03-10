import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseServerEnv } from "@nb/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(moduleDir, "../../..", ".env");

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const env = parseServerEnv(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { pool };
