ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferred_currency" "system_currency" DEFAULT 'RUB' NOT NULL;
