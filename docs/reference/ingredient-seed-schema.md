# Структура seed-данных каталога — Reference

> **Назначение:** структура JSON seed-данных по группам ингредиентов и критичные несовместимости полей.
> **Источники истины (код/данные):** seed-скрипты `packages/db/*`, JSON-каталоги ингредиентов
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [ingredient-add-and-search.md](ingredient-add-and-search.md)

---

## Где это лежит в коде

- **Реальный манифест сидера:** `catalogSeedManifest` в [packages/db/scripts/catalog-seed.ts](../../packages/db/scripts/catalog-seed.ts). Именно он определяет, какие файлы из `ingredients/new/` грузятся и как `type` сопоставляется с подготовкой записи. Точка входа — `seedCatalogFromSources()`.
- **Маппинг JSON → сущности:** функции `prepareHop` / `prepareMalt` / `prepareFermentable` / `prepareYeast` / `prepareConsumable` / `prepareWaterTreatment` в том же файле. Все «характеристические» поля складываются в JSONB-колонку `attributes` (через `compactRecord`, который выкидывает `null`/`undefined`/пустые массивы), а не в отдельные колонки.
- **Целевые таблицы БД:** `ingredients`, `ingredient_aliases`, `ingredient_sources`, `ingredient_package_variants` (схема — [packages/db/src/schema.ts](../../packages/db/src/schema.ts)).
- **Контракт ожидаемых объёмов:** [packages/db/scripts/catalog-seed-data.test.ts](../../packages/db/scripts/catalog-seed-data.test.ts) фиксирует точные количества записей (см. ниже).
- **Чтение/презентация в вебе:** `apps/web/features/ingredients/*` (`catalog-service.ts`, `contracts.ts`, `presentation.ts`, `taxonomy.ts`, `water-treatment.ts`, `consumables.ts`). Это **слой чтения** поверх БД, а не маппинг seed. malt и fermentable там объединяются в одну UI-категорию `fermentable` с подтипом `subtype: "malt" | "fermentable"`.

> ⚠️ Файл [packages/db/scripts/catalog-manifest.ts](../../packages/db/scripts/catalog-manifest.ts) (`catalogDatasetManifest` / `activeCatalogDatasets`, со ссылками на `*_v6c_search_ready.json`, `*_v3_expanded.json` и т.п.) **не используется** ни одним рантаймом или сидером (grep по `apps`/`packages` не находит импортов). Это устаревший/исторический манифест; ориентироваться нужно на `catalogSeedManifest` в `catalog-seed.ts`.

---

## Группы каталогов

Активный сидер грузит **7 файлов** из `ingredients/new/` и раскладывает их в **6 типов** ингредиента (`hop`, `malt`, `fermentable`, `yeast`, `consumable`, `water_treatment`). Тип `consumable` собирается сразу из двух файлов.

| Тип (`ingredients.type`) | Файл (`ingredients/new/`) | Root shape | Записей (после resolve) |
| --- | --- | --- | ---: |
| `hop` | [hop_catalog_minimal_v2.json](../../ingredients/new/hop_catalog_minimal_v2.json) | массив | 218 |
| `malt` | [malt_catalog_minimal_v2.json](../../ingredients/new/malt_catalog_minimal_v2.json) | массив | 442 |
| `fermentable` | [fermentables_catalog_minimal_v2.normalized.json](../../ingredients/new/fermentables_catalog_minimal_v2.normalized.json) | массив | 173 |
| `yeast` | [yeasts_catalog_minimal_v2.json](../../ingredients/new/yeasts_catalog_minimal_v2.json) | объект с `items[]` | 191 |
| `consumable` | [additives_v2_1.json](../../ingredients/new/additives_v2_1.json) | объект с `items[]` + `source_manifest_summary` | 118 |
| `consumable` | [consumables_v1.json](../../ingredients/new/consumables_v1.json) | объект-манифест c `item_ids[]` + `source_catalog` | 28 |
| `water_treatment` | [water_treatment_catalog_minimal_v2.json](../../ingredients/new/water_treatment_catalog_minimal_v2.json) | объект с `items[]` | 28 |

Итого `prepareCatalogSeedFile` готовит **1198** записей: 218 hop + 442 malt + 173 fermentable + 191 yeast + **146 consumable** (118 + 28) + 28 water_treatment. Эти числа жёстко проверяются тестом `catalog-seed-data.test.ts`.

### Три формы корня JSON

Функция `loadCatalogSeedItems` поддерживает три варианта (см. `readItems` в `catalog-seed.ts`):

1. **Массив** — `malt`, `hop`, `fermentable`. Берётся как есть.
2. **Объект с `items[]`** — `yeast`, `water_treatment`, `additives_v2_1`. Берётся `root.items`.
   - Особый случай `additives_v2_1.json`: его `schema_version` начинается с `brewing_additives_seed_v2_1`, и в `source_manifest_summary.existing_item_ids` лежат 29 id, которые подтягиваются из легаси-каталога `consumables_v4_patch_proposal.json`, плюс 89 собственных новых items → **118**.
3. **Split-манифест: объект с `item_ids[]` + `source_catalog`** — `consumables_v1.json`. Сам файл данных не содержит, а ссылается на исходный каталог (`source_catalog = "consumables_v4_patch_proposal.json / brewing_consumables_unified_v4_stock_aware"`) и список из 28 id. Полные объекты резолвятся из этого источника.

### Про `consumables_v4_patch_proposal.json` (легаси-источник)

Этого файла **нет** в `ingredients/new/`. Он используется только как *источник для резолва* split-манифестов (`consumables_v1.json` и `existing_item_ids` из `additives_v2_1.json`). Сидер ищет его в порядке (см. `readCatalogFileText`):

1. внешний override-путь `/mnt/data/consumables_v4_patch_proposal.json` (`externalCatalogSeedOverrides`);
2. `ingredients/new/<fileName>`;
3. fallback на git-историю: последний коммит, где файл существовал, через `git show`.

> Примечание: ранее consumable описывался как «один файл `consumables_v4_patch_proposal.json`, 57 записей» — это устарело. Фактически consumable собирается из `additives_v2_1.json` + `consumables_v1.json`, а v4-схема живёт только как резолвимый легаси-источник.

### Файлы в `ingredients/new/`, которые НЕ входят в ingredient-seed

- `water_target_profiles_seed_v4_audited.json` — целевые профили воды (`profiles`, `bjcp_style_defaults`, `picker_blueprint` …), а не каталог ингредиентов; сидится отдельным механизмом (не проверено в рамках этого документа).

---

## Поля по группам

Ниже — фактические поля JSON. Колонка «→ маппинг» показывает, куда поле уезжает в `prepareXxx` (`attributes.*` = JSONB-колонка `attributes`). Поля, которые сидер **не читает**, помечены «— (не маппится)»: на карточке/поиске они доступны только если фронт читает их из исходного JSON напрямую.

### 1. Malt — `malt_catalog_minimal_v2.json` (массив, 442)

| Поле | Тип | → маппинг |
| --- | --- | --- |
| `id` | `string` (slug) | `ingredients.id` |
| `type` | literal `malt` | `ingredients.type` |
| `brand` | `string` (вкл. `--`) | `ingredients.brand` |
| `brand_aliases` | `string[]` | alias `neutral` |
| `country_code` | `string \| null` (`AT,BE,BY,CZ,DE,DK,FI,FR,GB,GR,LV,NL,RU,SK,UA`, …) | `ingredients.countryCode` |
| `name_en` | `string \| null` | `ingredients.nameEn` |
| `name_ru` | `string` | `ingredients.nameRu` |
| `aliases_en` / `aliases_ru` | `string[]` | alias `en` / `ru` |
| `malt_type` | `string` enum (`base, caramel, roasted, wheat, smoked, special, specialty, rye, …`) | `attributes.malt_type` |
| `extract_pct_dry_basis` | `number \| null` | `attributes.extract_pct_dry_basis` |
| `color_ebc_min` / `color_ebc_max` | `number \| null` | `attributes.color_ebc_min/max` |
| `color_lovibond` | `number \| null` | `attributes.color_lovibond` |
| `protein_pct` | `number \| null` | `attributes.protein_pct` |
| `max_usage_pct` | `number \| null` | `attributes.max_usage_pct` |
| `is_birrf_present` | `boolean` | `ingredients.presentOnBirrf` |
| `color_ebc_is_approx` | `boolean` | `attributes.color_ebc_is_approx` |
| `sources[]` | `{kind, label, url, page}` | `ingredient_sources` |

> ⚠️ Признак Бир.РФ у солода называется `is_birrf_present` (у остальных — `present_on_birrf`), но оба маппятся в одну колонку `presentOnBirrf`.

### 2. Hop — `hop_catalog_minimal_v2.json` (массив, 218)

| Поле | Тип | → маппинг |
| --- | --- | --- |
| `id`, `type` (`hop`) | `string`/literal | `ingredients.id/type` |
| `name_en`, `name_ru` | `string` | `ingredients.nameEn/nameRu` |
| `aliases_en` / `aliases_ru` | `string[]` | alias `en`/`ru` |
| `country_code` | `string` (`AU,BE,BY,CN,CZ,DE,FR,GB,NZ,RU,SI,UA,US,ZA`) | `ingredients.countryCode` |
| `producer` | `string \| null` | `ingredients.producer` |
| `producer_aliases` | `string[]` | alias `neutral` |
| `hop_form` | enum `standard \| cryo \| lupulin_concentrate \| lupomax` | `attributes.hop_form` |
| `is_blend` | `boolean` | `attributes.is_blend` |
| `present_on_birrf` | `boolean` | `ingredients.presentOnBirrf` |
| `is_popular_in_russia` | `boolean` | `attributes.is_popular_in_russia` |
| `category_birrf` / `category_birrf_ru` | `string \| null` | `attributes.category_birrf*` |
| `alpha_acid_pct_{min,max,typical}` | `number \| null` | `attributes.*` |
| `beta_acid_pct_{min,max,typical}` | `number \| null` | `attributes.*` |
| `cohumulone_pct_{min,max,typical}` | `number \| null` | `attributes.*` |
| `oil_ml_100g_{min,max,typical}` | `number \| null` | `attributes.*` |
| `aroma_descriptors_en` | `string[]` (теги аромата) | `attributes.aroma_descriptors_en` |
| `notes` | `string \| null` | `attributes.notes` |
| `oil_value_unit_warning` | `string \| null` (редко) | — (не маппится) |
| `sources[]` | `{group, label, url, confidence}` | `ingredient_sources` (`group`→`kind`) |

### 3. Fermentable — `fermentables_catalog_minimal_v2.normalized.json` (массив, 173)

Самый разнородный каталог: несоложёнка, сахара, сиропы, мёд, фрукты, экстракты, концентраты, технические добавки.

| Поле | Тип | → маппинг |
| --- | --- | --- |
| `id`, `type` (`fermentable`) | `string`/literal | `ingredients.id/type` |
| `group` | enum (`adjunct_grains, extracts_and_concentrates, fruits_and_vegetables, sugars_and_syrups, sugars_syrups_honey`) | `ingredients.groupName` |
| `ingredient_type` | enum (~21 знач.: `sugar, syrup, malt_extract, raw_adjunct, flaked_adjunct, fruit_puree, honey, …`) | fallback для `subtype_key` |
| `fermentability_class` | enum (`fully_fermentable, highly_fermentable, mostly_fermentable, partially_fermentable, non_fermentable_or_process, …`) | `attributes.fermentability_class` |
| `name_ru` | `string` | `ingredients.nameRu` |
| `name_en` | `string \| null` | `ingredients.nameEn` |
| `producer` | `string \| null` | `ingredients.producer` |
| `country_name` | `string \| null` (рус. имя: `Россия, Бельгия, США, Неизвестно`, …) | `ingredients.countryName` + код через `normalizeSeedCountryCode` → `countryCode` |
| `aliases_ru` / `aliases_en` | `string[]` | alias `ru`/`en` |
| `subtype_key` | `string` | `ingredients.itemKind` + `attributes.subtype_key` (fallback `ingredient_type`) |
| `extract_pct_dry_basis` | `number` | `attributes.extract_pct_dry_basis` |
| `color_lovibond` | `number` (у 1 записи нет) | `attributes.color_lovibond` |
| `color_ebc_exact` | `number?` | — (не маппится) |
| `protein_pct` | `number?` | — (не маппится) |
| `recommended_max_pct` | `number?` | `attributes.recommended_max_pct` |
| `present_on_birrf` | `boolean` | `ingredients.presentOnBirrf` |
| `is_usable_in_beer_gravity_calculations` | `boolean` | `attributes.*` |
| `beer_relevance` | enum | `attributes.beer_relevance` |
| `product_family` | enum (`adjunct_grain, extract_concentrate, fruit_vegetable, sugar_syrup_honey`) | `attributes.product_family` |
| `physical_form` | enum (`grain, flakes, flour, powder, syrup, liquid, puree, crystals, …`) | `attributes.physical_form` |
| `extract_form` | `dry \| liquid \| null` | `attributes.extract_form` (валидируется) |
| `base_material_family` | enum (`barley, corn, rice, wheat, rye, oats, honey, fruit, sugarcane, beet, …`) | `attributes.base_material_family` |
| `base_materials` | `string[]` | `attributes.base_materials` |
| `hopping_state` | enum `hopped \| unhopped \| unknown \| not_applicable` | `attributes.hopping_state` (валидируется) |
| `is_hopped_product` | `boolean` | `attributes.is_hopped_product` |
| `functional_role` | enum (`gravity_source, body_adjustment, color_adjustment, process_only, …`) | `attributes.functional_role` |
| `gravity_calc_mode` | enum `excluded \| normal` | `attributes.gravity_calc_mode` |
| `display_type_ru` / `display_type_en` | `string` | `attributes.display_type_*` |
| `normalization_review_flags` | `string[]?` (редко) | — (не маппится) |
| `sources[]` | `{kind, label, url}` | `ingredient_sources` |

### 4. Yeast — `yeasts_catalog_minimal_v2.json` (объект `items[]`, 191)

Root-метаданные: `dataset`, `schema_version` (`v1_minimal_clean`), `scope`, `stats` (в т.ч. `by_brand`).

| Поле записи | Тип | → маппинг |
| --- | --- | --- |
| `id` | `string` | `ingredients.id` |
| `brand` | `string` (13 знач.) | `ingredients.brand` |
| `producer_country` | `string` (англ. имя: `USA, Canada, France, China, Poland, Russia, New Zealand`) | `ingredients.countryName` + код → `countryCode` |
| `product_code` | `string` | `ingredients.productCode` |
| `name_ru`, `name_en` | `string` | `ingredients.nameRu/nameEn` |
| `form` | enum `dry \| liquid` | `attributes.form` |
| `yeast_family` | enum (~25: `ale, lager, hazy, ipa, kveik, saison, belgian, wheat, brett, sour, …`) | `attributes.yeast_family` |
| `birrf_category` | enum (`Лагерные, Пшеничные, Прочие, Элевые`) | `attributes.birrf_category` |
| `attenuation_pct_{min,max,typical}` | `number?` | только `typical` → `attributes.attenuation_pct_typical` |
| `flocculation` | enum (`low … very high`) | `attributes.flocculation` |
| `fermentation_temp_c_{min,max,optimum}` | `number?` | `attributes.fermentation_temp_c_{min,max,optimum}` |
| `alcohol_tolerance_abv_{min,max,typical}` | `number?` | только `typical` → `attributes.alcohol_tolerance_abv_typical` |
| `present_on_birrf` | `boolean?` (есть не у всех) | `ingredients.presentOnBirrf` |
| `source_basis` | enum (`birrf, official, official+birrf, …`) | `attributes.source_basis` |
| `aliases_ru` / `aliases_en` | `string[]?` | alias `ru`/`en` |
| `pof` | `negative \| positive` (?) | — (не маппится) |
| `species` | `string?` (латынь) | — (не маппится) |
| `sedimentation` | `fast \| medium \| slow` (?) | — (не маппится) |
| `notes`, `analog_reference`, `source_urls` | `string`/`string[]` (?) | — (не маппится) |

> ⚠️ У yeast `sources[]` нет — `prepareYeast` всегда пишет `sources: []`. `min`/`max` для attenuation и alcohol tolerance в `attributes` не попадают (берётся только `typical`). Поля `pof`, `species`, `flocculation`-extremes, `sedimentation` доступны только из сырого JSON.

### 5. Water treatment — `water_treatment_catalog_minimal_v2.json` (объект `items[]`, 28)

Root-метаданные: `schema_version` (`2.1-minimal`), `catalog`, `language_primary`, `notes[]`.

| Поле записи | Тип | → маппинг |
| --- | --- | --- |
| `id`, `type` (`water_treatment`) | `string`/literal | `ingredients.id/type` |
| `item_kind` | enum (`chemical, fermentable, method, water_source`) | `ingredients.itemKind` |
| `category` | enum (`acid, alkali, mineral_salt, dechlorination_agent, dilution_water, pH_fermentable, water_treatment_method`) | `ingredients.category` |
| `name_ru`, `name_en` | `string` | `ingredients.nameRu/nameEn` |
| `display_mode_ru` | literal `localized_first` | `ingredients.displayModeRu` |
| `aliases_ru` / `aliases_en` | `string[]` | alias `ru`/`en` |
| `formula`, `display_formula`, `calculation_formula` | `string?` | `attributes.*` |
| `common_forms` | `string[]` (`crystals, flakes, powder, liquid, tablet, …`) | `attributes.common_forms` |
| `unit_preferred` | `string?` (`g, mg, ml, L, % grist`) | `attributes.unit_preferred` |
| `water_calc_role` | `string[]` (ключевое для калькулятора воды; теги `raise_calcium`, `lower_mash_pH`, `dilution`, …) | `attributes.water_calc_role` |
| `effect_on_ions` | объект с **плавающими ключами** (`adds[], raises[], adds_phosphate, mash_pH, no_major_flavor_ions, …`; ионы `Ca,Cl,HCO3,K,Mg,Na,SO4`) | `attributes.effect_on_ions` (как есть) |
| `pH_effect_direction` | enum (`lowering, raising, neutral, contextual, …`) | `attributes.pH_effect_direction` |
| `recommended_for` | `string[]?` (~52 фразы) | `attributes.recommended_for` |
| `typical_use_ru` | `string` | `attributes.typical_use_ru` |
| `cautions_ru` | `string` | `attributes.cautions_ru` |
| `storage_notes_ru` | `string?` | — (не маппится) |
| `calculation_support` | enum (`full, partial, grist_based, not_an_additive, …`) | `attributes.calculation_support` |
| `common_in_homebrewing` / `common_in_pro_brewing` | `boolean` | `attributes.*` |
| `recommendation_level` | enum (`default, situational, advanced, caution`) | — (не маппится) |
| `concentration_options` | `string[]?` | `attributes.concentration_options` |
| `default_concentration_pct` | `number?` | `attributes.default_concentration_pct` |
| `source_basis` | `string[]` (`BYO, BeerSmith, Bru'n Water, …`) | `attributes.source_basis` (массив сохраняется как есть) |
| `typical_dose_reference`, `ion_contributions_ppm_per_g_per_{gal,l}` | объекты с плавающими ион-ключами | — (не маппится) |

> ⚠️ `effect_on_ions` и `ion_contributions_*` имеют динамические ключи, зависящие от вещества — flat-DTO по ним делать нельзя (см. раздел несовместимостей).

### 6. Consumable — два файла → один тип

Тип `consumable` собирается из двух источников, у которых **разные схемы записи**. `prepareConsumable` написан так, чтобы переварить обе (много `??`-fallback'ов).

#### 6a. `additives_v2_1.json` (объект `items[]`, 118 после merge)

Root: `schema_version = brewing_additives_seed_v2_1_no_fruit_puree`, `catalog_name`, `source_manifest_summary.existing_item_ids` (29 id, подтягиваются из легаси v4) + 89 собственных items. Это «новая» схема добавок (специи, цедра, травы, кофе/какао, дерево, ароматизаторы, технические добавки).

| Поле записи | Тип | → маппинг |
| --- | --- | --- |
| `id`, `name_ru`, `name_en` | `string` | `ingredients.*` |
| `aliases_ru` / `aliases_en` | `string[]` | alias `ru`/`en` |
| `group_ru` | `string` (рус. группа) | `ingredients.groupName` + `attributes.additive_group_ru`; нормализуется `canonicalizeConsumableSeedGroup` → `picker_group`/`category`/`itemKind` |
| `subcategory_ru` | `string` | `ingredients.subcategory` (для новых) + `attributes.additive_subcategory_ru` |
| `beerxml_misc_type` | `string` | `attributes.beerxml_misc_type` (признак «новой» схемы) |
| `default_use` | `string` | `attributes.default_use` + нормализуется в `usage_stage` |
| `allowed_uses` | `string[]` | `attributes.allowed_uses` + `usage_stage` |
| `default_unit`, `stock_units` | `string`/`string[]` | `quantity_defaults` через `buildConsumableQuantityDefaults`; `stock_units` → `attributes.stock_units` |
| `form` | `string` | `attributes.common_forms` (если нет `common_forms`) |
| `flavor_tags_ru` | `string[]` | `attributes.flavor_tags_ru` |
| `typical_styles_ru` | `string[]` | `attributes.typical_styles_ru` |
| `dosage_hint_ru` | `string` | `attributes.picker_usage_ru` (fallback) |
| `gravity_contribution` | `string` | `attributes.gravity_contribution` |
| `notes_ru` | `string` | `attributes.notes_ru` |
| `search_boost_terms` | `string[]` | alias `neutral` (`seed_priority_term`) + `search_priority_terms_ru` |

#### 6b. `consumables_v1.json` → резолв из `consumables_v4_patch_proposal.json` (28)

Split-манифест: `source_catalog`, `item_ids[]`, `primary_quick_filter_chips_ru = [Санитайзеры, Мойка, Тара, Укупорка, Газы]`. Сами объекты — «v4 stock-aware» схема (санитайзеры, мойка, тара/укупорка, газы) с поддержкой склада и SKU-вариантов.

| Поле записи (v4) | Тип | → маппинг |
| --- | --- | --- |
| `id`, `type` (`consumable`), `name_ru`, `name_en` | — | `ingredients.*` |
| `display_mode_ru` | `localized_first \| source_first` | `ingredients.displayModeRu` |
| `aliases_ru` / `aliases_en` | `string[]` | alias `ru`/`en` |
| `item_kind` | enum (`cleaner, gas, packaging_item, process_aid`) | через `picker_group`-нормализацию → `ingredients.itemKind` |
| `category` | enum (`sanitizer, cleaner, fining, nutrient, antioxidant, defoamer, enzyme, gas, packaging, preservative`) | `ingredients.category`/`subcategory` (зависит от ветки) |
| `subcategory` | enum (~39 знач.) | `ingredients.subcategory` (для легаси) + `attributes.legacy_subcategory` |
| `picker_group` | `string` (= `category`) | `attributes.picker_group` |
| `common_forms` | `string[]` | `attributes.common_forms` |
| `usage_stage` | `string[]` | `attributes.usage_stage` |
| `quantity_defaults` | объект (`quantity_model, recipe_unit_default, stock_unit_default, stock_mode_default, stock_modes_supported, allow_fractional_stock, secondary_measurements_supported[]`) | `ingredients.quantityDefaults` (как есть) |
| `package_variants[]` | массив SKU (`id, brand, product_name_*, package{amount,unit}, country_name_*, source{group,url}, stock_content_per_*`/`content_per_*`) | `ingredient_package_variants` |
| `market_names_ru` / `market_names_en` | `string[]` | alias `ru`/`en` (`seed_market_name`) + `attributes.market_names_*` |
| `search_priority_terms_ru` / `_en` | `string[]` | alias (`seed_priority_term`) + `attributes.*` |
| `picker_function_ru`, `picker_usage_ru` | `string` | `attributes.*` |
| `family_key` | `string` (~46 знач.) | `attributes.family_key` |
| `brand_family_mode` | `matched_variant_brand \| none` | `attributes.brand_family_mode` |
| `dosage_reference` | объект (`common_ratio, example_reference`) | `attributes.dosage_reference` |
| `capacity_per_piece`, `closure_standard` | объект / `string` (у packaging) | — (не маппится напрямую; `closure_standard` не читается сидером) |
| `typical_use_ru`, `storage_notes_ru` | `string?` | — (не маппится) |

> ⚠️ Только consumable пишет `package_variants` и непустой `quantityDefaults`. У остальных типов `packageVariants: []` и `quantityDefaults: null`. Тест `catalog-seed-data.test.ts` это закрепляет.

---

## Критичные несовместимости

Учитывать при любом «универсальном» DTO/фильтре/карточке.

1. **Разный корень JSON.** Массив (`malt/hop/fermentable`), объект с `items[]` (`yeast/water_treatment/additives_v2_1`), split-манифест с `item_ids[]` + `source_catalog` (`consumables_v1`). Парсер обязан поддерживать все три (`loadCatalogSeedItems`).

2. **Признак Бир.РФ называется по-разному.** У солода — `is_birrf_present`, у hop/fermentable/yeast/water — `present_on_birrf`. В БД обе формы сводятся в одну колонку `presentOnBirrf`, но в сыром JSON это разные ключи.

3. **Страна хранится тремя способами.**
   - `country_code` (ISO-2) — malt, hop;
   - `country_name` (рус. имя) — fermentable;
   - `producer_country` (англ. имя) — yeast.
   Сидер нормализует всё в `countryCode` через `normalizeSeedCountryCode` (+ таблицы `countryCodeAliases`, `countryNameToCode`), а исходное имя сохраняет в `countryName`.

4. **Тип/класс — пять разных полей.** `malt_type` (malt), `yeast_family` (yeast), `group` + `ingredient_type` + `subtype_key` (fermentable), `category` + `item_kind` (water_treatment, consumable). Единого «type enum» поверх всех групп нет.

5. **Consumable — это две несовместимые схемы под одним типом.** «Новая» (`additives_v2_1`: `group_ru`, `subcategory_ru`, `beerxml_misc_type`, `default_use`, `allowed_uses`, `default_unit`, `flavor_tags_ru`, …) и «v4 stock-aware» (`consumables_v1` → v4: `item_kind`, `category`, `subcategory`, `package_variants`, `quantity_defaults`, `family_key`, …). `prepareConsumable` склеивает их через `??`-цепочки и `canonicalizeConsumableSeedGroup`. Нельзя предполагать, что у consumable-записи есть конкретное поле.

6. **Плавающие/динамические ключи в water_treatment и consumable.** `effect_on_ions`, `ion_contributions_ppm_per_g_per_{gal,l}`, `typical_dose_reference` (water), `secondary_measurements_supported`, `stock_content_per_*`/`content_per_*` (consumable) — структура зависит от вещества. Жёсткий flat-table DTO по ним делать нельзя; в БД они хранятся как JSON в `attributes`/`quantityDefaults`/`package_variants`.

7. **Полу-открытая таксономия / свободный текст.** `subcategory`, `family_key`, `search_priority_terms_*`, `recommended_for`, `aroma_descriptors_en`, `notes*` — не подходят как UI-enum первого уровня; это теги/подбор/свободный текст.

8. **Часть полей JSON сидер не читает.** `color_ebc_exact`, `protein_pct` (fermentable), `pof`, `species`, `sedimentation`, `notes` (yeast), `recommendation_level`, `storage_notes_ru`, `closure_standard` и др. отсутствуют в `attributes`. Если они нужны на карточке/в фильтре — придётся либо расширить `prepareXxx`, либо читать из сырого JSON.

---

## Рекомендации

### Модель фильтров по типам

- **Malt** — enum: `malt_type`, `country_code`, `brand`, `presentOnBirrf`; range: `color_ebc_min/max`, `extract_pct_dry_basis`, `protein_pct`, `max_usage_pct`.
- **Hop** — enum: `country_code`, `hop_form`, `category_birrf`, `producer`, `present_on_birrf`, `is_popular_in_russia`, `is_blend`; range: `alpha/beta/cohumulone/oil ..._typical`; tag: `aroma_descriptors_en`.
- **Fermentable** — enum: `group`, `ingredient_type`, `fermentability_class`, `product_family`, `physical_form`, `base_material_family`, `hopping_state`, `functional_role`, `beer_relevance`; bool: `present_on_birrf`, `is_hopped_product`, `is_usable_in_beer_gravity_calculations`; range: `extract_pct_dry_basis`, `color_lovibond`, `recommended_max_pct`.
- **Yeast** — enum: `form`, `yeast_family`, `brand`, `producer_country`, `birrf_category`, `source_basis`, `flocculation`; range: `attenuation_pct_typical`, `fermentation_temp_c_{min,max}`, `alcohol_tolerance_abv_typical`. (`pof`/`species`/`sedimentation` — только если расширить маппинг.)
- **Water treatment** — enum: `item_kind`, `category`, `calculation_support`, `common_in_homebrewing`, `common_in_pro_brewing`; tag: `water_calc_role`, `recommended_for`. (`recommendation_level` сейчас не в `attributes`.)
- **Consumable** — верхний уровень: `category`/`picker_group`, `item_kind`; второй уровень: `subcategory`, `usage_stage`, `common_forms`, `brand_family_mode`; складские: `quantity_defaults.quantity_model`, `quantity_defaults.stock_mode_default`.

### Модель карточек по типам

- Общие поля: `name_ru`, `name_en`, `type`, `aliases_ru`, `aliases_en`, источники.
- **malt / hop / fermentable / yeast** — «характеристическая» карточка: много чисел и диапазонов.
- **water_treatment** — «функциональная»: роль в воде (`water_calc_role`), влияние на pH/ионы (`effect_on_ions`, `pH_effect_direction`), `typical_use_ru`, `cautions_ru`.
- **consumable** — «складская»: фасовки/`package_variants`, единицы учёта (`quantity_defaults`), этап (`usage_stage`), функция (`picker_function_ru`).
- Пустые блоки скрывать, а не показывать `null`/`—`: `compactRecord` уже выкидывает пустые значения на этапе сидинга, поэтому отсутствие ключа в `attributes` = «нет данных».

### Поиск

Индексировать не только `name_*`, но и `aliases_*`, `brand`/`producer`, `producer_aliases`/`brand_aliases`, `market_names_*`, `search_priority_terms_*`, `formula`, `product_code`. Алиасы уже нормализуются (`normalizeCatalogAlias`) и складываются в `ingredient_aliases` с пометкой `locale` и `source` (`seed`, `seed_market_name`, `seed_priority_term`).
