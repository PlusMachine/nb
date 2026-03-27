import { pool } from "../src";
import { seedCatalogFromSources } from "./catalog-seed";

const run = async () => {
  const result = await seedCatalogFromSources();
  console.log(`Catalog sync complete: ${result.processed} processed, ${result.inserted} inserted, ${result.updated} updated.`);
};

void run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
