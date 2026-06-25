# Редизайн фильтров на `/recipes` — mobile-first

> Первый шаг исполнения: скопировать этот план в `docs/specs/recipes-page-plan-filters-redesign.md`
> (конвенция Фаз A–D — спеки живут в `docs/specs/`). Туда же дописать «Итоги реализации».

## Context

Текущая панель фильтров `/recipes` неудобна, особенно на телефоне:
- **Семейство** и **Стиль** — два длинных нативных `<select>` (≈10 семейств / 80+ стилей). Скролл
  огромных дропдаунов — плохой user-flow; все стили в дропдаун всё равно не помещаются.
- **Цвет** — 7 серых чипов-кнопок: не выглядит современно, цвет пива не показан.
- **ABV/IBU** — пары number-инпутов: не наглядно, неудобно пальцем.

Цель: перенести проверенный UX со страницы **BJCP** (умный фаззи-поиск стилей/семейств) в фильтр
рецептов; цвет — кликабельная шкала реальных оттенков пива; ABV/IBU — слайдеры диапазона. Всё —
mobile-first и доступно с телефона.

**Жёсткая граница безопасности:** это **чисто презентационный** редизайн. URL-контракт
(`family`, `style`, `colorMin/colorMax`, `abvMin/abvMax`, `ibuMin/ibuMax`, `sort`, `page`, `view`) и
весь серверный путь (`public-recipe-query.ts`, `service.ts`, SQL) **не меняются**. Меняются только
клиентские контролы и то, как страница готовит для них данные.

## Решения (подтверждены пользователем)

1. **Стиль/семейство** → одна кнопка «Стиль», открывающая панель: поле умного поиска (подсказки
   стилей + семейств) **+ сетка чипов частых семейств** для выбора в один тап без ввода.
2. **Цвет** → горизонтальная **градиентная шкала реальных цветов пива** (палитра `srmToHex`),
   7 сегментов; тап по сегменту = выбор диапазона. Подпись оттенка + SRM (a11y).
3. **ABV/IBU** → двухпальцевые **слайдеры диапазона** на новой зависимости `@radix-ui/react-slider`
   (в проекте уже есть `@radix-ui/react-dialog|select|toast` — паттерн знаком).

---

## Переиспользуемые активы (найдено при разведке)

- `getBjcpCatalogData()` (`@nb/content`) — **уже вызывается** в `app/(public)/recipes/page.tsx`
  (доп. фетча не будет). Даёт `families` (id, nameRu, nameEn, styleCount, sortOrder) и `styles`
  (bjcpId, title, titleEn, familyIds, familyNameRu, badgesRu …).
- Текстовые скоринг-примитивы из `@nb/brewing-core` (чистые, клиент-safe, уже используются в
  `features/content/bjcp-catalog.ts`): `buildBjcpQueryVariants`, `foldBjcpSearchDiacritics`,
  `normalizeBjcpSearchText`, `scoreBjcpSearchText`.
- Палитра цвета пива: `srmToHex` / `beerColorFromSrm` / `pickTextColorForSrm` +
  `srmColorBands` (7 бэндов с min/max) — `features/recipes/beer-color.ts`.
- URL-state: хук `useRecipeQueryNav()` (`components/recipes/use-recipe-query.ts`),
  `mergeRecipeQuery`/`recipeFilterDefaults` (`features/recipes/recipes-url.ts`).
- Mobile-паттерн: ручной bottom-sheet (`role="dialog"`, Escape, backdrop) — образец в
  `components/recipes/recipes-filter-sheet.tsx`. Переиспользуем его для панели стиля (без новой
  popover-зависимости).
- Активные чипы фильтров уже есть: `components/recipes/active-filter-chips.tsx` (резолвит метки
  family/style из пропсов-опций) — продолжит работать, контракт URL не меняется.

**Почему компактный индекс, а не весь каталог на клиент:** страница `/recipes` намеренно лёгкая.
Гонять полный `BjcpCatalogData` (160 стилей с контентом статей) в пропсах — лишний вес. Вместо этого
сервер строит **компактный поисковый индекс**, а клиент скорит его чистой функцией (тестируемо в
node-окружении, без round-trip на каждый keystroke).

---

## Изменяемые / новые файлы

### Новое
- **`packages/ui/src/components/slider.tsx`** — `SliderScaffold` поверх `@radix-ui/react-slider`
  (двухпальцевый range, стилизация через `cn`, как в существующих scaffold-ах). Экспорт из
  `packages/ui/src/index.ts`. Зависимость `@radix-ui/react-slider` → `packages/ui/package.json`.
- **`apps/web/features/recipes/style-search.ts`** (чистая доменная логика):
  - тип `RecipeStyleSearchIndex = { families: RecipeFamilyEntry[]; styles: RecipeStyleEntry[] }`,
    где entry содержит ровно то, что нужно для поиска и отображения (family: `id,nameRu,nameEn,styleCount,sortOrder`;
    style: `code,title,titleEn,familyIds,familyNameRu`).
  - `buildRecipeStyleSearchIndex(catalog: BjcpCatalogData): RecipeStyleSearchIndex` — сервер строит
    компактный индекс из `getBjcpCatalogData()`.
  - `searchRecipeStyles(query, index): { families: RecipeFamilySuggestion[]; styles: RecipeStyleSuggestion[] }`
    — **чистая** фаззи-функция, переиспользует `scoreBjcpSearchText`/`buildBjcpQueryVariants`/
    `foldBjcpSearchDiacritics`/`normalizeBjcpSearchText`; <2 симв → пусто; топ-N семейств/стилей.
  - `topRecipeFamilies(index, n)` — частые семейства (по `styleCount`/`sortOrder`) для сетки чипов.
- **`apps/web/components/recipes/recipe-style-picker.tsx`** (client): кнопка-триггер с текущим
  выбором («Все стили» / название семейства / `code · название`); панель — bottom-sheet на телефоне
  и якорный dropdown-card на десктопе (паттерн из `recipes-filter-sheet`, без popover-зависимости).
  Внутри: debounced поле поиска → `searchRecipeStyles`; секции «Семейства»/«Стили»; сетка чипов
  частых семейств при пустом запросе. Выбор семейства → `navigate({ family: id, style: null })`;
  выбор стиля → `navigate({ style: code, family: null })`. Очистка → оба `null`.
- **`apps/web/components/recipes/recipes-color-scale.tsx`** (client): градиентная полоса из 7
  сегментов `srmColorBands`, заливка реальным цветом (`srmToHex` по середине бэнда); тап = toggle
  `{colorMin,colorMax}` (та же логика, что сейчас в чипах). Каждый сегмент — `<button>` с
  `aria-pressed` и `sr-only`-меткой (цвет не единственный сигнал, §6 ТЗ). Снизу — подпись выбранного
  оттенка + SRM-диапазон.
- **`apps/web/components/recipes/recipes-range-slider.tsx`** (client): обёртка над `SliderScaffold`
  для пары min/max. Чистый хелпер `rangeSliderToParams(min, max, bound)` (в `style-search.ts` или
  отдельном `range-slider.ts`) — если оба значения на границах (0..bound) → `{null,null}` (нет
  фильтра); иначе строки. Локальный стейт + debounce(300) → `navigate(..., "replace")`. Показывает
  числовые подписи и «любой» на краях. ABV: 0–20, step 0.1; IBU: 0–200, step 1.

### Изменяемое
- **`apps/web/components/recipes/recipes-filter-controls.tsx`** — пересобрать панель: `RecipeStylePicker`
  (вместо двух `<select>`), `RecipesColorScale` (вместо чипов), два `RecipesRangeSlider` (вместо
  `RangeField`), кнопка «Сбросить». Принимать `index: RecipeStyleSearchIndex` (+ текущие опции для
  чипов, если нужны). Удалить локальные `RangeField`/`selectClassName`.
- **`apps/web/components/recipes/recipes-filter-sheet.tsx`** и **`recipes-filter-sidebar.tsx`** —
  прокинуть новый проп `index` вместо `familyOptions/styleOptions` (или дополнительно). Структура
  (sheet на мобиле, sidebar на десктопе) сохраняется.
- **`apps/web/app/(public)/recipes/page.tsx`** — построить `index = buildRecipeStyleSearchIndex(catalog)`
  из уже полученного `getBjcpCatalogData()` и передать в sheet/sidebar. `familyOptions/styleOptions`
  для `ActiveFilterChips` оставить (метки чипов) — либо резолвить из индекса.
- **`packages/ui/src/index.ts`** — экспорт `SliderScaffold`.

---

## Тесты (vitest, env "node": только `renderToStaticMarkup` + чистые функции)

- **`tests/recipe-style-search.test.ts`** (новый, главный): чистая `searchRecipeStyles` — запрос «ipa»
  → семейство IPA + стили 21A/22A; <2 симв → пусто; кириллица/латиница/диакритика; `buildRecipeStyleSearchIndex`
  даёт компактный индекс; `topRecipeFamilies` сортирует по styleCount.
- **`tests/recipes-range-slider.test.ts`** (новый): `rangeSliderToParams` — оба на границах → null/null;
  частичный → строки; перевёрнутый диапазон/клампы согласованы с серверным `parseRange`.
- **`tests/recipes-color-scale.test.ts`** (новый): статический рендер показывает 7 сегментов с
  `aria-pressed`, sr-only-метки оттенков, активный сегмент при заданных colorMin/colorMax.
- **`tests/recipe-style-picker.test.ts`** (новый): статический рендер триггера — «Все стили» без
  выбора; название семейства/`code · title` при заданном family/style; панель закрыта → нет
  `role="dialog"` (как в `recipes-filter-sheet.test.ts`).
- Обновить существующие: **`tests/recipes-filter-sheet.test.ts`** и любые тесты, что передавали
  `familyOptions/styleOptions` в контролы (сменить на `index`). Прогнать весь web-набор на регрессии.

---

## Риски и заметки

- **Нет DOM/jsdom** → drag слайдера, открытие панели и debounced-поиск как интеракции не юнит-тестируемы.
  Митигируем: вся логика — в чистых функциях (`searchRecipeStyles`, `rangeSliderToParams`,
  `buildRecipeStyleSearchIndex`), а компоненты проверяем статическим рендером (триггеры/метки/aria).
  Это согласуется с текущими конвенциями (`renderToStaticMarkup`).
- **Radix Slider на сервере**: `renderToStaticMarkup` рендерит Root без падения (как в реальном SSR
  Next). Эффекты не исполняются — ок для статик-проверок.
- **Новая зависимость** `@radix-ui/react-slider`: ставится в `packages/ui` (рядом с уже имеющимися
  radix-пакетами), новый workspace-install. После добавления — `npm install` в корне.
- **Вес пропсов**: компактный индекс (только поля для поиска/отображения, без контента статей) —
  существенно легче полного каталога; страница остаётся лёгкой.
- **Контракт URL/SQL неизменен** — `service.ts`/`public-recipe-query.ts` не трогаем; выбор family/style
  по-прежнему раскрывается в `resolveStyleScope` → `styleId IN (...)`. Это ключевая страховка от регрессий.
- **a11y**: цветовая шкала и слайдеры — не только цветом/позицией: дублируем числами и текстовыми
  метками, кнопки сегментов имеют `aria-pressed` и `sr-only` названия оттенков.
- **Без расширения скоупа**: не трогаем сортировку, рейтинги, карточки рецептов, пагинацию,
  серверный путь. Только контролы фильтра + подготовка данных в `page.tsx`.

## Команды проверки
- `npm install` (после правки `packages/ui/package.json`).
- `npx tsc -p apps/web/tsconfig.json --noEmit`; затем `npm run typecheck` (все workspace, включая `@nb/ui`).
- `cd apps/web && npx vitest run recipe-style-search recipes-range-slider recipes-color-scale recipe-style-picker recipes-filter-sheet active-filter-chips`
- Полный прогон: `cd apps/web && npx vitest run`.
- Линт затронутых: `cd apps/web && npx next lint --file components/recipes/recipe-style-picker.tsx --file components/recipes/recipes-color-scale.tsx --file components/recipes/recipes-range-slider.tsx --file components/recipes/recipes-filter-controls.tsx --file features/recipes/style-search.ts --file "app/(public)/recipes/page.tsx"`.
- Визуально (`npm run dev`): на телефоне (DevTools mobile) — открыть `/recipes`, тапнуть «Фильтры»;
  панель «Стиль» ищет «ipa»/«стаут», чипы семейств работают; цветовая шкала кликается и красится
  реальными оттенками; ABV/IBU тянутся пальцем; URL-параметры и выдача корректны; десктоп-сайдбар ок.

## Definition of Done
- [x] Два `<select>` заменены на `RecipeStylePicker` (умный поиск + чипы семейств); ставит `family=`/`style=`.
- [x] Цвет — кликабельная градиентная шкала реальных оттенков, контракт `colorMin/colorMax` сохранён, a11y.
- [x] ABV/IBU — двухпальцевые слайдеры (`@radix-ui/react-slider` через `SliderScaffold`); края = «нет фильтра».
- [x] URL-контракт и серверный путь (`service.ts`/`public-recipe-query.ts`/SQL) не изменены.
- [x] Mobile-first: всё доступно и удобно на телефоне (sheet) и на десктопе (sidebar).
- [x] Тесты: чистые функции (поиск/слайдер/индекс) + статик-рендеры контролов; полный web vitest и tsc зелёные.
- [x] План скопирован в `docs/specs/...`, дописаны «Итоги реализации».

---

## Итоги реализации (выполнено)

**Новые файлы**
- `packages/ui/src/components/slider.tsx` — `SliderScaffold` (двухпальцевый range поверх
  `@radix-ui/react-slider`); экспорт добавлен в `packages/ui/src/index.ts`; зависимость
  `@radix-ui/react-slider@^1.2.2` — в `packages/ui/package.json` (выполнен `npm install`).
- `apps/web/features/recipes/style-search.ts` — `RecipeStyleSearchIndex`,
  `buildRecipeStyleSearchIndex`, **чистая** `searchRecipeStyles` (фаззи через примитивы
  `@nb/brewing-core`), `topRecipeFamilies`, `describeStyleSelection`.
- `apps/web/features/recipes/range-slider.ts` — чистые `sliderValueFromParams`,
  `rangeSliderToParams`, `formatSliderRange` + константы `abvBound` (0–20, шаг 0.1) и
  `ibuBound` (0–200, шаг 1). Границы диапазона ↔ отсутствие param-а (нет фильтра).
- `apps/web/components/recipes/recipe-style-picker.tsx` — раскрывающийся (disclosure) пикер:
  поле поиска + секции «Семейства»/«Стили» + сетка чипов частых семейств. Inline-панель (не
  вложенная модалка) → работает и в мобильном sheet, и в десктоп-сайдбаре.
- `apps/web/components/recipes/recipes-color-scale.tsx` — градиентная шкала из 7 сегментов
  реальных оттенков (`srmToHex` по середине бэнда); `aria-pressed` + `sr-only`-метки оттенков.
- `apps/web/components/recipes/recipes-range-slider.tsx` — обёртка `SliderScaffold`: drag
  обновляет локальную подпись, запись в URL — по `onValueCommit` (replace).

**Изменено**
- `recipes-filter-controls.tsx` — пересобрана из новых контролов; принимает `index`
  (типы `RecipeFamilyOption/RecipeStyleOption` оставлены для `active-filter-chips`).
- `recipes-filter-sheet.tsx`, `recipes-filter-sidebar.tsx` — проп `index` вместо
  `familyOptions/styleOptions`.
- `app/(public)/recipes/page.tsx` — строит `styleIndex = buildRecipeStyleSearchIndex(catalog)`
  из уже вызываемого `getBjcpCatalogData()` (без доп. фетча) и прокидывает в sheet/sidebar;
  `familyOptions/styleOptions` сохранены для лейблов активных чипов.

**Тесты (новые/обновлённые)**
- `tests/recipe-style-search.test.ts` (11) — поиск «ipa»/«стаут»/«21A», <2 симв → пусто,
  `topRecipeFamilies`, `describeStyleSelection`, `buildRecipeStyleSearchIndex`.
- `tests/recipes-range-slider.test.ts` (11) — маппинг слайдер↔URL, своп, клампы, подписи.
- `tests/recipes-color-scale.test.ts` (3), `tests/recipe-style-picker.test.ts` (3) —
  статик-рендеры (метки, aria, дефолтная подпись, выбор семейства/стиля).
- `tests/recipes-filter-sheet.test.ts` — обновлён под проп `index`.

**Проверки:** `npm install` ок; `npm run typecheck` (все workspace, включая `@nb/ui`) — чисто;
полный web vitest — **636 passed** (было 608, +28); `next lint` по затронутым файлам — без ошибок.

**Заметки / осознанные размены**
- Контракт URL и серверный путь (`service.ts`/`public-recipe-query.ts`/SQL) **не тронуты** —
  выбор family/style по-прежнему раскрывается в `resolveStyleScope` → `styleId IN (...)`.
- Поиск стиля — клиентский по компактному индексу (без round-trip), переиспользует те же
  скоринг-примитивы, что и страница BJCP.
- Drag слайдера / открытие панели / ввод поиска как интеракции не юнит-тестируются (env "node",
  нет DOM) — логика вынесена в чистые функции и покрыта; компоненты проверены статик-рендером.
- Не трогалось (вне скоупа): сортировка, рейтинги, карточки рецептов, пагинация, тулбар-поиск.

### Ревизия: фильтр стиля переделан на два раздельных блока (по фидбэку)

Первая версия (раскрывающийся пикер «открыть → ввести поиск» + чипы семейств) была неудачной:
лишний шаг-вложенность, неряшливые разнокалиберные чипы, столбец строк с рамками. Переделано:
- **`RecipeStylePicker`** теперь рендерит **два независимых блока** (без вложенности):
  1. «Семейство» — ровный список во всю ширину со счётчиками стилей (строки в стиле сайдбара
     справочника BJCP: full-width, count-бейдж, активная = тёмная). Первая строка «Все семейства»
     сбрасывает фильтр. Сорт по `sortOrder` (`orderedFamilies`).
  2. «Поиск стиля» — **всегда видимое** поле фаззи-поиска (без кнопки-раскрытия); при вводе ≥2
     символов — выпадающий список совпадений ровными строками в одном листбоксе с прокруткой;
     выбранный стиль показан отдельной строкой с ✕.
- Семейство и стиль взаимоисключающи (оба ведут в `resolveStyleScope`): выбор одного очищает другой.
- `style-search.ts`: `topRecipeFamilies`/`describeStyleSelection` заменены на `orderedFamilies` и
  `findStyleByCode`. Тесты обновлены (`recipe-style-search`, `recipe-style-picker`, `recipes-filter-sheet`).
- Контракт URL/SQL по-прежнему не меняется. Полный web vitest — **636 passed**, tsc/lint чисто.

### Ревизия 2: убран вводящий в заблуждение счётчик + фикс overflow

- **Счётчик у семейств убран.** Показывался `styleCount` из справочника BJCP (число *стилей* в
  семействе), а не число *рецептов* на витрине → вводило в заблуждение. Строка семейства теперь —
  только название. (Реальные счётчики рецептов по семействам = отдельная серверная агрегатная
  задача: `recipes.styleId` → семейство через `resolveStyleScope`/`beerStyleFixtures`; не делалось.)
- **Фикс вёрстки (overflow).** Длинные названия не усекались: у flex-детей с `truncate` не было
  `min-w-0`, контент вылезал за 260px-сайдбар на карточки. Добавлен `min-w-0` на усекаемые `span`
  (строки семейств, результаты поиска, выбранный стиль) и на грид-айтем сайдбара (`<aside>`).
