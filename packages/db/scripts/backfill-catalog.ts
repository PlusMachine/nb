import { pool } from "../src";
import { syncCatalogSnapshot } from "./sync-catalog";

const run = async () => {
  const result = await syncCatalogSnapshot();
  console.log(`Catalog sync complete: ${result.totalItems} items, ${result.totalFamilies} families, ${result.archivedMissingCount} archived stale source rows, ${result.archivedLegacyCount} archived legacy rows.`);
};

void run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
