CREATE TYPE "public"."brew_device_status" AS ENUM('online', 'offline', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."device_command_status" AS ENUM('queued', 'sent', 'acked', 'failed');--> statement-breakpoint
CREATE TABLE "brew_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text DEFAULT 'brewforge' NOT NULL,
	"name" text NOT NULL,
	"hardware_id" text NOT NULL,
	"token_hash" text,
	"fw" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "brew_device_status" DEFAULT 'unknown' NOT NULL,
	"local_url" text,
	"mqtt_prefix" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brew_log_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"brew_batch_id" uuid,
	"ts" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brew_telemetry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"brew_batch_id" uuid,
	"ts" timestamp with time zone NOT NULL,
	"seq" integer NOT NULL,
	"stage" integer,
	"primary_c" real,
	"setpoint_c" real,
	"heat_duty_pct" integer,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"brew_batch_id" uuid,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"arg" jsonb,
	"status" "device_command_status" DEFAULT 'queued' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_pairing_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_code" text NOT NULL,
	"user_id" uuid,
	"hardware_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_batches" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "brew_devices" ADD CONSTRAINT "brew_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_log_events" ADD CONSTRAINT "brew_log_events_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_log_events" ADD CONSTRAINT "brew_log_events_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_telemetry" ADD CONSTRAINT "brew_telemetry_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_telemetry" ADD CONSTRAINT "brew_telemetry_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairing_tokens" ADD CONSTRAINT "device_pairing_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brew_devices_user_id_idx" ON "brew_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brew_devices_hardware_id_uidx" ON "brew_devices" USING btree ("hardware_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brew_devices_token_hash_uidx" ON "brew_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "brew_log_events_device_ts_idx" ON "brew_log_events" USING btree ("device_id","ts");--> statement-breakpoint
CREATE INDEX "brew_log_events_batch_ts_idx" ON "brew_log_events" USING btree ("brew_batch_id","ts");--> statement-breakpoint
CREATE INDEX "brew_telemetry_device_ts_idx" ON "brew_telemetry" USING btree ("device_id","ts");--> statement-breakpoint
CREATE INDEX "brew_telemetry_batch_ts_idx" ON "brew_telemetry" USING btree ("brew_batch_id","ts");--> statement-breakpoint
CREATE INDEX "device_commands_device_created_idx" ON "device_commands" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "device_commands_batch_idx" ON "device_commands" USING btree ("brew_batch_id");--> statement-breakpoint
CREATE INDEX "device_commands_user_id_idx" ON "device_commands" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_commands_status_idx" ON "device_commands" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "device_pairing_tokens_claim_code_active_uidx" ON "device_pairing_tokens" USING btree ("claim_code") WHERE "device_pairing_tokens"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "device_pairing_tokens_hardware_id_idx" ON "device_pairing_tokens" USING btree ("hardware_id");--> statement-breakpoint
ALTER TABLE "brew_batches" ADD CONSTRAINT "brew_batches_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brew_batches_device_id_idx" ON "brew_batches" USING btree ("device_id");