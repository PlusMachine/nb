CREATE TABLE "favorite_calculators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calculator_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favorite_calculators" ADD CONSTRAINT "favorite_calculators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_calculators_user_slug_uidx" ON "favorite_calculators" USING btree ("user_id","calculator_slug");--> statement-breakpoint
CREATE INDEX "favorite_calculators_user_idx" ON "favorite_calculators" USING btree ("user_id","created_at");