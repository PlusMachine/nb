ALTER TABLE "recipes" ADD COLUMN "editor_updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "recipes" SET "editor_updated_at" = "updated_at";
