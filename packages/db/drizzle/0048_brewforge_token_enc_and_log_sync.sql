CREATE TABLE "device_log_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"brew_batch_id" uuid,
	"name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"samples_imported" integer DEFAULT 0 NOT NULL,
	"events_imported" integer DEFAULT 0 NOT NULL,
	"malformed_lines" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_devices" ADD COLUMN "token_encrypted" text;--> statement-breakpoint
ALTER TABLE "device_log_files" ADD CONSTRAINT "device_log_files_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_log_files" ADD CONSTRAINT "device_log_files_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_log_files_device_name_uidx" ON "device_log_files" USING btree ("device_id","name");--> statement-breakpoint
CREATE INDEX "device_log_files_device_idx" ON "device_log_files" USING btree ("device_id");