CREATE TYPE "public"."content_article_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_article_type" AS ENUM('guide', 'review');--> statement-breakpoint
CREATE TABLE "content_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "content_article_type" DEFAULT 'guide' NOT NULL,
	"status" "content_article_status" DEFAULT 'draft' NOT NULL,
	"slug" varchar(220) NOT NULL,
	"title" varchar(180) NOT NULL,
	"excerpt" text,
	"body_json" jsonb,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cover_image_key" text,
	"cover_image_url" text,
	"seo_title" varchar(255),
	"seo_description" text,
	"reading_minutes" integer DEFAULT 1 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"author_id" uuid,
	"reviewer_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_articles_slug_uidx" ON "content_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_articles_status_published_idx" ON "content_articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "content_articles_author_idx" ON "content_articles" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "content_articles_featured_idx" ON "content_articles" USING btree ("is_featured","published_at");--> statement-breakpoint
CREATE INDEX "content_articles_type_idx" ON "content_articles" USING btree ("type");