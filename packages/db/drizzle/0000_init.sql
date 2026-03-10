DO $$ BEGIN
 CREATE TYPE "user_role" AS ENUM('user', 'editor', 'moderator', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "verification_type" AS ENUM('otp', 'magic_link', 'password_reset');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "display_name" varchar(120) NOT NULL,
  "image" text,
  "role" "user_role" DEFAULT 'user' NOT NULL,
  "password_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uidx" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "user_agent" text,
  "ip_address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_fkey";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_uidx" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" varchar(64) NOT NULL,
  "provider_account_id" varchar(191) NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_user_id_fkey";
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_uidx" ON "accounts" ("provider", "provider_account_id");
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" ("user_id");

CREATE TABLE IF NOT EXISTS "verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "type" "verification_type" NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "verifications_code_hash_uidx" ON "verifications" ("code_hash");
CREATE INDEX IF NOT EXISTS "verifications_email_idx" ON "verifications" ("email", "type");

CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(191) NOT NULL,
  "action" varchar(64) NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "reset_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_rate_limits_key_action_uidx" ON "auth_rate_limits" ("key", "action");

CREATE TABLE IF NOT EXISTS "system_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar(80) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
