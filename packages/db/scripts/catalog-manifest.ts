export type CatalogDatasetKind =
  | "malt"
  | "hop"
  | "yeast"
  | "non_malt_fermentable"
  | "water_prep"
  | "consumable";

export type CatalogDatasetManifestEntry = {
  kind: CatalogDatasetKind;
  datasetId: string;
  fileName: string;
};

export const catalogSnapshotId = "2026-03-18";

export const catalogDatasetManifest = {
  malt: {
    kind: "malt",
    datasetId: "malt_products_superset_ru_bilingual",
    fileName: "malt_products_superset_ru_bilingual_v6c_search_ready.json"
  },
  hop: {
    kind: "hop",
    datasetId: "hop_varieties_for_site_ru_bilingual",
    fileName: "hop_varieties_for_site_ru_bilingual_v2_rf_expanded.json"
  },
  yeast: {
    kind: "yeast",
    datasetId: "beer_yeasts_all_ru_bilingual_multisource",
    fileName: "beer_yeasts_all_ru_bilingual_multisource_v3_expanded.json"
  },
  nonMaltFermentable: {
    kind: "non_malt_fermentable",
    datasetId: "beer_fermentables_non_malt_multisource_ru_first",
    fileName: "beer_fermentables_non_malt_multisource_ru_first_v3.json"
  },
  waterPrep: {
    kind: "water_prep",
    datasetId: "brewing_water_treatment_additives_ru",
    fileName: "brewing_water_treatment_additives_ru.json"
  },
  consumable: {
    kind: "consumable",
    datasetId: "brewing_consumables_superset_ru",
    fileName: "brewing_consumables_superset_ru_v2.json"
  }
} satisfies Record<string, CatalogDatasetManifestEntry>;

export const activeCatalogDatasets = Object.values(catalogDatasetManifest);
