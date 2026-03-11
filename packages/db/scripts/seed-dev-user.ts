import { db, eq, pool, users } from "../src";
import { assertDevOnlyExecution, getRequiredArg, parseBooleanArg, parseCliArgs, parseRoleArg } from "./_dev-utils";

const usage = [
  "Usage: tsx scripts/seed-dev-user.ts --email user@example.com --display-name \"Test Brewer\" --role user [--verified true]",
  "Defaults: --role user --verified true --display-name <email prefix>"
].join("\n");

const defaultDisplayName = (email: string): string => email.split("@")[0] ?? "Brewer";

const run = async () => {
  assertDevOnlyExecution();

  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }

  const email = getRequiredArg(args, "email").toLowerCase();
  const role = args.role ? parseRoleArg(String(args.role)) : "user";
  const displayName = (typeof args["display-name"] === "string" ? args["display-name"] : defaultDisplayName(email)).trim();
  const emailVerified = parseBooleanArg(args.verified, true);

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    const [updated] = await db.update(users).set({
      displayName,
      role,
      emailVerified,
      updatedAt: new Date()
    }).where(eq(users.id, existing.id)).returning();

    console.log(`Updated dev user ${email} (id=${updated?.id ?? existing.id}, role=${role}, verified=${emailVerified})`);
    return;
  }

  const [created] = await db.insert(users).values({
    email,
    displayName,
    role,
    emailVerified
  }).returning();

  console.log(`Created dev user ${email} (id=${created.id}, role=${role}, verified=${emailVerified})`);
};

run()
  .catch((error) => {
    console.error("seed-dev-user failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
