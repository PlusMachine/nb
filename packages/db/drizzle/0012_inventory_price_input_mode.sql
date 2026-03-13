DO $$
BEGIN
  CREATE TYPE "inventory_price_input_mode" AS ENUM ('total', 'per_display_unit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "user_ingredients"
  ADD COLUMN IF NOT EXISTS "price_input_mode" "inventory_price_input_mode",
  ADD COLUMN IF NOT EXISTS "price_input_amount_minor" integer,
  ADD COLUMN IF NOT EXISTS "price_input_currency" "system_currency";

UPDATE "user_ingredients"
SET
  "price_input_mode" = COALESCE("price_input_mode", 'total'::"inventory_price_input_mode"),
  "price_input_amount_minor" = COALESCE("price_input_amount_minor", "purchase_price_minor"),
  "price_input_currency" = COALESCE("price_input_currency", "purchase_currency")
WHERE "purchase_price_minor" IS NOT NULL;
