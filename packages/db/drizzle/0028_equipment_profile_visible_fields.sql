ALTER TABLE "equipment_profiles" DROP COLUMN IF EXISTS "brew_method";
ALTER TABLE "equipment_profiles" DROP COLUMN IF EXISTS "boil_time_min";
ALTER TABLE "equipment_profiles" DROP COLUMN IF EXISTS "mash_efficiency_pct";
ALTER TABLE "equipment_profiles" DROP COLUMN IF EXISTS "mash_tun_deadspace_l";
ALTER TABLE "equipment_profiles" DROP COLUMN IF EXISTS "sparge_vessel_deadspace_l";
ALTER TABLE "equipment_profiles" DROP COLUMN IF EXISTS "top_up_water_l";
DROP TYPE IF EXISTS "equipment_brew_method";
