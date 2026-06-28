CREATE TABLE "brew_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brew_batch_id" uuid NOT NULL,
	"gravity_sg" double precision NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_measurements" ADD CONSTRAINT "brew_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_measurements" ADD CONSTRAINT "brew_measurements_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brew_measurements_batch_taken_idx" ON "brew_measurements" USING btree ("brew_batch_id","taken_at");--> statement-breakpoint
CREATE INDEX "brew_measurements_user_idx" ON "brew_measurements" USING btree ("user_id");