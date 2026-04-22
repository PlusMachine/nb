ALTER TABLE "equipment_profiles"
ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;

WITH ranked_profiles AS (
  SELECT
    "id",
    "user_id",
    row_number() OVER (
      PARTITION BY "user_id"
      ORDER BY "updated_at" DESC, "created_at" DESC
    ) AS "position"
  FROM "equipment_profiles"
)
UPDATE "equipment_profiles" AS profile
SET "is_default" = true
FROM ranked_profiles
WHERE profile."id" = ranked_profiles."id"
  AND ranked_profiles."position" = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "equipment_profiles" AS existing_default
    WHERE existing_default."user_id" = profile."user_id"
      AND existing_default."is_default" = true
  );

CREATE UNIQUE INDEX IF NOT EXISTS "equipment_profiles_user_default_uidx"
  ON "equipment_profiles" ("user_id")
  WHERE "is_default" = true;
