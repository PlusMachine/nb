-- Batch allocations belong to a frozen composition, not to live recipe rows.
-- Keep cascading cleanup for legacy allocations outside a batch.
ALTER TABLE "recipe_inventory_allocations" ALTER COLUMN "recipe_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "recipe_inventory_allocations" ALTER COLUMN "recipe_ingredient_id" DROP NOT NULL;
--> statement-breakpoint
-- Deleting a batch removes its allocations/reservations, but not its physical
-- stock movements: inventory_transactions keeps its existing SET NULL relation.
ALTER TABLE "recipe_inventory_allocations" DROP CONSTRAINT "recipe_inventory_allocations_brew_batch_id_brew_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "recipe_inventory_allocations" ADD CONSTRAINT "recipe_inventory_allocations_brew_batch_id_brew_batches_id_fk"
  FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Preserve existing batch history before a recipe/ingredient can be deleted.
-- Old batches have no reliable inventory snapshot. Their unfinished reservations
-- must not lock stock forever: release them without touching physical quantities
-- or already-consumed allocations. Source ids remain in audit metadata.
UPDATE "recipe_inventory_allocations"
SET "allocation_meta" = coalesce("allocation_meta", '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'sourceRecipeId', "recipe_id",
        'sourceRecipeIngredientId', "recipe_ingredient_id",
        'legacyBatchAllocation', true
      )),
    "recipe_id" = NULL,
    "recipe_ingredient_id" = NULL,
    "status" = CASE WHEN "status" IN ('allocated', 'reserved') THEN 'released' ELSE "status" END,
    "released_at" = CASE WHEN "status" IN ('allocated', 'reserved') THEN now() ELSE "released_at" END,
    "updated_at" = now()
WHERE "brew_batch_id" IS NOT NULL
  AND ("recipe_id" IS NOT NULL OR "recipe_ingredient_id" IS NOT NULL);
