DO $$ BEGIN
 CREATE TYPE "recipe_inventory_allocation_status" AS ENUM('allocated', 'reserved', 'released', 'consumed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "inventory_transaction_type" AS ENUM('consume', 'reserve', 'release', 'adjustment');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "brew_batch_status" AS ENUM('planned', 'brewing', 'fermenting', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "brew_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "recipe_id" uuid NOT NULL,
  "status" "brew_batch_status" DEFAULT 'planned' NOT NULL,
  "name" varchar(180) NOT NULL,
  "brew_plan_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "recipe_snapshot" jsonb,
  "equipment_profile_snapshot" jsonb,
  "water_plan_snapshot" jsonb,
  "device_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "planned_for" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "brew_batches"
 ADD CONSTRAINT "brew_batches_user_id_users_id_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "brew_batches"
 ADD CONSTRAINT "brew_batches_recipe_id_recipes_id_fk"
 FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "brew_batches_user_id_idx" ON "brew_batches" ("user_id");
CREATE INDEX IF NOT EXISTS "brew_batches_recipe_id_idx" ON "brew_batches" ("recipe_id");
CREATE INDEX IF NOT EXISTS "brew_batches_status_idx" ON "brew_batches" ("status");

CREATE TABLE IF NOT EXISTS "recipe_inventory_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "recipe_id" uuid NOT NULL,
  "recipe_ingredient_id" uuid NOT NULL,
  "recipe_ingredient_persistent_key" uuid NOT NULL,
  "inventory_item_id" uuid NOT NULL,
  "status" "recipe_inventory_allocation_status" DEFAULT 'allocated' NOT NULL,
  "allocated_quantity_normalized" double precision NOT NULL,
  "allocated_normalized_unit" varchar(32) NOT NULL,
  "allocation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reserved_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "recipe_inventory_allocations"
 ADD CONSTRAINT "recipe_inventory_allocations_user_id_users_id_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recipe_inventory_allocations"
 ADD CONSTRAINT "recipe_inventory_allocations_recipe_id_recipes_id_fk"
 FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recipe_inventory_allocations"
 ADD CONSTRAINT "recipe_inventory_allocations_recipe_ingredient_id_recipe_ingredients_id_fk"
 FOREIGN KEY ("recipe_ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "recipe_inventory_allocations"
 ADD CONSTRAINT "recipe_inventory_allocations_inventory_item_id_user_ingredients_id_fk"
 FOREIGN KEY ("inventory_item_id") REFERENCES "public"."user_ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "recipe_inventory_allocations_user_recipe_idx" ON "recipe_inventory_allocations" ("user_id", "recipe_id");
CREATE INDEX IF NOT EXISTS "recipe_inventory_allocations_recipe_ingredient_idx" ON "recipe_inventory_allocations" ("recipe_ingredient_id");
CREATE INDEX IF NOT EXISTS "recipe_inventory_allocations_persistent_key_idx" ON "recipe_inventory_allocations" ("recipe_id", "recipe_ingredient_persistent_key");
CREATE INDEX IF NOT EXISTS "recipe_inventory_allocations_inventory_item_idx" ON "recipe_inventory_allocations" ("inventory_item_id");
CREATE INDEX IF NOT EXISTS "recipe_inventory_allocations_status_idx" ON "recipe_inventory_allocations" ("status");

CREATE TABLE IF NOT EXISTS "inventory_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "inventory_item_id" uuid NOT NULL,
  "recipe_id" uuid,
  "recipe_ingredient_id" uuid,
  "brew_batch_id" uuid,
  "type" "inventory_transaction_type" NOT NULL,
  "quantity_delta_normalized" double precision NOT NULL,
  "normalized_unit" varchar(32) NOT NULL,
  "quantity_before_normalized" double precision NOT NULL,
  "quantity_after_normalized" double precision NOT NULL,
  "transaction_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "inventory_transactions"
 ADD CONSTRAINT "inventory_transactions_user_id_users_id_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "inventory_transactions"
 ADD CONSTRAINT "inventory_transactions_inventory_item_id_user_ingredients_id_fk"
 FOREIGN KEY ("inventory_item_id") REFERENCES "public"."user_ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "inventory_transactions"
 ADD CONSTRAINT "inventory_transactions_recipe_id_recipes_id_fk"
 FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "inventory_transactions"
 ADD CONSTRAINT "inventory_transactions_recipe_ingredient_id_recipe_ingredients_id_fk"
 FOREIGN KEY ("recipe_ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "inventory_transactions"
 ADD CONSTRAINT "inventory_transactions_brew_batch_id_brew_batches_id_fk"
 FOREIGN KEY ("brew_batch_id") REFERENCES "public"."brew_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "inventory_transactions_user_id_idx" ON "inventory_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "inventory_transactions_inventory_item_idx" ON "inventory_transactions" ("inventory_item_id");
CREATE INDEX IF NOT EXISTS "inventory_transactions_recipe_idx" ON "inventory_transactions" ("recipe_id");
CREATE INDEX IF NOT EXISTS "inventory_transactions_brew_batch_idx" ON "inventory_transactions" ("brew_batch_id");
CREATE INDEX IF NOT EXISTS "inventory_transactions_type_idx" ON "inventory_transactions" ("type");
