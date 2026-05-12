# Схема seed-данных по ингредиентам

Документ собран по фактическим JSON из `ingredients/new` и манифесту сидера в [packages/db/scripts/catalog-seed.ts](/home/dopefish/projects/nb/packages/db/scripts/catalog-seed.ts).

Цель документа:
- зафиксировать реальные поля и формы данных, которые уже есть в seed JSON;
- показать, какие поля подходят для фильтров, карточек и поиска;
- подсветить несовместимости между каталогами, чтобы не строить "универсальную" UI-схему на ложных предположениях.

## Файлы и объёмы

| Каталог | Файл | Root shape | Записей |
| --- | --- | --- | ---: |
| Malt | [ingredients/new/malt_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/malt_catalog_minimal_v2.json) | массив | 442 |
| Hop | [ingredients/new/hop_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/hop_catalog_minimal_v2.json) | массив | 218 |
| Fermentable | [ingredients/new/fermentables_catalog_minimal_v2.normalized.json](/home/dopefish/projects/nb/ingredients/new/fermentables_catalog_minimal_v2.normalized.json) | массив | 173 |
| Yeast | [ingredients/new/yeasts_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/yeasts_catalog_minimal_v2.json) | объект с `items[]` | 191 |
| Water treatment | [ingredients/new/water_treatment_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/water_treatment_catalog_minimal_v2.json) | объект с `items[]` | 28 |
| Consumable | [ingredients/new/consumables_v4_patch_proposal.json](/home/dopefish/projects/nb/ingredients/new/consumables_v4_patch_proposal.json) | объект с `items[]` | 57 |

## Общие выводы для UI

- Общего "универсального" набора полей для всех ингредиентов нет. Нужны отдельные карточки и отдельные пресеты фильтров минимум для: `malt`, `hop`, `fermentable`, `yeast`, `water_treatment`, `consumable`.
- Даже похожие сущности называют поля по-разному:
  - страна: `country_code`, `country_name`, `producer_country`;
  - производитель: `brand`, `producer`;
  - наличие на Бир.РФ: `is_birrf_present` у солода и `present_on_birrf` у остальных;
  - тип/класс: `malt_type`, `yeast_family`, `group`, `category`, `item_kind`.
- Для поиска почти везде есть русские и английские алиасы, но покрытие разное. Поиск лучше индексировать не только по `name_*`, а ещё по `aliases_*`, `brand`/`producer`, `market_names_*`, `formula`, `product_code`.
- Для фильтров безопаснее делить поля на 3 класса:
  - хорошие enum-фильтры: короткий конечный набор значений (`malt_type`, `hop_form`, `yeast_family`, `category`, `item_kind`);
  - range-фильтры: цвет, экстрактивность, кислотность, температура, аттенюация;
  - поисковые/теговидные поля: `aliases_*`, `aroma_descriptors_en`, `recommended_for`, `usage_stage`, `water_calc_role`, `search_priority_terms_*`.
- У части полей значения факультативны. Для карточек лучше предусмотреть скрытие пустых блоков, а не показывать `"null"`/`—` автоматически.

## 1. Malt

Источник: [ingredients/new/malt_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/malt_catalog_minimal_v2.json)

Root shape: массив объектов.

### Поля записи

- `id`: обязательный `string`, уникальный slug. Пример: `avangard-malz-pilsener-de-base`.
- `type`: обязательный literal `malt`.
- `brand`: обязательный `string`, 49 текущих значений. Примеры: `Avangard Malz`, `Bestmalz`, `--`.
- `brand_aliases`: обязательный `string[]`, может быть пустым. Использовать в поиске и на карточке как вторичное имя бренда.
- `country_code`: `string | null`, сейчас встречаются `AT`, `BE`, `BY`, `CZ`, `DE`, `DK`, `FI`, `FR`, `GB`, `GR`, `LV`, `NL`, `RU`, `SK`, `UA`, `null`.
- `name_en`: `string | null`, английское имя есть не у всех.
- `name_ru`: обязательный `string`, основное локализованное имя для RU UI.
- `aliases_en`: обязательный `string[]`, может быть пустым.
- `aliases_ru`: обязательный `string[]`, может быть пустым.
- `malt_type`: обязательный `string`, хороший enum-фильтр. Текущие значения: `alternative_grain`, `base`, `caramel`, `functional`, `other_grain`, `roasted`, `rye`, `rye_caramel`, `smoked`, `special`, `specialty`, `wheat`, `wheat_caramel`.
- `extract_pct_dry_basis`: `number | null`, экстрактивность на сухую основу.
- `color_ebc_min`: `number | null`, минимум EBC.
- `color_ebc_max`: `number | null`, максимум EBC.
- `color_lovibond`: `number | null`, цвет в Lovibond.
- `protein_pct`: `number | null`.
- `max_usage_pct`: `number | null`, рекомендуемый максимум использования. Значение часто отсутствует; текущие варианты: `5`, `10`, `15`, `20`, `25`, `30`, `40`, `50`, `60`, `70`, `75`, `80`, `90`, `100`, `null`.
- `is_birrf_present`: обязательный `boolean`.
- `color_ebc_is_approx`: обязательный `boolean`, важно для UI-пометки "примерный цвет".
- `sources`: обязательный массив объектов-источников.

### Вложенный объект `sources[]`

- `kind`: `string | null`. Текущие значения: `beer_rf`, `beer_rf_listing`, `birrf_ingredient_listing`, `birrf_ingredient_page`, `birrf_ingredients_list`, `birrf_store_product`, `distributor_html`, `grainrus_catalog_pdf`, `malt_ru_catalog_pdf`, `malt_ru_store_product`, `null`, `official_html`, `official_pdf`, `retailer_html`.
- `label`: обязательный `string`, текст источника для человека.
- `url`: `string | null`.
- `page`: `number | null`, номер страницы PDF/каталога.

### Что фильтровать

- Основные фильтры: `malt_type`, `country_code`, `brand`, `is_birrf_present`.
- Диапазоны: `extract_pct_dry_basis`, `color_ebc_min/max`, `protein_pct`, `max_usage_pct`.
- Поиск: `name_ru`, `name_en`, `aliases_ru`, `aliases_en`, `brand`, `brand_aliases`.

### Что показывать на карточке

- Заголовок: `name_ru`, ниже `name_en` если есть.
- Сабтайтл: `brand`, `country_code`, `malt_type`.
- Характеристики: EBC, Lovibond, экстрактивность, белок, максимум использования.
- Бейджи: `is_birrf_present`, `color_ebc_is_approx`.

### Примеры записей

- `avangard-malz-pilsener-de-base`: базовый солод, `brand=Avangard Malz`, `country_code=DE`, `extract_pct_dry_basis=80`, `color_ebc_min=4.318`, `max_usage_pct=100`.
- `bestmalz-best-a-xl-malt`: функциональный солод.
- `triticosecale-neizvestno-special`: special malt с `country_code=null`, то есть UI должен уметь жить без страны.

## 2. Hop

Источник: [ingredients/new/hop_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/hop_catalog_minimal_v2.json)

Root shape: массив объектов.

### Поля записи

- `id`: обязательный `string`, уникальный slug. Пример: `au-eclipse-standard`.
- `type`: обязательный literal `hop`.
- `name_en`: обязательный `string`.
- `name_ru`: обязательный `string`.
- `aliases_en`: обязательный `string[]`, может быть пустым.
- `aliases_ru`: обязательный `string[]`, может быть пустым.
- `country_code`: обязательный `string`. Текущие значения: `AU`, `BE`, `BY`, `CN`, `CZ`, `DE`, `FR`, `GB`, `NZ`, `RU`, `SI`, `UA`, `US`, `ZA`.
- `producer`: `string | null`, 25 непустых текущих значений. Примеры: `HPA`, `Yakima Chief Hops`, `Hopsteiner`, `Beervingem`.
- `producer_aliases`: обязательный `string[]`, может быть пустым.
- `hop_form`: обязательный `string`, хороший enum-фильтр. Значения: `standard`, `cryo`, `lupulin_concentrate`, `lupomax`.
- `is_blend`: обязательный `boolean`.
- `present_on_birrf`: обязательный `boolean`.
- `is_popular_in_russia`: обязательный `boolean`.
- `category_birrf`: `string | null`, значения: `aroma`, `bitter`, `bitter_aroma`, `null`.
- `category_birrf_ru`: `string | null`, значения: `Ароматный`, `Горький`, `Горько-ароматный`, `null`.
- `alpha_acid_pct_min`: `number | null`.
- `alpha_acid_pct_max`: `number | null`.
- `alpha_acid_pct_typical`: `number | null`.
- `beta_acid_pct_min`: `number | null`.
- `beta_acid_pct_max`: `number | null`.
- `beta_acid_pct_typical`: `number | null`.
- `cohumulone_pct_min`: `number | null`.
- `cohumulone_pct_max`: `number | null`.
- `cohumulone_pct_typical`: `number | null`.
- `oil_ml_100g_min`: `number | null`.
- `oil_ml_100g_max`: `number | null`.
- `oil_ml_100g_typical`: `number | null`.
- `aroma_descriptors_en`: обязательный `string[]`, массив тэгов аромата. Это не enum-фильтр верхнего уровня, а теговый поиск/подбор.
- `sources`: обязательный массив объектов-источников.
- `notes`: `string | null`, свободный текст про нормализацию/рыночный контекст.
- `oil_value_unit_warning`: `string | null`, сейчас встречается только `source anomaly / likely mg vs mL mismatch` у 2 записей.

### Вложенный объект `sources[]`

- `group`: обязательный `string`, 24 текущие группы источников.
- `label`: обязательный `string`.
- `url`: обязательный `string`.
- `confidence`: обязательный `string`, значения: `high`, `medium`.

### Что фильтровать

- Основные фильтры: `country_code`, `hop_form`, `category_birrf`, `present_on_birrf`, `is_popular_in_russia`, `is_blend`, `producer`.
- Диапазоны: `alpha_acid_pct_typical`, `beta_acid_pct_typical`, `cohumulone_pct_typical`, `oil_ml_100g_typical`.
- Теги/поиск: `aroma_descriptors_en`, `aliases_*`, `producer_aliases`, `notes`.

### Что показывать на карточке

- Заголовок: `name_ru` и `name_en`.
- Сабтайтл: `producer`, `country_code`, `hop_form`.
- Числовой блок: alpha, beta, cohumulone, oil.
- Бейджи: `category_birrf_ru`, `present_on_birrf`, `is_popular_in_russia`, `is_blend`.
- Ароматы: `aroma_descriptors_en`.
- Warning: `oil_value_unit_warning` если заполнен.

### Примеры записей

- `au-eclipse-standard`: `producer=HPA`, `hop_form=standard`, `category_birrf=bitter_aroma`, высокий alpha.
- `au-ella-beervingem-standard`: тот же сорт, но market-specific producer `Beervingem`, часть химии пустая.
- `au-enigma-standard`: полный профиль с маслами и beta/cohumulone.

## 3. Fermentable

Источник: [ingredients/new/fermentables_catalog_minimal_v2.normalized.json](/home/dopefish/projects/nb/ingredients/new/fermentables_catalog_minimal_v2.normalized.json)

Root shape: массив объектов.

Это самый разношёрстный каталог. Здесь вместе лежат несоложёнка, сахара, сиропы, мёд, фрукты, экстракты, концентраты и технические добавки для плотности/цвета.

### Поля записи

- `id`: обязательный `string`.
- `type`: обязательный literal `fermentable`.
- `group`: обязательный `string`, верхний блок каталога. Значения: `adjunct_grains`, `extracts_and_concentrates`, `fruits_and_vegetables`, `sugars_and_syrups`, `sugars_syrups_honey`.
- `ingredient_type`: обязательный `string`, основной enum для подтипа. Текущие значения: `body_builder`, `coloring_extract`, `coloring_sugar`, `dried_fruit`, `extract`, `flaked_adjunct`, `flour_adjunct`, `fruit_or_vegetable`, `fruit_puree`, `honey`, `juice`, `juice_concentrate`, `kvass_concentrate`, `malt_corn_concentrate`, `malt_extract`, `molasses`, `process_adjunct`, `raw_adjunct`, `sugar`, `syrup`, `torrefied_adjunct`.
- `fermentability_class`: обязательный `string`, значения: `fully_fermentable`, `highly_fermentable`, `largely_non_fermentable`, `mash_fermentable`, `mostly_fermentable`, `mostly_non_fermentable_color_only`, `non_fermentable_or_process`, `partially_fermentable`.
- `name_ru`: обязательный `string`.
- `name_en`: `string | null`, покрытие не полное.
- `producer`: `string | null`.
- `country_name`: `string | null`, 26 текущих вариантов, включая `Россия`, `Великобритания`, `Бельгия`, `США`, `Неизвестно`.
- `aliases_ru`: обязательный `string[]`, может быть пустым.
- `aliases_en`: обязательный `string[]`, может быть пустым.
- `extract_pct_dry_basis`: обязательный `number`.
- `color_lovibond`: почти всегда `number`, у 1 записи может отсутствовать.
- `color_ebc_exact`: `number | undefined`, есть только у части записей.
- `protein_pct`: `number | undefined`.
- `recommended_max_pct`: `number | undefined`, текущие типовые значения: `0.5`, `1`, `2.5`, `5`, `8`, `10`, `15`, `20`, `25`, `30`, `40`, `50`, `70`, `100`.
- `present_on_birrf`: обязательный `boolean`.
- `is_usable_in_beer_gravity_calculations`: обязательный `boolean`.
- `beer_relevance`: обязательный `string`, значения: `beer_common_specialty`, `beer_niche_but_valid`, `core_brewing_or_adjunct`, `secondary_but_valid_for_beer`, `technical_or_color_adjustment`.
- `sources`: обязательный массив объектов.
- `product_family`: обязательный `string`, значения: `adjunct_grain`, `extract_concentrate`, `fruit_vegetable`, `sugar_syrup_honey`.
- `subtype_key`: обязательный `string`, детализация подтипа. Сейчас совпадает с бизнес-категоризацией: `malt_extract`, `sugar`, `whole_fruit_or_vegetable`, `juice_concentrate`, `raw_adjunct` и т.д.
- `physical_form`: обязательный `string`, значения: `concentrated_juice`, `crystals`, `dried`, `flakes`, `flour`, `grain`, `hulls_husks`, `juice`, `liquid`, `pieces`, `powder`, `puree`, `syrup`, `torrefied_grain`, `whole`.
- `extract_form`: `string | null`, значения: `dry`, `liquid`, `null`.
- `base_material_family`: обязательный `string`, значения: `barley`, `beet`, `buckwheat`, `chicory`, `coconut`, `corn`, `fruit`, `honey`, `kvass_wort`, `lactose`, `mixed_grain`, `oats`, `palm`, `rice`, `rye`, `sorghum`, `sugarcane`, `unknown`, `vegetable`, `wheat`.
- `base_materials`: обязательный `string[]`, конкретизация сырья. Подходит для расширенного поиска/тегов.
- `hopping_state`: обязательный `string`, значения: `hopped`, `not_applicable`, `unhopped`, `unknown`.
- `is_hopped_product`: обязательный `boolean`.
- `functional_role`: обязательный `string`, значения: `body_adjustment`, `color_adjustment`, `gravity_source`, `gravity_source_with_bitterness`, `process_only`.
- `gravity_calc_mode`: обязательный `string`, значения: `excluded`, `normal`.
- `display_type_ru`: обязательный `string`, пользовательское отображение типа. Сейчас 23 значения, например `Несоложёнка`, `Сахар`, `Жидкий солодовый экстракт`, `Фруктовое пюре`, `Техническая добавка`.
- `display_type_en`: обязательный `string`, английский аналог `display_type_ru`.
- `normalization_review_flags`: `string[] | undefined`, редкое поле. Выявленные теги: `ambiguous_hopping_state`, `consider_split_into_two_catalog_entries`, `hopping_state_not_confirmed`, `market_has_both_hopped_and_unhopped_variants`, `physical_form_inferred_from_category_and producer site`.

### Вложенный объект `sources[]`

- `kind`: обязательный `string`, значения: `birrf_detail`, `birrf_listing`, `industry_reference`.
- `label`: обязательный `string`.
- `url`: обязательный `string`.

### Что фильтровать

- Основные фильтры: `group`, `ingredient_type`, `fermentability_class`, `product_family`, `physical_form`, `base_material_family`, `hopping_state`, `functional_role`, `beer_relevance`, `present_on_birrf`.
- Диапазоны: `extract_pct_dry_basis`, `color_lovibond`, `color_ebc_exact`, `protein_pct`, `recommended_max_pct`.
- Отдельные флаги: `is_usable_in_beer_gravity_calculations`, `is_hopped_product`, `gravity_calc_mode`.

### Что показывать на карточке

- Заголовок: `name_ru`, `name_en`.
- Типовая строка: `display_type_ru`, `group`, `ingredient_type`.
- Характеристики: экстрактивность, цвет, белок, рекомендуемый максимум.
- Бейджи: `is_hopped_product`, `gravity_calc_mode`, `present_on_birrf`.
- Вспомогательные теги: `base_material_family`, `physical_form`, `functional_role`.

### Примеры записей

- `gerkules-nesolozhenka`: raw adjunct, `group=adjunct_grains`, `physical_form=grain`.
- `buckwheat-nesolozhenka`: гречка как несоложёнка, `base_material_family=buckwheat`.
- `kompaniya-uvelka-ooo-resurs-buckwheat-flakes-nesolozhenka`: flaked adjunct с producer.

## 4. Yeast

Источник: [ingredients/new/yeasts_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/yeasts_catalog_minimal_v2.json)

Root shape: объект с мета-полями и `items[]`.

### Root metadata

- `dataset`: `beer_yeasts_all_minimal`
- `schema_version`: `v1_minimal_clean`
- `scope`: свободное текстовое описание состава каталога
- `stats`: объект статистики:
  - `total_items`
  - `brands`
  - `dry`
  - `liquid`
  - `present_on_birrf_true`
  - `popular_in_russia_true`
  - `by_brand` как словарь бренд -> количество

### Поля записи

- `id`: обязательный `string`.
- `brand`: обязательный `string`, 13 значений: `ASP Lab`, `Angel Yeast`, `BeerGenomics`, `BeerVingem`, `Fermentis`, `Gozdawa`, `GrainLab`, `Lallemand`, `Lalvin`, `Mangrove Jack's`, `Omega Yeast`, `White Labs`, `Wyeast`.
- `producer_country`: обязательный `string`, текущие значения: `Canada`, `China`, `France`, `New Zealand`, `Poland`, `Russia`, `USA`.
- `product_code`: обязательный `string`.
- `name_ru`: обязательный `string`.
- `name_en`: обязательный `string`.
- `form`: обязательный `string`, значения: `dry`, `liquid`.
- `yeast_family`: обязательный `string`, основные семейства для фильтра. Текущие значения: `ale`, `american`, `belgian`, `belgian_wit`, `blend`, `brett`, `brut`, `cider`, `conditioning`, `english`, `hazy`, `high_gravity`, `hybrid`, `ipa`, `kveik`, `lager`, `low_no_alcohol`, `mead`, `neutral`, `saison`, `sour`, `specialty_dry`, `specialty_lager`, `wheat`, `wine`.
- `birrf_category`: обязательный `string`, значения: `Лагерные`, `Пшеничные`, `Прочие`, `Элевые`.
- `attenuation_pct_min`: `number | undefined`.
- `attenuation_pct_max`: `number | undefined`.
- `attenuation_pct_typical`: `number | undefined`.
- `flocculation`: `string | undefined`, значения: `high`, `low`, `low-medium`, `medium`, `medium-high`, `medium-low`, `very high`, `very-high`.
- `fermentation_temp_c_min`: `number | undefined`.
- `fermentation_temp_c_max`: `number | undefined`.
- `fermentation_temp_c_optimum`: `number | undefined`.
- `alcohol_tolerance_abv_min`: `number | undefined`.
- `alcohol_tolerance_abv_max`: `number | undefined`.
- `alcohol_tolerance_abv_typical`: `number | undefined`.
- `present_on_birrf`: `boolean | undefined`, есть не у всех записей.
- `source_basis`: обязательный `string`, значения: `birrf`, `official`, `official+birrf`, `official+retail_russia`, `retail_russia+birrf_recipe`.
- `aliases_ru`: `string[] | undefined`.
- `aliases_en`: `string[] | undefined`.
- `notes`: `string | undefined`, свободный текст.
- `pof`: `string | undefined`, значения: `negative`, `positive`.
- `species`: `string | undefined`, текущие значения: `Brettanomyces bruxellensis`, `Brettanomyces sp.`, `Lachancea spp.`, `Saccharomyces bayanus`, `Saccharomyces cerevisiae`, `Saccharomyces cerevisiae bayanus`, `Saccharomyces cerevisiae var. cerevisiae`, `Saccharomyces cerevisiae var. chevalieri`, `Saccharomyces cerevisiae var. diastaticus`, `Saccharomyces pastorianus`.
- `source_urls`: `string[] | undefined`.
- `analog_reference`: `string | undefined`, ссылка на аналог/референсный штамм.
- `sedimentation`: `string | undefined`, значения: `fast`, `medium`, `slow`.

### Что фильтровать

- Основные фильтры: `form`, `yeast_family`, `brand`, `producer_country`, `birrf_category`, `source_basis`, `present_on_birrf`, `pof`.
- Диапазоны: `attenuation_pct_typical`, `fermentation_temp_c_min/max`, `alcohol_tolerance_abv_typical`.
- Вторичные фильтры: `flocculation`, `sedimentation`, `species`.

### Что показывать на карточке

- Заголовок: `brand + product_code + name_ru`.
- Сабтайтл: `name_en`, `form`, `yeast_family`.
- Техблок: attenuation, flocculation, температурный диапазон, alcohol tolerance.
- Бейджи: `birrf_category`, `present_on_birrf`, `pof`.
- Дополнительно: `species`, `analog_reference`, `notes`.

### Примеры записей

- `angel-yeast-bf27`: dry lager, `attenuation_pct_typical=82`, `present_on_birrf=true`.
- `asp-lab-al-101-kveik-i`: liquid kveik, широкий диапазон температур, `species=Saccharomyces cerevisiae`.
- `angel-yeast-wa18`: wheat strain с `pof=positive`.

## 5. Water treatment

Источник: [ingredients/new/water_treatment_catalog_minimal_v2.json](/home/dopefish/projects/nb/ingredients/new/water_treatment_catalog_minimal_v2.json)

Root shape: объект с мета-полями и `items[]`.

### Root metadata

- `schema_version`: `2.1-minimal`
- `catalog`: `water_treatment`
- `language_primary`: `ru`
- `notes`: `string[]` с пояснениями по локализации, поиску и расчётам

### Поля записи

- `id`: обязательный `string`.
- `type`: обязательный literal `water_treatment`.
- `item_kind`: обязательный `string`, значения: `chemical`, `fermentable`, `method`, `water_source`.
- `category`: обязательный `string`, значения: `acid`, `alkali`, `dechlorination_agent`, `dilution_water`, `mineral_salt`, `pH_fermentable`, `water_treatment_method`.
- `name_ru`: обязательный `string`.
- `name_en`: обязательный `string`.
- `display_mode_ru`: обязательный literal `localized_first`.
- `aliases_ru`: обязательный `string[]`.
- `aliases_en`: обязательный `string[]`, может быть пустым.
- `formula`: `string | undefined`, короткая формула для UI/поиска.
- `display_formula`: `string | undefined`, прикладная подпись вместо формулы, например `88%` для кислоты.
- `calculation_formula`: `string | undefined`, точная расчетная форма соли, например гидрат.
- `common_forms`: обязательный `string[]`, текущие варианты элементов массива: `crystals`, `flakes`, `grist`, `liquid`, `pellets`, `powder`, `process`, `tablet`.
- `unit_preferred`: `string | undefined`, значения: `% grist`, `L`, `g`, `mg`, `ml`.
- `water_calc_role`: обязательный `string[]`, важнейшее поле для калькулятора воды. Текущие значения тегов: `acidification_minor`, `advanced_dark_beer_adjustment`, `advanced_liquor_treatment`, `advanced_profile_tuning`, `base_water`, `blank_canvas_water`, `chloramine_removal`, `chlorine_removal`, `dilution`, `enhance_fullness`, `enhance_hop_crispness`, `fine_tune_hoppy_profiles`, `grist_based_acidification`, `hypochlorite_removal`, `lower_mash_pH`, `lower_mash_pH_slightly`, `lower_sparge_pH`, `mouthfeel_adjustment`, `organic_contaminant_reduction`, `raise_alkalinity`, `raise_bicarbonate`, `raise_calcium`, `raise_chloride`, `raise_effective_bicarbonate`, `raise_magnesium`, `raise_mash_pH`, `raise_potassium`, `raise_sodium`, `raise_sulfate`, `reduce_alkalinity`, `temporary_hardness_reduction`.
- `effect_on_ions`: обязательный объект.
- `pH_effect_direction`: обязательный `string`, значения: `contextual`, `lowering`, `minimal`, `neutral_to_contextual`, `raising`, `slight_lowering`, `strong_lowering`, `strong_raising`.
- `recommended_for`: `string[] | undefined`, прикладные сценарии. Сейчас 52 различных тега/фраз.
- `typical_use_ru`: обязательный `string`.
- `cautions_ru`: обязательный `string`.
- `storage_notes_ru`: `string | undefined`.
- `calculation_support`: обязательный `string`, значения: `full`, `full_with_dissolution_caveat`, `full_with_strength`, `grist_based`, `not_an_additive`, `partial`, `user_defined_concentration`.
- `common_in_homebrewing`: обязательный `boolean`.
- `common_in_pro_brewing`: обязательный `boolean`.
- `recommendation_level`: обязательный `string`, значения: `advanced`, `caution`, `default`, `situational`.
- `typical_dose_reference`: `object | undefined`.
- `source_basis`: обязательный `string[]`, текущие значения элементов: `BYO`, `Baltic Brewing`, `BeerSmith`, `BeerSmith community`, `Brewer's Friend`, `Brewer's Friend community`, `Brewfather`, `Bru'n Water`, `The Malt Miller`.
- `concentration_options`: `string[] | undefined`, значения: `10%`, `25%`, `28–32%`, `37%`, `6.3% HCl + 8.6% H2SO4`, `75%`, `80%`, `85%`, `88%`, `93–98%`, `user_defined`.
- `default_concentration_pct`: `number | undefined`, концентрация по умолчанию для расчетов/подписи кислоты.
- `ion_contributions_ppm_per_g_per_gal`: `object | undefined`.
- `ion_contributions_ppm_per_g_per_l`: `object | undefined`.

### Вложенный объект `effect_on_ions`

Поля плавающие, зависят от вещества. Текущие ключи:

- `adds`: `string[]`
- `adds_phosphate`: `boolean`
- `adds_small_amounts_of`: `string[]`
- `depends_on_solution_strength`: `boolean`
- `dilutes_existing_ions`: `boolean`
- `fermentable_and_acidifying`: `boolean`
- `mash_pH`: `string`
- `no_direct_flavor_ion_addition`: `boolean`
- `no_major_flavor_ions`: `boolean`
- `no_major_mineral_contribution`: `boolean`
- `raises`: `string[]`
- `raises_mash_pH`: `boolean`
- `reduces_alkalinity_slightly`: `boolean`

Ионные теги внутри `adds[]`, `adds_small_amounts_of[]`, `raises[]`: `Ca`, `Cl`, `HCO3`, `HCO3_effective`, `K`, `Mg`, `Na`, `SO4`.

### Вложенный объект `typical_dose_reference`

- `mg_per_l`: `number`
- `approx_tablet_per_l`: `number | undefined`

### Вложенный объект `ion_contributions_ppm_per_g_per_gal` и `ion_contributions_ppm_per_g_per_l`

Ключи могут быть: `Ca`, `Cl`, `HCO3`, `HCO3_effective`, `K`, `Mg`, `Na`, `SO4`.

### Что фильтровать

- Основные фильтры: `item_kind`, `category`, `recommendation_level`, `calculation_support`, `common_in_homebrewing`, `common_in_pro_brewing`.
- Ролевые фильтры: `water_calc_role`.
- Поиск/подсказки: `recommended_for`, `formula`, `display_formula`, `calculation_formula`, `aliases_*`.

### Что показывать на карточке

- Заголовок: `name_ru`, `name_en`, `display_formula ?? formula`.
- Тип: `item_kind`, `category`.
- Функция: `water_calc_role`, `pH_effect_direction`, `recommendation_level`.
- Практика: `typical_use_ru`, `cautions_ru`, `storage_notes_ru`.
- Если есть: дозировка и вклад по ионам.

### Примеры записей

- `reverse-osmosis-water`: water source для `dilution`, `blank_canvas_water`, `base_water`.
- `potassium-metabisulfite`: dechlorination agent с `typical_dose_reference`.
- `ascorbic-acid`: химический агент с `calculation_support=partial`.

## 6. Consumable

Источник: [ingredients/new/consumables_v4_patch_proposal.json](/home/dopefish/projects/nb/ingredients/new/consumables_v4_patch_proposal.json)

Root shape: объект с мета-полями и `items[]`.

### Root metadata

- `schema_version`: `brewing_consumables_unified_v4_stock_aware`
- `generated_at_utc`: timestamp генерации
- `catalog_name`
- `catalog_name_en`
- `language_primary`
- `scope`
- `design_notes_ru`: `string[]`
- `ui_strategy.consumable_picker_quick_filters`: текущие быстрые фильтры: `Санитайзеры`, `Мойка`, `Осветление`, `Ферменты`, `Подкормки`, `Антиоксиданты`, `Пеногасители`, `Газы`, `Тара и укупорка`

### Поля записи

- `id`: обязательный `string`.
- `type`: обязательный literal `consumable`.
- `name_ru`: обязательный `string`.
- `name_en`: обязательный `string`.
- `display_mode_ru`: обязательный `string`, значения: `localized_first`, `source_first`.
- `aliases_ru`: обязательный `string[]`.
- `aliases_en`: обязательный `string[]`, может быть пустым.
- `item_kind`: обязательный `string`, значения: `cleaner`, `gas`, `packaging_item`, `process_aid`.
- `category`: обязательный `string`, значения: `antioxidant`, `cleaner`, `defoamer`, `enzyme`, `fining`, `gas`, `nutrient`, `packaging`, `preservative`, `sanitizer`.
- `subcategory`: обязательный `string`, 39 текущих вариантов. Это уже годится для deep filter, но не для первого уровня UI. Текущие значения: `acid_descaler`, `acid_no_rinse`, `acid_no_rinse_low_foam`, `alkaline_liquid`, `alkaline_low_foam_cip`, `alkaline_powder`, `alkaline_tablets`, `aluminum_can`, `can_lid`, `cartridge`, `caustic`, `clarity_gluten_reduction`, `cold_side_fining`, `complex`, `crown_cap`, `crown_cap_oxygen_scavenging`, `cylinder`, `deep_saccharification`, `diacetyl_control`, `draft_line_cleaner`, `finished_beer_stability`, `glass_bottle`, `hop_aroma`, `iodophor_no_rinse`, `kettle_fining`, `mash_and_boil_stability`, `mash_liquefaction`, `microbial_control`, `oxygen_based`, `oxygen_scavenger`, `paa`, `pet_bottle`, `rehydration`, `silicone`, `stabilizer`, `sulfite`, `supportive`, `swing_top_bottle`, `wort_stability`.
- `common_forms`: обязательный `string[]`, значения элементов: `chopped`, `crystals`, `cylinder`, `flakes`, `gas_cartridge`, `granules`, `liquid`, `paste`, `pellets`, `piece`, `powder`, `tablet`, `xerogel`.
- `usage_stage`: обязательный `string[]`, текущие теги: `boil`, `bottle_cleaning`, `carbonation`, `cip`, `cleaning`, `cold_crash`, `conditioning`, `dispense`, `draft_system_cleaning`, `dry_hop_biotransformation`, `dry_hop_control`, `equipment_cleaning`, `fermentation`, `fermentation_start`, `filtration`, `filtration_prep`, `finished_beer`, `lautering`, `low_oxygen_process`, `mash`, `packaging`, `passivation`, `post_fermentation`, `pre-clean`, `pre_packaging`, `sanitation`, `stability`, `stuck_fermentation_support`, `water_treatment`, `wort`, `wort_preparation`, `yeast_rehydration`.
- `quantity_defaults`: обязательный объект.
- `package_variants`: обязательный массив объектов, центральное поле для склада и SKU-представления.
- `dosage_reference`: `object | undefined`.
- `typical_use_ru`: `string | undefined`.
- `storage_notes_ru`: `string | undefined`.
- `picker_group`: обязательный `string`, значения совпадают с `category`.
- `family_key`: обязательный `string`, 46 текущих значений. Это поле для группировки похожих товаров/семейств, а не для верхнего UI-фильтра.
- `market_names_ru`: обязательный `string[]`.
- `market_names_en`: обязательный `string[]`.
- `search_priority_terms_ru`: обязательный `string[]`.
- `search_priority_terms_en`: обязательный `string[]`.
- `picker_function_ru`: обязательный `string`, человекочитаемая краткая функция.
- `picker_usage_ru`: обязательный `string`, краткое объяснение применения.
- `brand_family_mode`: обязательный `string`, значения: `matched_variant_brand`, `none`.
- `capacity_per_piece`: `object | undefined`, встречается у части packaging items.
- `closure_standard`: `string | undefined`, встречается у части packaging items. Значения: `202 / CDL202 / B64`, `26mm crown`, `28mm screw cap`, `29mm crown`, `swing-top`.

### Вложенный объект `quantity_defaults`

- `quantity_model`: обязательный `string`, значения: `package_only`, `pieces`, `volume`, `weight`.
- `recipe_unit_default`: обязательный `string`, значения: `g`, `ml`, `pcs`.
- `stock_unit_default`: обязательный `string`, значения: `g`, `ml`, `pcs`.
- `stock_mode_default`: обязательный `string`, значения: `by_package_content`, `package_count`.
- `stock_modes_supported`: обязательный `string[]`, текущие значения: `bulk_by_volume`, `bulk_by_weight`, `package`, `pieces`.
- `allow_fractional_stock`: обязательный `boolean`.
- `secondary_measurements_supported`: редкий `object[]`, сейчас встречается как вспомогательная мера для газовых картриджей.

### Вложенный объект `quantity_defaults.secondary_measurements_supported[]`

- `amount_per_piece`: `number`
- `unit`: `string`

### Вложенный объект `package_variants[]`

- `id`: обязательный `string`.
- `brand`: `string | null`.
- `product_name_ru`: `string | undefined`.
- `product_name_en`: `string | undefined`.
- `package`: обязательный объект:
  - `amount`: `number`
  - `unit`: `string`, текущие значения: `L`, `g`, `gal`, `kg`, `lb`, `ml`, `oz`, `pcs`
- `country_name_ru`: `string | undefined`
- `country_name_en`: `string | undefined`
- `source`: обязательный объект:
  - `group`: обязательный `string`
  - `url`: `string | undefined`
- `stock_content_per_package`: `object | undefined`
- `stock_content_per_piece`: `object | undefined`
- `content_per_package`: `object | undefined`
- `content_per_piece`: `object | undefined`

### Вложенные объекты с количеством в `package_variants[]`

Поля `stock_content_per_package`, `stock_content_per_piece`, `content_per_package`, `content_per_piece` имеют одинаковую форму:

- `amount`: `number`
- `unit`: `string`

Текущие единицы: `g`, `g_co2`, `ml`, `ml_each`, `g_each`, `pcs`.

### Вложенный объект `dosage_reference`

- `common_ratio`: `string`
- `example_reference`: `string | undefined`

### Вложенный объект `capacity_per_piece`

- `amount`: `number`
- `unit`: сейчас `ml`

### Что фильтровать

- Верхний уровень: `item_kind`, `category`, `picker_group`.
- Второй уровень: `subcategory`, `usage_stage`, `common_forms`, `brand_family_mode`.
- Складские фильтры: `quantity_defaults.quantity_model`, `quantity_defaults.stock_mode_default`, `closure_standard`.

### Что показывать на карточке

- Заголовок: `name_ru`, `name_en`.
- Назначение: `picker_function_ru`, `picker_usage_ru`.
- Тип: `item_kind`, `category`, `subcategory`.
- Форма и этап: `common_forms`, `usage_stage`.
- Если это packaging: `capacity_per_piece`, `closure_standard`.
- Если это stock-aware товар: список `package_variants`.

### Примеры записей

- `antioxidant-finished-beer`: process aid, антиоксидант, имеет 2 фасовки в `package_variants`.
- `antioxidant-brewtan-b`: process aid с `dosage_reference`.
- Packaging items имеют `capacity_per_piece` и/или `closure_standard`, что нужно отдельно отображать на карточке и в складе.

## Рекомендуемая модель фильтров по типам

### Malt

- Enum: `malt_type`, `country_code`, `brand`, `is_birrf_present`.
- Range: `color_ebc_min/max`, `extract_pct_dry_basis`, `protein_pct`, `max_usage_pct`.

### Hop

- Enum: `country_code`, `hop_form`, `category_birrf`, `producer`, `present_on_birrf`, `is_popular_in_russia`.
- Range: `alpha_acid_pct_typical`, `beta_acid_pct_typical`, `oil_ml_100g_typical`, `cohumulone_pct_typical`.
- Tag filter: `aroma_descriptors_en`.

### Fermentable

- Enum: `group`, `ingredient_type`, `fermentability_class`, `product_family`, `physical_form`, `base_material_family`, `hopping_state`, `functional_role`.
- Bool: `present_on_birrf`, `is_hopped_product`, `is_usable_in_beer_gravity_calculations`.
- Range: `extract_pct_dry_basis`, `color_lovibond`, `protein_pct`, `recommended_max_pct`.

### Yeast

- Enum: `form`, `yeast_family`, `brand`, `producer_country`, `birrf_category`, `source_basis`, `pof`, `flocculation`.
- Range: `attenuation_pct_typical`, `fermentation_temp_c_min/max`, `alcohol_tolerance_abv_typical`.

### Water treatment

- Enum: `item_kind`, `category`, `recommendation_level`, `calculation_support`, `common_in_homebrewing`, `common_in_pro_brewing`.
- Tag filter: `water_calc_role`, `recommended_for`.

### Consumable

- Enum: `item_kind`, `category`, `picker_group`, `subcategory`, `brand_family_mode`, `closure_standard`.
- Tag filter: `usage_stage`, `common_forms`.
- Inventory filter: `quantity_defaults.quantity_model`, `quantity_defaults.stock_mode_default`.

## Рекомендуемая модель карточек

- Общие поля для всех типов: `name_ru`, `name_en`, `type`, `aliases_ru`, `aliases_en`, источники.
- У malt/hop/fermentable/yeast карточка должна быть "характеристической": много чисел и диапазонов.
- У water_treatment карточка должна быть "функциональной": роль в воде, влияние на pH/ионы, рекомендации и предупреждения.
- У consumable карточка должна быть "складской": фасовки, единицы учёта, этап использования, функция, SKU-варианты.

## Критичные несовместимости, которые нужно учесть в коде

- Не везде одинаковый корень JSON: часть файлов это массив, часть объект с `items`.
- `present_on_birrf` и `is_birrf_present` уже сейчас несовместимы по имени.
- Страна хранится тремя разными способами: код, русское имя страны, английское имя страны производителя.
- У `consumable` и `water_treatment` много вложенных объектов с плавающими ключами; жёсткий flat-table DTO для них лучше не делать.
- `subcategory`, `family_key`, `search_priority_terms_*`, `recommended_for`, `notes` не подходят как основной UI enum первого уровня: это или semi-open taxonomy, или свободный текст.
