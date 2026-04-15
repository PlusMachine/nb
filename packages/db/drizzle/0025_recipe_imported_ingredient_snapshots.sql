ALTER TABLE "recipe_ingredients" DROP CONSTRAINT IF EXISTS "recipe_ingredients_source_linkage_chk";

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_source_linkage_chk"
  CHECK (
    ((ingredient_catalog_item_id IS NOT NULL AND user_custom_ingredient_id IS NULL AND coalesce(inventory_intent_mode, '') <> 'imported')
    OR (ingredient_catalog_item_id IS NULL AND user_custom_ingredient_id IS NOT NULL AND coalesce(inventory_intent_mode, '') <> 'imported')
    OR (ingredient_catalog_item_id IS NULL AND user_custom_ingredient_id IS NULL AND inventory_intent_mode = 'imported'))
  ) NOT VALID;
