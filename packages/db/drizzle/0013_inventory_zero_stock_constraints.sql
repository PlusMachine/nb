ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_quantity_positive_chk";
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_entered_quantity_positive_chk";
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_normalized_quantity_positive_chk";
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_entered_quantity_nonnegative_chk";
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_normalized_quantity_nonnegative_chk";

ALTER TABLE "user_ingredients"
  ADD CONSTRAINT "user_ingredients_entered_quantity_nonnegative_chk" CHECK ("entered_quantity" >= 0);

ALTER TABLE "user_ingredients"
  ADD CONSTRAINT "user_ingredients_normalized_quantity_nonnegative_chk" CHECK ("normalized_quantity" >= 0);
