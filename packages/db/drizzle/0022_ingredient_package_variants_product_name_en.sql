ALTER TABLE "ingredient_package_variants"
ADD COLUMN IF NOT EXISTS "product_name_en" text;
