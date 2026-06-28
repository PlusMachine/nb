ALTER TYPE "public"."verification_type" ADD VALUE 'sms_otp';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uidx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "verifications_phone_idx" ON "verifications" USING btree ("phone","type");--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_identifier_present" CHECK ("verifications"."email" is not null or "verifications"."phone" is not null);