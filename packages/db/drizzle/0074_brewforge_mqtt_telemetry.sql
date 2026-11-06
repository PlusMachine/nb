ALTER TABLE "brew_devices" ADD COLUMN "mqtt_telemetry" jsonb;--> statement-breakpoint
ALTER TABLE "brew_devices" ADD COLUMN "mqtt_telemetry_at" timestamp with time zone;