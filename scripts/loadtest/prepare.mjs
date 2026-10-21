import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// Deliberately restricted to a disposable local database. Never seed an app DB.
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/nb_loadtest") {
  throw new Error("DATABASE_URL must point to a local database named nb_loadtest");
}
const output = path.resolve(process.env.LOADTEST_OUTPUT ?? ".local-artifacts/loadtest");
const pool = new pg.Pool({ connectionString: url.href });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const base = (await client.query("SELECT id FROM users WHERE email = 'qa.user@localhost'")).rows[0];
  if (!base) throw new Error("Run the standard QA and sample seeds first");
  // Re-running only replaces this script's test users and their cascaded records.
  await client.query("DELETE FROM users WHERE email LIKE 'loadtest-%@localhost'");
  const inventory = (await client.query("SELECT * FROM user_ingredients WHERE user_id = $1 AND user_custom_ingredient_id IS NULL", [base.id])).rows;
  const recipes = (await client.query("SELECT * FROM recipes WHERE author_id = $1", [base.id])).rows;
  const fixtures = [];
  for (let i = 0; i < 50; i++) {
    const userId = randomUUID();
    await client.query("INSERT INTO users (id,email,email_verified,display_name) VALUES ($1,$2,true,$3)", [userId, `loadtest-${i}@localhost`, `Load test ${i}`]);
    for (const row of inventory) {
      await client.query("INSERT INTO user_ingredients SELECT (jsonb_populate_record(NULL::user_ingredients,$1::jsonb)).*", [JSON.stringify({ ...row, id: randomUUID(), user_id: userId })]);
    }
    const privateRecipes = [];
    for (const row of recipes) {
      const recipeId = randomUUID();
      await client.query("INSERT INTO recipes SELECT (jsonb_populate_record(NULL::recipes,$1::jsonb)).*", [JSON.stringify({ ...row, id: recipeId, author_id: userId, recipe_family_id: randomUUID(), slug: `loadtest-${i}-${row.slug}`, publication_state: "private", equipment_profile_id: null })]);
      const children = (await client.query("SELECT * FROM recipe_ingredients WHERE recipe_id=$1", [row.id])).rows;
      for (const ingredient of children) {
        await client.query("INSERT INTO recipe_ingredients SELECT (jsonb_populate_record(NULL::recipe_ingredients,$1::jsonb)).*", [JSON.stringify({ ...ingredient, id: randomUUID(), recipe_id: recipeId, user_ingredient_id: null })]);
      }
      privateRecipes.push(recipeId);
    }
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await client.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '6 hours')", [userId, hash]);
    const hardwareId = `bf-loadtest-${i}`;
    const device = (await client.query("INSERT INTO brew_devices (user_id,name,hardware_id,fw) VALUES ($1,$2,$3,'2.0.0') RETURNING id", [userId, `Load test device ${i}`, hardwareId])).rows[0];
    fixtures.push({ userId, token, hardwareId, deviceId: device.id, recipeIds: privateRecipes });
  }
  await client.query("COMMIT");
  await client.query("ANALYZE");
  const counts = (await client.query("SELECT 'ingredients' AS name,count(*)::int FROM ingredients UNION ALL SELECT 'recipes',count(*)::int FROM recipes UNION ALL SELECT 'user_ingredients',count(*)::int FROM user_ingredients UNION ALL SELECT 'users',count(*)::int FROM users")).rows;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "fixtures.json"), JSON.stringify(fixtures), { mode: 0o600 });
  await writeFile(path.join(output, "dataset.json"), JSON.stringify(counts, null, 2));
  console.log(JSON.stringify({ users: fixtures.length, counts, output }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
