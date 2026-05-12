ALTER TABLE "user_ingredients"
  ADD COLUMN IF NOT EXISTS "properties" jsonb DEFAULT '{}'::jsonb NOT NULL;
