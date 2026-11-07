CREATE TABLE "brew_offline_operations" (
	"user_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_offline_operations" ADD CONSTRAINT "brew_offline_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_offline_operations" ADD CONSTRAINT "brew_offline_operations_batch_id_brew_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brew_offline_operations_user_op_uidx" ON "brew_offline_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "brew_offline_operations_batch_idx" ON "brew_offline_operations" USING btree ("batch_id");--> statement-breakpoint
-- Preserve the FG already shown by the journal when older concurrent writes
-- left several final flags. All measurement rows remain in the journal.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY brew_batch_id ORDER BY taken_at, created_at, id) AS position
  FROM brew_measurements
  WHERE is_final
)
UPDATE brew_measurements SET is_final = false
FROM ranked WHERE brew_measurements.id = ranked.id AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "brew_measurements_final_batch_uidx" ON "brew_measurements" USING btree ("brew_batch_id") WHERE "brew_measurements"."is_final";
