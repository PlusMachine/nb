ALTER TABLE "recipes" ADD COLUMN "recipe_family_id" uuid;
ALTER TABLE "recipes" ADD COLUMN "version_number" integer DEFAULT 1 NOT NULL;

UPDATE "recipes" SET "recipe_family_id" = "id" WHERE "recipe_family_id" IS NULL;

ALTER TABLE "recipes" ALTER COLUMN "recipe_family_id" SET NOT NULL;

CREATE INDEX "recipes_family_id_idx" ON "recipes" USING btree ("recipe_family_id");
CREATE UNIQUE INDEX "recipes_family_version_uidx" ON "recipes" USING btree ("recipe_family_id","version_number");
