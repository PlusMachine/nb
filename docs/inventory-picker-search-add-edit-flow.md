# Поиск через picker в add/edit flow склада

Дата фиксации: `2026-04-06`

Документ описывает текущее поведение поиска ингредиентов через `IngredientPicker` в сценариях:

- add flow на `/app/ingredients`
- edit flow внутри `Редактировать ингредиент на складе`

Если этот документ и код расходятся, source of truth - текущая реализация в `apps/web`.

## Что именно покрыто

- как picker реально ищет сейчас
- какие фильтры и ограничения применяются в add/edit flow
- что выводится в строке результата поиска
- что выводится на карточке выбранного ингредиента в модалке
- что выводится на карточке ингредиента в списке склада
- какие заголовки, summary и labels видит пользователь
- какие поля реально приходят из seed JSON в БД и попадают в поиск/UI
- текущие ограничения каталога и сидов

## Основные файлы

- `apps/web/components/ingredients/ingredient-picker.tsx`
- `apps/web/components/inventory/add-ingredient-modal.tsx`
- `apps/web/components/inventory/catalog-ingredient-form.tsx`
- `apps/web/components/inventory/inventory-item-details-editor.tsx`
- `apps/web/components/inventory/inventory-list-item.tsx`
- `apps/web/components/inventory/inventory-ingredient-context-summary.tsx`
- `apps/web/features/ingredients/catalog-service.ts`
- `apps/web/features/ingredients/ranking.ts`
- `apps/web/features/ingredients/normalization.ts`
- `apps/web/features/ingredients/presentation.ts`
- `apps/web/features/inventory/page-model.ts`
- `packages/db/scripts/catalog-seed.ts`
- `ingredients/new/*.json`

## 1. Коротко: как это работает сейчас

- В add и edit используется один и тот же `IngredientPicker`.
- В add/edit flow picker почти всегда ищет внутри уже выбранной категории.
- Для fermentable дополнительно передается subtype:
  - `malt`
  - `fermentable`
- Поиск стартует только если picker открыт и введено минимум `2` символа.
- Перед запросом есть debounce `180ms`.
- Поиск идет не только по системному каталогу, но и по пользовательским ингредиентам.
- Даже на вкладке `Из каталога` можно выбрать existing custom ingredient.
- В add flow у catalog-picker есть быстрые scope-фильтры `Только избранные` и `Только свои`.
- При широкой выдаче результаты сначала схлопываются до `6` строк, хотя API обычно возвращает до `10`.
- Если совпадений много, picker предлагает `Уточнить производителя`.
- В add flow для catalog fermentable/hop можно уточнить batch-параметры:
  - fermentable: `Цвет`, `Экстрактивность`
  - hop: `Альфа-кислота`
- Если уточнение реально меняет catalog-значения, add flow уходит не в catalog source, а в derived custom ingredient.
- В edit flow такого ответвления нет: там можно только заменить reference и обновить поля складской карточки.

## 2. Общая механика поиска

### 2.1. Когда поиск вообще идет

Picker ищет только если одновременно выполнены условия:

- input открыт
- query после нормализации не пустой
- длина query после нормализации `>= 2`

Важно:

- если активирован refinement по производителю и поле пустое, picker продолжает искать внутри выбранного производителя
- если input открыт, но символов меньше двух, сетевого поиска нет

### 2.2. Какие параметры уходят в API

В `/api/ingredients/search` picker отправляет:

- `q`
- `category`
- `subtype` для `malt`/`fermentable`
- `manufacturer`, если выбран refinement
- `favoritesOnly`, если включен фильтр по избранному
- `customOnly`, если включен фильтр `Только свои`
- `limit`
- `includeCustom`

В add/edit flow сейчас это означает:

- `category` почти всегда задана
- `subtype` задан только для fermentable
- `type` обычно не используется
- `includeCustom` остается `true`

### 2.3. Что именно нормализуется в query

Перед ранжированием query проходит общую нормализацию:

- lower-case
- `ё -> е`
- пунктуация и разделители схлопываются
- лишние пробелы убираются

Дополнительно строятся query-варианты:

- family-equivalent варианты для нескольких групп:
  - `pils / pilsen / pilsner / пилс / пилснер / пильзнер ...`
  - `pale ale`
  - `munich / мюнхен`
  - `vienna / венский`
- смена раскладки клавиатуры
- транслитерация RU -> LAT
- транслитерация LAT -> RU

Следствие:

- `пильзнер`, `pils`, `pilsner` и часть ошибок раскладки могут сходиться в один search bucket
- это сильнее всего помогает fermentable/malt-поиску

### 2.4. По каким полям реально ищется

Общий search text строится из:

- `primaryLabelRu`
- `secondaryLabelRu`
- `displayName`
- `nameRu`
- `nameEn`
- `brand`
- `producer`
- `manufacturer`
- `productCode`
- `subtype`
- alias-ов
- названий и брендов package variants

Но важно смотреть на seed mapping по категории:

- не все поля из JSON реально попадают в БД
- не все категории вообще имеют aliases/package variants/brand в seeded DB rows

Из этого следуют реальные ограничения, описанные ниже по категориям.

### 2.5. Как ранжируются результаты

Ранжирование приоритетно тянет вверх:

- exact/prefix совпадения по имени
- family-equivalent совпадения для известных семейств
- alias matches
- code/package matches
- brand-aware matches
- token/distributed token matches
- слабый fuzzy fallback

Дополнительные бусты:

- `isFavorite`
- inventory usage count
- recipe usage count
- наличие нескольких источников/package variants

Tie-breakers:

- выше score
- favorite выше non-favorite
- custom выше catalog внутри одной semantic tier
- дальше по алфавиту

### 2.6. Широкая выдача и refinement по производителю

Picker переходит в refinement mode, если:

- `total > 10`
- есть refinements по manufacturer
- активный manufacturer еще не выбран

Что видит пользователь:

- header `Уточнить производителя`
- счетчик совпадений
- до `6` refinement chips по производителям

После выбора refinement:

- появляется chip `Производитель`
- placeholder меняется на `Искать внутри <producer>`
- поиск сужается до exact normalized manufacturer match

### 2.7. Пределы выдачи

- обычный request limit по умолчанию: `10`
- в UI при broad match сначала видны `6` строк
- `Показать все результаты` делает расширенный fetch
- верхний hard cap расширенного fetch: `100`

## 3. Add flow и edit flow: различия

## 3.1. Add flow

До выбора ингредиента пользователь видит:

- header `Добавить ингредиент`
- grid категорий
- switch `Из каталога / ДОБАВИТЬ СВОЙ`
- picker

После выбора ингредиента:

- grid категорий скрывается
- mode switch скрывается
- появляется context summary:
  - `Солод · Из каталога`
  - `Сбраживаемое сырье · Свой`
  - и т.д.
- появляется карточка выбранного ингредиента
- ниже открываются required inventory fields
- optional block остается свернутым

Если поиск пустой:

- в catalog-flow показывается CTA `Не нашли? Добавить свой ингредиент`
- эта кнопка не создает ingredient сразу
- она переводит пользователя в custom-flow, который теперь сразу открывает форму создания

## 3.2. Edit flow

Edit flow стартует уже с выбранным текущим ингредиентом.

Сразу видны:

- header `Редактировать ингредиент на складе`
- context summary в short style:
  - `Солод · Каталог`
  - `Хмель · Свой`
- карточка выбранного ингредиента
- required fields
- optional disclosure

Не видны, пока выбор не очищен:

- category grid
- picker

После `Заменить ингредиент`:

- текущий ingredient очищается
- снова появляется category grid
- появляется picker
- picker refocus-ится

Если поиск пустой:

- edit flow не предлагает перейти в custom create
- выводится только helper text:
  - `Не нашли подходящую позицию. Уточните запрос или оставьте текущий ингредиент без изменений.`

## 3.3. Самое важное различие правил каталога

- Add flow умеет fork в derived custom ingredient при batch-override.
- Edit flow не умеет batch-override catalog ingredient.
- Add flow на пустой выдаче переключает в custom tab.
- Edit flow на пустой выдаче не переключает flow, а только показывает helper text.

## 4. Что выводится в UI

### 4.1. Строка результата в picker

Каждая строка результата сейчас состоит из:

- `primaryName`
- optional `secondaryName`
- ownership badge для custom:
  - `СВОЙ`
  - `ИЗМЕНЕННЫЙ`
- optional inline brand только для:
  - hop
  - malt subtype
- favorite toggle справа
- нижняя meta-line:
  - country flag + country label, если есть
  - subtitle

`subtitle` строится как:

- brand/producer, если он не вынесен inline
- country удаляется из subtitle, если уже показан отдельно
- typed summary

Типичные section headers внутри picker:

- `Лучшие совпадения`
- `Результаты: <producer>`

Групповые category headers в списке результатов существуют, но в add/edit flow обычно не видны, потому что category filter уже задан.

### 4.2. Карточка выбранного ингредиента в модалке

И add flow, и edit flow рендерят `IngredientSelectionCard` с настройками:

- `hideTypedSummary = true`
- `hideSubtitle = true`
- `mergeBrandAndCountry = true`

Это означает:

- на карточке не показывается picker subtitle
- на карточке не показывается typed summary chip
- brand поднимается в top row
- country не печатается текстом, а остается только флагом рядом с brand

Что пользователь реально видит:

- label `Выбрано` в add flow
- context summary отдельной строкой над карточкой
- primary name
- optional secondary name
- ownership badge для custom item
- action:
  - `Изменить выбор` в add flow
  - `Заменить ингредиент` в edit flow

Дополнительно только в add flow для catalog fermentable/hop:

- block `Уточнить параметры`
- summary текущих batch values
- muted строка `В каталоге: ...`, если есть override
- status badge `ИЗМЕНЕННЫЙ`, если override реально меняет catalog values

### 4.3. Карточка на самом складе

Inventory card всегда показывает:

- title c link на catalog/custom detail page
- inline actions:
  - finish
  - edit
  - delete
- количество справа
- optional cost/date/freshness/purchase links/note

Category-specific meta на карточке склада строится уже не из picker subtitle, а из live/source technical data.

### 4.4. Заголовки и labels

В текущем UI есть несколько разных label-систем:

- category grid в add/edit:
  - `Солод`
  - `Сбраживаемое сырье`
  - `Хмель`
  - `Дрожжи`
  - `Водоподготовка`
  - `Расходники`
- context summary:
  - `Солод · Из каталога`
  - `Солод · Каталог`
  - `Хмель · Свой`
- групповые заголовки списка склада:
  - `СОЛОД`
  - `СБРАЖИВАЕМОЕ СЫРЬЕ`
  - `ХМЕЛЬ`
  - `ДРОЖЖИ`
  - `ВОДОПОДГОТОВКА`
  - `РАСХОДНИКИ`
- generic category label в picker group headers вне add/edit:
  - `Ферментируемые`
  - `Хмель`
  - `Дрожжи`
  - `Водоподготовка`
  - `Расходники`

Главный нюанс:

- для fermentable в inventory/add/edit UI почти везде используются subtype-aware labels `Солод` и `Сбраживаемое сырье`
- а generic ingredient category label остается `Ферментируемые`

## 5. Поведение по категориям

## 5.1. Солод

### Как ищется сейчас

Для seeded malt в поиск реально попадают:

- `name_ru`
- `name_en`
- `brand`
- aliases из `aliases_ru`
- aliases из `aliases_en`
- aliases из `brand_aliases`
- subtype `malt`

Из JSON это сохраняется через `prepareMalt(...)` в:

- `ingredients.nameRu`
- `ingredients.nameEn`
- `ingredients.brand`
- `ingredientAliases`

### Что выводится в picker

Обычно:

- primary name:
  - для локальных RU/BY/UA/KZ malt - чаще RU-first
  - для foreign malt - чаще source-first
- secondary name
- brand часто вынесен inline в top row
- country показывается отдельно флагом/label
- subtitle обычно:
  - `<color EBC> • Экстракт <pct>%`

Пример типового результата:

- `Pilsener`
- secondary: `Пильзнер`
- inline brand: `Avangard Malz`
- country: `DE`
- subtitle: `4.3 EBC • Экстракт 80%`

### Что выводится на карточке выбранного ингредиента в модалке

- primary/secondary name
- brand в top row
- только flag без текстовой страны
- без subtitle
- без typed summary

Только для catalog malt в add flow дополнительно есть block:

- `Цвет`
- `Экстрактивность`
- `Уточнить параметры`

### Что выводится на карточке склада

Для malt card сейчас характерно:

- brand inline в title line
- country flag inline с title
- badges:
  - `X EBC` или диапазон
  - `Экстракт X%`
  - `до X % засыпи`, если есть `maxUsagePct`

### Текущие правила/ограничения

- brand хорошо участвует и в поиске, и в UI
- aliases из `brand_aliases` реально searchable
- для foreign malt seed чаще уходит в `source_first`, поэтому primary name может быть EN-first

### Примеры seed JSON

```json
[
  {
    "id": "avangard-malz-pilsener-de-base",
    "name_ru": "Пильзнер",
    "name_en": "Pilsener",
    "brand": "Avangard Malz",
    "country_code": "DE",
    "color_ebc_min": 4.318,
    "color_ebc_max": 4.318,
    "extract_pct_dry_basis": 80
  },
  {
    "id": "beerex-pilsner-cz-base",
    "name_ru": "Пильзнер",
    "name_en": "Pilsner",
    "brand": "Beerex",
    "country_code": "CZ",
    "color_ebc_min": 5.334,
    "color_ebc_max": 5.334,
    "extract_pct_dry_basis": 80.5
  }
]
```

## 5.2. Сбраживаемое сырье

### Как ищется сейчас

Для seeded non-malt fermentable в поиск реально попадают:

- `name_ru`
- `name_en`
- subtype `fermentable`

Также попадают в DTO/summary:

- `country_name`
- `extract_pct_dry_basis`
- `color_lovibond`
- `recommended_max_pct`

Но важное текущее ограничение:

- `prepareFermentable(...)` сейчас не сохраняет `aliases_ru`
- `prepareFermentable(...)` сейчас не сохраняет `aliases_en`
- `prepareFermentable(...)` сейчас не сохраняет `producer`

Следствие:

- producer из JSON не виден ни в picker row, ни в inventory card
- alias-поиск по сырью сейчас беднее, чем raw JSON dataset

### Что выводится в picker

Обычно:

- primary/secondary name
- country
- subtitle:
  - `<color EBC> • Экстракт <pct>%`

Так как producer не seeded в searchable/display columns:

- brand/producer в строке результата обычно отсутствует

### Что выводится на карточке выбранного ингредиента в модалке

- primary/secondary name
- обычно без brand line
- flag/страна возможны, если есть country
- для catalog fermentable в add flow есть `Уточнить параметры`

### Что выводится на карточке склада

Для fermentable card сейчас характерно:

- brand inline мог бы показываться, но для seeded non-malt fermentable чаще его нет
- country может быть
- badges:
  - `<color EBC>`
  - `Экстракт X%`
  - `До X%`, если есть `recommendedMaxPct`

### Текущие правила/ограничения

- это самая заметная категория, где dataset богаче текущего seeded DB representation
- aliases и producer в исходных JSON уже есть, но в текущую БД/поиск не доходят

### Примеры seed JSON

```json
[
  {
    "id": "buckwheat-nesolozhenka",
    "name_ru": "Гречка (неосоложенная)",
    "name_en": "Buckwheat",
    "country_name": "Россия",
    "aliases_ru": ["Гречка"],
    "aliases_en": ["raw buckwheat"],
    "extract_pct_dry_basis": 60,
    "color_lovibond": 4,
    "recommended_max_pct": 50
  },
  {
    "id": "kompaniya-uvelka-ooo-resurs-buckwheat-flakes-nesolozhenka",
    "name_ru": "Гречневые хлопья",
    "name_en": "buckwheat flakes",
    "producer": "Компания «Увелка» ООО «Ресурс»",
    "country_name": "Россия",
    "extract_pct_dry_basis": 78,
    "color_lovibond": 4,
    "recommended_max_pct": 30
  }
]
```

## 5.3. Хмель

### Как ищется сейчас

Для seeded hop в поиск реально попадают:

- `name_ru`
- `name_en`
- `producer`
- aliases из `aliases_ru`
- aliases из `aliases_en`
- aliases из `producer_aliases`
- subtype `hop`

Также searchable важны:

- code-like tokens внутри названия
- типовые brand-first queries

### Что выводится в picker

Для hop brand/producer почти всегда поднимается inline в primary row.

Обычно строка выглядит так:

- primary name
- ownership badge, если custom
- inline producer
- country flag/label
- subtitle:
  - `<alpha>% AA`
  - form добавляется только если `hopForm !== standard`

Пример типового результата:

- `Azacca`
- inline producer: `ADHA`
- country: `US`
- subtitle: `15% AA`

### Что выводится на карточке выбранного ингредиента в модалке

- top row: primary name + producer + flag
- без subtitle
- без typed summary
- для catalog hop в add flow есть:
  - `Альфа-кислота`
  - `Уточнить параметры`

### Что выводится на карточке склада

Для hop card сейчас характерно:

- title
- producer отдельной строкой под title
- country flag на brand line
- badges:
  - `Альфа X%`
  - form
  - `Урожай <year>`, если есть

### Текущие правила/ограничения

- hop producer участвует и в ranking, и в refinement
- refinement по manufacturer для hop работает особенно заметно
- `standard` hop form в picker subtitle скрывается, но на inventory badge может присутствовать как plain text

### Примеры seed JSON

```json
[
  {
    "id": "us-azacca-standard",
    "name_ru": "Азакка",
    "name_en": "Azacca",
    "producer": "ADHA",
    "country_code": "US",
    "alpha_acid_pct_typical": 15,
    "hop_form": "standard",
    "aliases_en": ["Azacca ADHA 483"]
  },
  {
    "id": "cz-agnus-standard",
    "name_ru": "Агнус",
    "name_en": "Agnus",
    "producer": "Joh.Barth&Sohn",
    "country_code": "CZ",
    "alpha_acid_pct_typical": 13,
    "hop_form": "standard"
  }
]
```

## 5.4. Дрожжи

### Как ищется сейчас

Для seeded yeast в поиск реально попадают:

- `name_ru`
- `name_en`
- `brand`
- `product_code`
- aliases из `aliases_ru`
- aliases из `aliases_en`
- subtype `yeast`

Дополнительно yeast хорошо ловится по:

- product code вроде `BF27`, `US-05`, `AL 101`
- brand + code query
- alias query

### Что выводится в picker

Для yeast brand не поднимается inline в picker row.

Обычно:

- primary/secondary name
- country
- subtitle:
  - brand
  - form
  - attenuation
  - temp range

Пример типового результата:

- `BF27 Lager`
- secondary: может совпадать и тогда не показываться
- country: `China`
- subtitle: `Angel Yeast • dry • 82% attenuation • 9-20C`

### Что выводится на карточке выбранного ингредиента в модалке

В modal card brand уже поднимается наверх, потому что `mergeBrandAndCountry = true`.

То есть пользователь видит:

- primary name
- brand в top row
- flag страны
- без picker subtitle

### Что выводится на карточке склада

Для yeast card сейчас характерно:

- brand inline в title line
- country flag inline с title
- badges:
  - form
  - `Атт. X%`
  - `<min>-<max>°C`

### Текущие правила/ограничения

- yeast очень хорошо ищется по code-specific intent
- для локальных RU/BY/UA/KZ yeast с `name_ru` seed может уходить в localized-first
- для foreign yeast primary чаще source-first

### Примеры seed JSON

```json
[
  {
    "id": "angel-yeast-bf27",
    "brand": "Angel Yeast",
    "product_code": "BF27",
    "name_ru": "BF27 Lager",
    "name_en": "BF27 Lager",
    "producer_country": "China",
    "form": "dry",
    "attenuation_pct_typical": 82,
    "fermentation_temp_c_min": 9,
    "fermentation_temp_c_max": 20,
    "aliases_ru": ["Angel BF27", "Ангел BF27", "аналог 34/70"]
  },
  {
    "id": "asp-lab-al-101-kveik-i",
    "brand": "ASP Lab",
    "product_code": "AL 101",
    "name_ru": "Квейк I",
    "name_en": "Kveik I",
    "producer_country": "Russia",
    "form": "liquid",
    "attenuation_pct_typical": 74,
    "fermentation_temp_c_min": 20,
    "fermentation_temp_c_max": 40
  }
]
```

## 5.5. Водоподготовка

### Как ищется сейчас

Для seeded water treatment в поиск реально попадают:

- `name_ru`
- `name_en`
- aliases из `aliases_ru`
- aliases из `aliases_en`
- subtype, если он смог выводиться из `item_kind`

В БД реально пишутся:

- `formula`
- `unit_preferred`
- `item_kind`
- `category`
- water-specific technical attrs

### Что выводится в picker

Обычно:

- primary/secondary name
- brand/country чаще отсутствуют
- subtitle:
  - `<subtype label> • <unit_preferred>`
  - либо просто `<unit_preferred>`, если subtype малоинформативен

Текущее ограничение:

- многие записи имеют `item_kind = chemical`
- этот `item_kind` сейчас нормализуется в subtype `other`
- поэтому часть picker summary выглядит как слишком общий `другое • mg`

### Что выводится на карточке выбранного ингредиента в модалке

- primary/secondary
- чаще без brand/country
- без subtitle

### Что выводится на карточке склада

Особенности water card:

- если есть `formula`, она показывается перед title
- category-specific badge:
  - показывается `unitPreferred`, но только если это не `g` и не `ml`
- из-за этого:
  - `L` и `mg` обычно видны
  - `g` часто скрыт

### Текущие правила/ограничения

- search по alias-ам для water работает хорошо
- subtype derivation по `chemical` сейчас слабая и часто сводит summary к `другое`

### Примеры seed JSON

```json
[
  {
    "id": "reverse-osmosis-water",
    "item_kind": "water_source",
    "category": "dilution_water",
    "name_ru": "Вода после обратного осмоса",
    "name_en": "Reverse Osmosis Water",
    "unit_preferred": "L",
    "aliases_ru": ["RO вода", "осмос", "обратный осмос"],
    "aliases_en": ["RO Water", "RO"]
  },
  {
    "id": "ascorbic-acid",
    "item_kind": "chemical",
    "category": "dechlorination_agent",
    "name_ru": "Аскорбиновая кислота",
    "name_en": "Ascorbic Acid",
    "formula": "C6H8O6",
    "unit_preferred": "mg",
    "aliases_ru": ["витамин C", "аскорбинка"],
    "aliases_en": ["Vitamin C"]
  }
]
```

## 5.6. Расходники

### Как ищется сейчас

Для seeded consumable в поиск реально попадают:

- `name_ru`
- `name_en`
- aliases из `aliases_ru`
- aliases из `aliases_en`
- package variant brand
- package variant product name
- subtype из `item_kind`

Это единственная категория, где package variants особенно важны для search recall.

### Что выводится в picker

Обычно:

- primary/secondary name
- brand/country на top level чаще отсутствуют
- subtitle:
  - `<subtype label> • <commonForms[0]>`

Но важный текущий нюанс:

- если match произошел по package variant brand/product name
- picker row все равно показывает сам ingredient item
- matched package variant name отдельно в UI не печатается

То есть запрос по `Vicant SB` может найти запись, но строка будет называться:

- `Антиоксидант для готового пива`

а не названием package variant.

### Что выводится на карточке выбранного ингредиента в модалке

- primary/secondary
- без package variant details
- без subtitle

### Что выводится на карточке склада

Для consumable card сейчас характерно:

- чаще без top-level brand/country
- badges:
  - `commonForms[0]`
  - `usageStage[0]`

Package variants в inventory card напрямую не раскрываются.

### Текущие правила/ограничения

- package variant search есть
- package variant display в picker row нет
- top-level brand для consumable из seed обычно не хранится в ingredient row, а лежит в package variants

### Примеры seed JSON

```json
[
  {
    "id": "antioxidant-finished-beer",
    "item_kind": "process_aid",
    "category": "antioxidant",
    "name_ru": "Антиоксидант для готового пива",
    "name_en": "Finished Beer Antioxidant",
    "aliases_ru": ["vicant sb", "антиоксидант для пива"],
    "aliases_en": ["Vicant SB"],
    "common_forms": ["powder"],
    "usage_stage": ["packaging", "finished_beer"],
    "package_variants": [
      {
        "id": "vicant-sb-10g",
        "brand": "Lallemand",
        "product_name_ru": "Антиокислитель для пива Vicant SB"
      }
    ]
  },
  {
    "id": "antioxidant-brewtan-b",
    "item_kind": "process_aid",
    "category": "antioxidant",
    "name_ru": "Brewtan B / галлотанин для стабилизации",
    "name_en": "Brewtan B",
    "aliases_ru": ["брютан б", "brewtan b"],
    "aliases_en": ["Brewtan B"],
    "common_forms": ["powder"],
    "usage_stage": ["mash", "boil"],
    "package_variants": [
      {
        "id": "brewtan-b-50g",
        "brand": "Ajinomoto Omnichem N. V.",
        "product_name_ru": "Стабилизатор Брютан Б / Brewtan B"
      }
    ]
  }
]
```

## 6. Существующие правила работы с каталогом в add/edit flow

### 6.1. Категория обязательна до поиска

- Пока category не выбрана, picker form не появляется.
- Для fermentable category всегда раскладывается на:
  - `fermentable + malt`
  - `fermentable + fermentable`

### 6.2. Catalog-tab не равен catalog-only

Это важное текущее правило:

- picker в catalog flow ищет и `catalog`, и `custom`
- existing custom ingredients участвуют в выдаче наравне с catalog
- custom row маркируется badge:
  - `СВОЙ`
  - `ИЗМЕНЕННЫЙ`

Следствие:

- пользователь может на вкладке `Из каталога` выбрать свой ingredient
- submit path потом корректно уйдет в custom inventory source

### 6.3. После выбора ingredient flow “фиксируется”

И в add, и в edit:

- picker stage скрывается
- selection становится текущим context
- required inventory block появляется только после selection
- optional state при очистке selection сбрасывается

### 6.4. Смена категории ведет себя по-разному для draft query и готового selection

Если ingredient еще не выбран:

- typed query сохраняется
- picker refocus-ится
- поиск продолжается уже в новой category/subtype

Если ingredient уже выбран:

- selection очищается
- picker value очищается
- optional state и связанные derived/override state очищаются

### 6.5. Add flow может создать derived custom ingredient

Только для catalog fermentable/hop:

- если override не меняет фактическое значение каталога, сохраняется обычный catalog source
- если override меняет значение, создается или переиспользуется derived custom ingredient
- catalog source при этом не мутируется

### 6.6. Edit flow derived path не использует

В edit flow:

- нет блока batch overrides
- нет derived variant logic
- edit просто перепривязывает inventory row к `ingredientCatalogItemId` или `userCustomIngredientId`

### 6.7. Purchase links принадлежат ingredient reference, а не inventory row

Это общее правило add/edit:

- количество, цена, даты, заметка живут на inventory item
- purchase links живут на ingredient reference
- reference может быть:
  - `catalog`
  - `custom`

Следствие:

- при add/edit изменение purchase links влияет на выбранный ingredient reference
- это не per-row inventory metadata

## 7. Практические выводы для дальнейших изменений

Если менять picker/search дальше, самые чувствительные места сейчас такие:

- `fermentable` seed mapping теряет aliases и producer
- `water_treatment` subtype derivation для `chemical` слишком общая
- `consumable` ищется по package variants, но не показывает matched package variant в UI
- catalog tab уже фактически unified picker, и любое “catalog-only” изменение надо делать осознанно
- add flow и edit flow используют один search/runtime, но разную empty-state и post-selection логику
