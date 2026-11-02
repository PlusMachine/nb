CREATE TABLE "brew_batch_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brew_batch_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"due_date" date NOT NULL,
	"due_time" varchar(5),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_batches" ADD COLUMN "volume_measurements" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brew_batch_tasks" ADD CONSTRAINT "brew_batch_tasks_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brew_batch_tasks_batch_date_idx" ON "brew_batch_tasks" USING btree ("brew_batch_id","due_date");