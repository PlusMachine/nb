CREATE TABLE "device_control_leases" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"holder_user_id" uuid NOT NULL,
	"holder_session_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"takeover_by_user_id" uuid,
	"takeover_by_session_id" text,
	"takeover_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "device_control_leases" ADD CONSTRAINT "device_control_leases_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_control_leases" ADD CONSTRAINT "device_control_leases_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_control_leases" ADD CONSTRAINT "device_control_leases_takeover_by_user_id_users_id_fk" FOREIGN KEY ("takeover_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_control_leases_holder_user_id_idx" ON "device_control_leases" USING btree ("holder_user_id");