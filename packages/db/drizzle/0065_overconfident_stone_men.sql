CREATE TABLE "ferment_readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid,
	"ts" timestamp with time zone NOT NULL,
	"gravity_sg" double precision,
	"temp_c" real,
	"pressure_kpa" real,
	"battery_v" real,
	"battery_pct" real,
	"rssi" integer,
	"excluded" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"brew_batch_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"calibration_offset_sg" double precision DEFAULT 0 NOT NULL,
	"temp_min_c" real,
	"temp_max_c" real,
	"alerts_muted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ingest_token_hash" text NOT NULL,
	"ingest_token_encrypted" text,
	"api_token_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_devices" ADD COLUMN "hardware_kind" text;--> statement-breakpoint
ALTER TABLE "ferment_readings" ADD CONSTRAINT "ferment_readings_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferment_readings" ADD CONSTRAINT "ferment_readings_session_id_ferment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ferment_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferment_sessions" ADD CONSTRAINT "ferment_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferment_sessions" ADD CONSTRAINT "ferment_sessions_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferment_sessions" ADD CONSTRAINT "ferment_sessions_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ferment_readings_session_ts_idx" ON "ferment_readings" USING btree ("session_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "ferment_readings_device_ts_uidx" ON "ferment_readings" USING btree ("device_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "ferment_sessions_active_device_uidx" ON "ferment_sessions" USING btree ("device_id") WHERE "ferment_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "ferment_sessions_brew_batch_idx" ON "ferment_sessions" USING btree ("brew_batch_id");--> statement-breakpoint
CREATE INDEX "ferment_sessions_user_id_idx" ON "ferment_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ferment_sessions_device_started_idx" ON "ferment_sessions" USING btree ("device_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_integrations_user_kind_uidx" ON "user_integrations" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "user_integrations_ingest_token_hash_uidx" ON "user_integrations" USING btree ("ingest_token_hash");