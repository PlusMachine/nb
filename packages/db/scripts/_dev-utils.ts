import { parseServerEnv } from "@nb/shared";

export const ALLOWED_ROLES = ["user", "editor", "moderator", "admin"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

type ParsedArgs = Record<string, string | boolean>;

export const parseCliArgs = (argv: string[]): ParsedArgs => {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
};

export const getRequiredArg = (args: ParsedArgs, key: string): string => {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required argument --${key}`);
  }

  return value.trim();
};

export const parseRoleArg = (rawRole: string): AllowedRole => {
  if (ALLOWED_ROLES.includes(rawRole as AllowedRole)) {
    return rawRole as AllowedRole;
  }

  throw new Error(`Invalid role \"${rawRole}\". Allowed values: ${ALLOWED_ROLES.join(", ")}`);
};

export const parseBooleanArg = (value: string | boolean | undefined, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean value \"${value}\". Use true or false.`);
};

const isSafeDatabaseHost = (databaseUrl: string): boolean => (
  databaseUrl.includes("localhost")
  || databaseUrl.includes("127.0.0.1")
  || databaseUrl.includes("postgres")
);

export const assertDevOnlyExecution = () => {
  const env = parseServerEnv(process.env);

  if (env.NODE_ENV === "production") {
    throw new Error("This command is blocked in production. Use only local dev/test environments.");
  }

  if (!isSafeDatabaseHost(env.DATABASE_URL)) {
    throw new Error("This command allows only local/dev database hosts (localhost, 127.0.0.1, postgres).");
  }
};
