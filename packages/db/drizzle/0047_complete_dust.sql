ALTER TABLE "recipe_inventory_allocations" ADD COLUMN "brew_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_inventory_allocations" ADD CONSTRAINT "recipe_inventory_allocations_brew_batch_id_brew_batches_id_fk" FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_inventory_allocations_brew_batch_id_idx" ON "recipe_inventory_allocations" USING btree ("brew_batch_id");--> statement-breakpoint
-- Backfill: легаси-привязка consumed-аллокаций к партии-потребителю по мете
-- inventory_transactions (allocationId писался в transaction_meta ещё до появления
-- recipe_inventory_allocations.brew_batch_id). Без этого шага все существующие
-- consumed-аллокации остались бы с brew_batch_id=NULL и консервативно продолжали
-- бы блокировать повторную варку рецепта даже для завершённых партий.
UPDATE recipe_inventory_allocations a
SET brew_batch_id = t.brew_batch_id
FROM inventory_transactions t
WHERE t.type = 'consume'
  AND t.brew_batch_id IS NOT NULL
  AND (t.transaction_meta->>'allocationId')::uuid = a.id
  AND a.brew_batch_id IS NULL;