import { pool } from "../src";
import { seedCatalogFromSources } from "./catalog-seed";

const run = async () => {
  const result = await seedCatalogFromSources();
  for (const conflict of result.conflicts) console.warn(`Catalog conflict ${conflict.ingredientId} / ${conflict.field}: kept editorial value`, JSON.stringify({ current: conflict.current, incoming: conflict.incoming }));
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
