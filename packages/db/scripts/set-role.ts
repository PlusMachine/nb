import { db, eq, pool, users } from "../src";
import { assertDevOnlyExecution, getRequiredArg, parseCliArgs, parseRoleArg } from "./_dev-utils";

const usage = "Usage: tsx scripts/set-role.ts --email user@example.com --role admin";

const run = async () => {
  assertDevOnlyExecution();

  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }

  const email = getRequiredArg(args, "email").toLowerCase();
  const role = parseRoleArg(getRequiredArg(args, "role"));

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    throw new Error(`User with email ${email} was not found.`);
  }

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, user.id));
  console.log(`Updated ${email}: ${user.role} -> ${role}`);
};

run()
  .catch((error) => {
    console.error("set-role failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
