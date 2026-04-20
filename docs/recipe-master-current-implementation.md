# Мастер рецептов: текущее состояние

Дата актуализации: 2026-04-18.

Документ описывает фактическое состояние мастера рецептов после pass `Recipe Master UX Simplification + Water/Equipment Fix`. Основная цель текущего UI: быстро собрать базовый рецепт, а воду, оборудование, импорт, старт варки и тонкие расчетные настройки держать в компактных secondary flows.

## 1. Точки входа

- `/app/recipes` — список рецептов пользователя.
- `/app/recipes/new` — создание рецепта.
- `/app/recipes/[id]/edit` — редактирование рецепта.
- `/app/recipes/[id]` — legacy route, редиректит на `/app/recipes/[id]/edit`.
- `/app/equipment` — профили оборудования.
- `/recipes/[slug]` — публичная страница опубликованного рецепта.

Основной UI мастера находится в `apps/web/components/recipes/recipe-designer.tsx`.

Вспомогательные компоненты текущего UX:

- `recipe-actions-menu.tsx` — компактные header actions: импорт/экспорт и старт варки.
- `bitterness-settings-drawer.tsx` — настройки расчета IBU из кнопки рядом с IBU.
- `water-setup-wizard.tsx` и `water-summary-card.tsx` — guided flow по воде.
- `ingredient-add-drawer.tsx`, `stock-ingredient-list.tsx` — drawer добавления ингредиента и список склада.
- `stock-coverage-summary.tsx` — компактная сводка покрытия складом.
- `import-export-modal.tsx` — modal wizard для BeerXML/Brewfather import/export.
- `start-brew-modal.tsx` — modal flow для создания партии.
- `components/equipment/*` — basic/advanced form и summary для `/app/equipment`.

## 2. Состояние PR-плана

PR1 реализован:

- DB-поля v1.5 в `recipes` и `recipe_ingredients`;
- stable `recipe_ingredients.persistentKey`;
- `syncRecipeIngredients()` вместо delete-all/insert-all;
- `equipment_profiles`;
- выбор профиля оборудования в мастере;
- практическое масштабирование рецепта под выбранный профиль.

PR2 реализован:

- `tinseth_whirlpool_v2` как default;
- `tinseth_classic`, `rager`, `garetz`, `noonan_legacy`;
- gravity at time of addition;
- whirlpool/hopstand IBU через temperature factor;
- optional late hop carryover;
- dry hop не входит в standard IBU total;
- first wort hop modes;
- equipment `hopUtilizationFactor`.

PR3 частично реализован и UX упрощен:

- `profile_only`, `balanced_default`, `advanced_manual`;
- `kolbach_ra_quick`, `hybrid_mash_ph_v1`;
- salt contribution через mass fractions;
- target-profile salt solver;
- mash pH estimate at 20C;
- mash acid estimate;
- отдельный UI-подшаг для sparge acidification;
- built-in source/target presets.

Ограничение PR3: это practical calculator, не лабораторный acid-base simulator. Автоматическое зеркалирование salt/acid additions в `recipe_ingredients` пока сведено к сохранению preference `showWaterAdditivesInIngredients`; полноценное создание line items требует надежного source ingredient mapping.

PR4 реализован:

- source modes в add-ingredient flow: `Из склада`, `Из каталога`, `Создать свой`;
- stock suggestions через inventory runtime;
- allocations/reserve/consume/release;
- confirmed consume пишет `inventory_transactions`;
- autosave не списывает склад.

PR5 реализован как modal wizard:

- BeerXML export с доступными recipe stats, ingredient technical fields и mash steps;
- BeerXML import;
- Brewfather JSON import с тестовой поддержкой;
- canonical import mapping на сервисном уровне;
- импортированные ингредиенты сначала сохраняются как recipe-local snapshot, а не как пользовательские custom ingredients;
- импорт технических полей ingredients: fermentable color/yield, hop alpha/form, yeast attenuation/form;
- импорт BeerXML/Brewfather mash steps в `processMeta.mashProfile`;
- BeerXML/Brewfather `MISC` попадает в consumable/water treatment taxonomy.

Ограничение PR5: отдельного import report screen пока нет.

PR6 реализован как пользовательское действие `Начать варку`:

- создание `brew_batches`;
- сохранение brew plan data при создании batch;
- опция списать ингредиенты перед созданием batch.

Ограничение PR6: пошаговый brew session экран и live device control еще не реализованы.

## 3. Информационная архитектура страницы рецепта

Основная визуальная ось теперь такая:

1. Header:
   - название рецепта;
   - стиль BJCP;
   - публикация;
   - версия для существующего рецепта;
   - compact actions `Импорт / экспорт` и `Начать варку`;
   - save status отображается wrapper-компонентом страницы.
2. Batch summary и live preview:
   - объем;
   - эффективность;
   - кипячение;
   - OG;
   - FG;
   - ABV;
   - IBU;
   - цвет;
   - fit по стилю, если выбран BJCP style.
3. Core recipe sections:
   - `Сбраживаемое`;
   - `Хмель`;
   - `Дрожжи`;
   - `Прочее / расходники`.
4. Process profiles:
   - `Mash Profile`;
   - `Fermentation Profile`.
5. Advanced lower area:
   - `Вода`;
   - `Оборудование`;
   - `Покрытие складом`.
6. Bottom content:
   - `Описание рецепта`;
   - `Личные заметки`.

С основной оси убраны крупные блоки:

- `Расчет горечи`;
- textarea-блок import/export;
- отдельный блок brew mode;
- отдельная крупная секция `Водоподготовка` как равноправная ingredient section.

## 4. Header и autosave flow

Header содержит title input, BJCP style picker, publication controls и actions menu.

Autosave flow:

1. Любое изменение state меняет `currentSignature`.
2. Через debounce 1500 мс вызывается `persistRecipe()`.
3. Для нового рецепта вызывается `createRecipeAction()`.
4. Для существующего рецепта вызывается `updateRecipeAction()`.
5. После первого create заполняется `activeRecipeId`.
6. Для `/app/recipes/new` URL получает `?recipeId={id}`, а серверная перезагрузка редиректит на edit route.

Live preview flow:

1. Через debounce 400 мс вызывается `previewRecipeDraftAction(savePayload)`.
2. Preview обновляет OG/FG/ABV/IBU/color/style fit независимо от autosave.
3. FG в preview считается как прогноз, но в normal state подается спокойно: helper только когда расчета нет, `Прогноз по умолчанию` только для fallback-сценария без usable yeast attenuation, короткие ручные подписи только для override-режимов.
4. Если выбран BJCP style, preview показывает `В стиле` или `Отклонения`.

Publication flow:

1. `Опубликовать` видна только для уже созданного private recipe.
2. Если checklist не готов, открывается readiness dialog.
3. Если checklist готов, открывается confirm dialog.
4. Confirm сохраняет recipe с `publicationState = "published"`.
5. `Сделать приватным` работает через отдельный confirm.

Checklist для публикации:

- title;
- BJCP style;
- description;
- fermentable;
- hop;
- yeast;
- positive boil time.

## 5. Batch summary и live preview

Левый блок `Параметры партии` показывает:

- цвет;
- OG;
- FG;
- IBU;
- ABV;
- стиль;
- под FG — только мягкий helper/label в реально важных состояниях (`Добавьте сбраживаемое`, `Прогноз по умолчанию`, `Ручная attenuation`, `Ручной FG`);
- advanced controls FG открываются только по маленькой шестеренке / info icon внутри карточки FG и не меняют высоту шапки;
- поля объема, эффективности и времени кипячения.

Продуктовый принцип для FG:

`FG должен оставаться обычным расчетным показателем, а не отдельным центром внимания. Подробности расчета и ручные коррекции открываются только по запросу.`

Правый блок `Расчёт показателей` показывает треки по:

- OG;
- FG;
- ABV;
- IBU;
- Color.

Рядом с IBU есть маленькая кнопка `⚙`. Она открывает drawer `Настройки расчета горечи`.

## 6. Настройки горечи

Большого блока `Расчет горечи` в основной оси нет.

Drawer открывается по кнопке рядом с IBU и показывает:

- `Формула IBU`;
- `Учитывать whirlpool`;
- `Учитывать carryover позднего хмеля`;
- `FWH mode`;
- пояснение, что dry hop не входит в standard IBU total.

Default:

- formula: `tinseth_whirlpool_v2`;
- whirlpool учитывается;
- late hop carryover включен;
- FWH mode: `bonus_10pct`.

Расчетные возможности в core:

- Tinseth classic;
- Tinseth + whirlpool v2;
- Rager;
- Garetz;
- Noonan legacy;
- gravity at time of addition;
- kettle gravity curve от equipment volumes;
- whirlpool temperature factor;
- equipment hop utilization factor.

## 7. Core ingredient flow

На основной странице показываются только ключевые секции:

- `Сбраживаемое`;
- `Хмель`;
- `Дрожжи`;
- `Прочее / расходники`.

Хмель внутри секции группируется по use type:

- boil;
- first wort hop;
- whirlpool/hopstand;
- dry hop;
- dip hop;
- other.

Add flow:

1. Пользователь нажимает `+ Добавить` в нужной секции.
2. Открывается drawer позиции.
3. Вверху drawer пользователь выбирает путь:
   - `Из склада`;
   - `Из каталога`;
   - `Создать свой`.
4. Для `Из склада` сначала показывается предзагруженный список подходящих stock positions по категории.
5. Search в stock mode остается вторичным уточнением.
6. Для `Из каталога` используется общий ingredient picker/search runtime.
7. Для `Создать свой` используется создание custom ingredient через recipe action.

При выборе позиции со склада:

- `inventoryIntentMode = "use_stock"`;
- `inventorySelectionMeta.inventoryItemId` сохраняет source stock item;
- autosave сохраняет только recipe line;
- списания склада не происходит.

Позиция валидна, когда выбран catalog/custom source и количество больше нуля. Для импортированных строк допустим третий режим: `inventoryIntentMode = "imported"`, оба source id пустые, а исходный ингредиент хранится в snapshot внутри `externalImportMeta.importedIngredient`.

Импортированная строка в списке ингредиентов показывает бейдж `Импортировано` и два действия:

- `Сохранить как свой` — создает пользовательский custom ingredient из snapshot и сразу привязывает строку к нему;
- `Подобрать из каталога` — открывает обычный picker, чтобы заменить snapshot на catalog/custom source.

Секция `Прочее / расходники` используется для misc/process additions:

- фининги;
- нутриенты;
- таблетки;
- прочие process aids.

Секция `Водоподготовка` не возвращается как отдельный равноправный блок. Водные соли и кислоты остаются внутри блока `Вода`, а recipe line mirroring включается отдельным preference.

## 8. Вода: guided flow

Отдельной крупной ingredient-секции `Водоподготовка` больше нет. Вода находится в одном блоке `Вода` ниже process profiles.

Свернутый summary:

- если вода не настроена: `Водоподготовка не настроена`;
- если настроена: `Затор X л • промывка Y л • pH ~Z • добавки рассчитаны`.

Flow внутри блока:

1. `Настроить водоподготовку?`
   - `Пока нет`;
   - `Да, настроить`.
2. `Какая у вас исходная вода?`
   - RO / Дистиллят;
   - Pilsen;
   - Dublin;
   - Munich;
   - manual entry.
3. `Какой результат нужен?`
   - Balanced;
   - Light & Malty;
   - Light & Hoppy;
   - По стилю;
   - Вручную.
4. `Примерные рекомендации по воде`
   - вода в затор;
   - вода в промывку;
   - соли в затор;
   - соли в промывку;
   - кислота в затор;
   - примерный расчет pH;
   - итоговый профиль;
   - SO4:Cl ratio;
   - warnings.
5. `Показать расширенные настройки`
   - схема расчета;
   - модель pH;
   - acid type;
   - acid concentration;
   - toggle `Показывать добавки воды в списке ингредиентов`;
   - manual salt additions;
   - advanced salts.

UI copy объясняет:

- зачем нужна кислота;
- что кислоту для затора добавляют в mash water;
- что кислоту для промывки добавляют отдельно в sparge water;
- что SO4:Cl больше в сторону SO4 обычно суше/хмелевее, а больше в сторону Cl мягче/солодовее.

### Sparge acidification

Внутри результата есть отдельный подшаг `Подкисление промывочной воды`.

Поля:

- включено/выключено;
- исходный pH воды;
- целевой pH промывочной воды;
- рассчитанный объем кислоты.

Результат считается через practical acid solver в `buildRecipeWaterPlanResult()`.

### Built-in profiles

Ion order: Ca / Mg / Na / Cl / SO4 / HCO3.

Source examples:

- RO / Дистиллят = 0 / 0 / 0 / 0 / 0 / 0;
- Pilsen = 7 / 3 / 2 / 5 / 5 / 25;
- Dublin = 110 / 4 / 12 / 19 / 53 / 280;
- Munich = 82 / 20 / 4 / 2 / 16 / 320.

Target profiles:

- Balanced = 80 / 5 / 25 / 75 / 80 / 100;
- Light & Malty = 60 / 5 / 10 / 95 / 55 / 0;
- Light & Hoppy = 75 / 5 / 10 / 50 / 150 / 0.

City-based presets помечены как примерные исторические профили и не заменяют анализ воды пользователя.

## 9. Оборудование

### В мастере рецептов

Блок `Оборудование` находится ниже воды и свернут по умолчанию.

Свернутый summary:

- если профиль не выбран: `Профиль по умолчанию`;
- если профиль выбран: `{name} • {volume} л в ферментер • {efficiency}% • испарение {evaporation} л/ч`.

Действия:

- `Выбрать профиль`;
- `Обновить из профиля`;
- `Использовать профиль по умолчанию`;
- `Изменить`;
- `Масштабировать рецепт`.

Summary внутри блока показывает:

- метод;
- целевой объем;
- pre-boil hot;
- post-boil hot;
- mash / sparge water;
- калибровку хмеля;
- warning, если используется профиль по умолчанию;
- warning, если pre-boil volume превышает kettle limit.

Изменение профиля на `/app/equipment` не меняет существующий рецепт автоматически. Пользователь явно обновляет профиль в мастере.

### `/app/equipment`

Страница профилей оборудования больше не показывает все поля одним полотном.

Basic mode показывает:

- название;
- метод варки;
- целевой объем;
- объем партии;
- время кипячения;
- эффективность;
- испарение в час;
- потери в котле / на чиллере;
- grain absorption;
- метод расчета воды;
- mash thickness.

Derived summary показывает:

- pre-boil;
- post-boil;
- total water;
- mash water;
- sparge water;
- предупреждения по vessel limits.

Advanced mode открыт только через `Расширенные параметры` и содержит:

- mash efficiency;
- fermenter loss;
- mash tun dead space;
- sparge dead space;
- cooling shrinkage;
- top-up water;
- max mash volume;
- max kettle volume;
- hop utilization factor;
- altitude;
- notes.

Starter BIAB defaults:

- `brewhouseEfficiencyPct = 68`;
- `grainAbsorptionLPerKg = 0.70`;
- `mashTunDeadspaceL = 0`;
- no sparge behavior через `biab_single_vessel`.

## 10. Склад

Большой отдельный блок склада убран из середины страницы.

Склад встроен в add-ingredient flow:

1. Пользователь нажимает `+ Добавить`.
2. В drawer выбирает `Из склада`.
3. Сразу видит список подходящих stock positions.
4. Может уточнить поиск.
5. Выбирает позицию.
6. Recipe line получает stock selection metadata.

Ниже advanced area есть компактный summary `Покрытие складом`.

Он показывает:

- сколько ингредиентов связано со складом;
- хватает ли на варку;
- сколько позиций не хватает, если есть shortage.

Действия:

- `Проверить покрытие`;
- `Списать на варку`.

Принцип не изменился:

- autosave рецепта не списывает склад;
- confirmed consume выполняется только по явному действию;
- consume пишет `inventory_transactions` и уменьшает normalized stock quantity.

## 11. Импорт / экспорт

Textarea-блок больше не находится в основной оси страницы.

Header action `Импорт / экспорт` открывает modal wizard.

Import flow:

1. `Что хотите сделать?` -> `Импортировать рецепт`.
2. `Формат` -> `BeerXML` или `Импорт из Brewfather (тестовая поддержка)`.
3. Пользователь вставляет текст или загружает файл.
4. Нажимает `Импортировать`.
5. Action создает private recipe.
6. UI редиректит на edit page нового recipe.

Import mapping:

- BeerXML `<FERMENTABLE><COLOR>` конвертируется из Lovibond в EBC;
- BeerXML `<FERMENTABLE><YIELD>` сохраняется как extract yield;
- BeerXML/Brewfather hop `ALPHA`/`alpha` сохраняется как hop AA%;
- BeerXML/Brewfather hop form (`Pellet`, `Leaf`, `Cryo` и т.п.) сохраняется в snapshot technical data;
- BeerXML/Brewfather yeast attenuation/form сохраняются в snapshot technical data;
- BeerXML `<MASH_STEP>` и Brewfather `mash.steps` попадают в `processMeta.mashProfile.steps`;
- BeerXML `IBU_METHOD` сохраняется в `calculationMeta.bitternessFormula`, а если method отсутствует, используется `tinseth_whirlpool_v2`;
- imported recipe stats из файла сохраняются в `importMeta.importedStats` для аудита.

Import service больше не создает custom ingredients автоматически. Каждая импортированная строка рецепта сохраняется как recipe-local snapshot:

- `ingredientCatalogItemId = null`;
- `userCustomIngredientId = null`;
- `inventoryIntentMode = "imported"`;
- `externalImportMeta.importedIngredient` содержит имя, taxonomy, default unit, allowed units, measurement dimension и technical data.

Alpha acid, цвет, экстрактивность, yeast attenuation/form и формы misc/water treatment сохраняются в snapshot technical data и участвуют в расчете рецепта. Они не добавляются в имя ингредиента. Перенос в `СВОИ` или подбор аналога из каталога выполняется только явным действием пользователя на карточке импортированной строки.

Export flow:

1. `Что хотите сделать?` -> `Экспортировать рецепт`.
2. Формат: BeerXML.
3. Пользователь нажимает `Подготовить BeerXML`.
4. UI сначала сохраняет текущий рецепт.
5. Export result появляется в одном textarea.
6. Доступны `Копировать` и `Скачать`.

Export mapping:

- recipe-level BeerXML поля получают доступные `OG`, `FG`, `IBU`, `IBU_METHOD`, `COLOR`, `ABV`, `BATCH_SIZE`, `BOIL_TIME`, `EFFICIENCY`, `TYPE`, `NOTES`;
- если у рецепта есть equipment profile snapshot, `BOIL_SIZE` рассчитывается как pre-boil hot volume по текущей volume ladder;
- fermentables экспортируются в `FERMENTABLES` с `TYPE`, `AMOUNT` в кг, `YIELD`, `COLOR` в Lovibond и `ADD_AFTER_BOIL`;
- hops экспортируются в `HOPS` с `ALPHA`, `AMOUNT` в кг, `USE`, `TIME` и `FORM`;
- yeast экспортируется в `YEASTS` с `FORM`, `AMOUNT`, `AMOUNT_IS_WEIGHT` и `ATTENUATION`;
- consumables и water treatment line items экспортируются в `MISCS` с `TYPE`, `USE`, `TIME`, `AMOUNT` и `AMOUNT_IS_WEIGHT`;
- mash steps из `processMeta.mashProfile.steps` экспортируются в `MASH/MASH_STEPS` как `MASH_STEP` с `STEP_TEMP` и `STEP_TIME`.

## 12. Старт варки

Отдельного блока brew mode больше нет.

Header action `Начать варку` открывает modal.

Flow:

1. Пользователь нажимает `Начать варку`.
2. Modal предлагает:
   - `Пока не списывать`;
   - `Списать ингредиенты со склада`.
3. После подтверждения UI сохраняет рецепт.
4. Если выбрано списание, вызывается confirmed consume.
5. Затем создается batch через `createBrewBatchFromRecipeAction(recipeId)`.
6. Batch создается со статусом `planned`.

Пошаговый brew session UI пока не реализован.

## 13. Process profile

`Mash Profile` находится сразу после core ingredient sections.

Возможности:

- список mash steps;
- температура;
- длительность;
- добавить step;
- удалить step, если step больше одного.

`Fermentation Profile` находится рядом ниже.

Возможности:

- primary temperature;
- primary duration;
- extra fermentation steps;
- cold crash;
- conditioning.

`processMeta` сохраняется в recipe.

- `mashProfile` теперь участвует в FG calculation через выбор главной паузы и practical correction fermentability;
- `fermentationProfile` по-прежнему сохраняется как process plan, но не является прямым драйвером OG/FG/ABV/IBU/color.

## 14. Описание и заметки

Внизу страницы:

- `Описание рецепта` — публичный текст, required для publication;
- `Личные заметки` — private author notes.

Private notes не показываются на публичной странице.

## 15. Модель данных

### `recipes`

Ключевые поля:

- `publicationState`;
- `title`, `slug`, `styleId`;
- batch entered/normalized quantity/unit;
- `efficiency`, `boilTimeMinutes`;
- calculated values: `og`, `fg`, `abv`, `ibu`, `color`;
- `description`, `authorNotes`, `heroImageId`;
- `processMeta`;
- `calculationMeta`;
- `draftState`;
- `importMeta`;
- `equipmentProfileId`;
- `equipmentProfileSnapshot`;
- `waterPlanMeta`;
- `brewPlanMeta`.

### `recipe_ingredients`

Каждая строка имеет:

- `persistentKey`;
- `displayOrder`;
- source linkage: catalog ingredient или user custom ingredient; для imported snapshot допустим recipe-local режим без catalog/custom source;
- taxonomy fields and display snapshots;
- entered/normalized amount;
- `stage`, `timeOffset`, `stepMeta`;
- `inventoryIntentMode`;
- `inventorySelectionMeta`;
- `externalImportMeta`; для imported lines содержит `externalImportMeta.importedIngredient` snapshot.

Сохранение идет через `syncRecipeIngredients()`:

- match по `persistentKey`;
- update existing rows;
- insert new rows;
- delete rows not present in payload.

### Inventory and batches

Используются:

- `recipe_inventory_allocations`;
- `inventory_transactions`;
- `brew_batches`;
- `equipment_profiles`;
- optional water profile data is stored in `waterPlanMeta` for the recipe.

## 16. Расчеты

Stats use:

- batch volume;
- efficiency;
- boil time;
- `calculationMeta`;
- `equipmentProfileSnapshot` or default profile;
- hydrated ingredients with technical data.

Fermentables:

- gravity from potential PPG or fallback;
- color from technical data or fallback;
- OG по-прежнему считается из fermentables, efficiency и batch volume;
- FG теперь uses progressive estimate: default -> mash-adjusted -> yeast-adjusted -> manual override.

### FG / КП: модель прогноза

FG в мастере рецептов — это прогноз, а не лабораторно гарантированная конечная плотность.

Порядок работы модели:

1. Пока нет fermentables или OG не считается, FG не показывается и UI отдает `—` с helper `Добавьте сбраживаемое`.
2. Как только появляются fermentables и считается OG, мастер уже показывает FG по default estimate.
3. Если дрожжи еще не выбраны, базовая attenuation = `75%`.
4. Если в `processMeta.mashProfile.steps` есть mash profile, модель выбирает главную паузу:
   - самый длинный mash step в диапазоне `62–70°C`;
   - если такого шага нет, первый mash step.
5. Главная пауза дает practical correction:
   - `mashAdjPctPoints = clamp((67 - mainMashTempC) * 0.75, -4, 4)`.
6. Grain bill добавляет practical grist corrections по доле gravity points, а не по массе:
   - simple sugars: `simpleSugarAdj = min(simpleSugarSharePct * 0.20, 3.0)`;
   - crystal / caramel / dextrin: `crystalDextrinAdj = min(crystalDextrinSharePct * 0.10, 2.5)`;
   - lactose / maltodextrin: `lactoseAdj = min(lactoseSharePct * 0.35, 4.0)`.
7. Если выбраны дрожжи и у них есть attenuation:
   - диапазон `min/max` превращается в midpoint для main estimate;
   - single attenuation используется как single value fallback.
8. Base attenuation собирается так:
   - `manualAttenuationOverridePct ?? yeast midpoint ?? yeast single ?? 75`.
9. Effective attenuation:
   - `effectiveAttenuationPct = clamp(baseAttenuationPct + mashAdjPctPoints + simpleSugarAdj - crystalDextrinAdj - lactoseAdj, 60, 90)`.
10. FG:
   - manual FG override имеет наивысший приоритет;
   - иначе `remainingPoints = gravityPoints * (1 - effectiveAttenuationPct / 100)`;
   - `predictedFg = 1 + remainingPoints / 1000`.

UI подает это как короткий source label:

- если FG пока недоступна: `—` и helper `Добавьте сбраживаемое`;
- если recipe живет на fallback без usable yeast attenuation: `Прогноз по умолчанию`;
- если расчет идет в normal estimate режиме с usable yeast attenuation: без подписи вообще;
- при ручной attenuation: `Ручная attenuation`;
- при ручной FG override: `Ручной FG`.

Внутренняя модель по-прежнему считает FG range для снижения ложной точности:

- с yeast attenuation range — по min/max attenuation;
- без дрожжей — по default range `72–78`, с теми же mash/grist corrections;
- при manual FG override range не показывается.

Но range не занимает место в summary и не показывается как отдельная карточка в шапке. Если UI показывает диапазон, это делается только во втором слое `Показать детали расчета`.

Основной ручной control в UI — `Ожидаемая attenuation, %` с practical input range `60–90` и внятным placeholder.

`Зафиксировать КП вручную` остается только advanced override: число фиксируется и больше не следует автоматически за OG, grain bill и остальными расчетами.

Подача в UI intentionally спокойная:

- нет постоянного раскрытого блока `FG / КП` в шапке;
- нет постоянных технических labels вроде `Источник attenuation` или `Диапазон FG`;
- нет always-visible manual override fields;
- advanced controls открываются только по маленькой шестеренке / info icon у FG;
- на desktop эта иконка показывается по hover карточки, на touch/mobile может быть видна постоянно;
- внутри панели сначала идут короткие человеческие пояснения и ручные поля, а technical breakdown (`source`, mash influence, grist corrections, optional range) открывается только по `Показать детали расчета`.

Это practical estimate, не лабораторная модель. mash profile участвует в FG calculation, yeast attenuation влияет на FG, если она доступна, fermentation profile по-прежнему не используется как прямой драйвер FG, а equipment profile влияет на FG только косвенно через recipe volumes и OG.

Hops:

- amount in grams;
- alpha acid from technical data or fallback;
- use type from `stepMeta`/stage;
- time from `stepMeta.timeMinutes`, `timeOffset`, or boil fallback.

Water:

- volumes from manual override, equipment profile, or default profile;
- source/target profiles;
- salt solver;
- mash pH estimate;
- mash acid estimate;
- optional sparge acid estimate.

## 17. Публичное отображение

Public recipe route shows only recipes with `publicationState === "published"`.

Public page shows:

- header;
- stats summary;
- ingredient sections;
- public description.

Private notes are not shown.

## 18. Тестовое покрытие

Ключевые тесты:

- `recipe-service.test.ts`;
- `recipe-editor-components.test.ts`;
- `recipe-editor-pages-wiring.test.ts`;
- `equipment-profile-volume-plan.test.ts`;
- `equipment-profiles-page.test.ts`;
- `recipe-equipment-scaling.test.ts`;
- `recipe-water-plan.test.ts`;
- `recipe-inventory-service.test.ts`;
- `recipe-interop.test.ts`;
- brewing-core IBU/water tests.

Текущий UX pass дополнительно покрыт обновленными assertions в:

- `recipe-editor-components.test.ts`;
- `recipe-water-plan.test.ts`;
- `equipment-profiles-page.test.ts`.

## 19. Известные ограничения

- FG model — practical estimate, не лабораторная модель брожения.
- Fermentation temperature/profile пока не используются как основной драйвер FG.
- Alcohol tolerance, stressed fermentation и отдельные high-gravity guardrails пока не добавлены.
- Ingredient-level fermentability beyond sugar / crystal / lactose heuristics пока ограничена.
- Фактическая FG может заметно отличаться от прогноза.
- Scaling to equipment — practical approximation, не full IBU-preserving optimizer.
- Water pH/acid model — practical estimate.
- City water presets are examples, not lab-grade targets.
- Import report UI еще не выделен отдельным экраном.
- Imported ingredient snapshot можно вручную привязать к custom/catalog из строки рецепта; автоматического batch-matching импортированных ингредиентов с каталогом пока нет.
- Brew session UI еще не пошаговый.
- Live device control не реализован.
- `showWaterAdditivesInIngredients` пока сохраняет preference, но automatic salt/acid line mirroring требует source ingredient mapping.
- Hero image upload в мастере не реализован.
