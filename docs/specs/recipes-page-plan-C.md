# Phase C — Интерактивные контролы `/recipes` (URL-driven) — план

## Context

ТЗ `docs/specs/recipes-page.md` (§2, §5, §7). Фазы A (data/service) и B (SSR UI списка)
закоммичены (`recipes-page-plan-A.md`, `recipes-page-plan-B.md`). Сейчас `/recipes` — серверная
страница: `searchParams → parsePublicRecipeFilters → searchPublicRecipes`, сетка карточек + SSR
prev/next-пагинация внутри Suspense-границы (`recipes-results.tsx`), скелетон-fallback. Контролов
нет — состояние можно менять только руками в URL.

Фаза C добавляет **клиентские контролы**, всё состояние — по-прежнему **только в URL**
(`useRouter`/`useSearchParams`/`usePathname`, `router.push`/`replace`). Страница остаётся серверной и
ре-рендерится от изменения `searchParams`; во время навигации грид показывает скелетон через
существующую Suspense-границу. Никакой доменной логики в клиенте — только чтение/запись query.

### Что уже есть и переиспользуется (НЕ изобретать заново)
- **URL-контракт** (имена параметров) задан `parsePublicRecipeFilters` (`features/recipes/public-recipe-query.ts:103`):
  `q`, `family`, `style` (→ styleCode), `colorMin`/`colorMax`, `abvMin`/`abvMax`, `ibuMin`/`ibuMax`,
  `sort`, `page`, `pageSize` (+ `method` парсится, но НЕ выводим). Дефолты: `sort=newest`, `page=1`.
- **Паттерн URL-merge + navigate + debounce**: `components/inventory/inventory-toolbar.tsx:154-205`
  (локальный стейт инпута, `setTimeout` ~250мс, `router.replace(href,{scroll:false})` в
  `startTransition`) и `buildInventoryToolbarHref` (`features/inventory/page-model.ts:258`).
- **Паттерн чипов**: `bjcp-catalog.tsx` (кнопка-пилюля + `X` из `lucide-react`).
- **Паттерн мобильного sheet**: `components/content/bjcp-filter-sheet.tsx` (ручной `role="dialog"`,
  `aria-modal`, Escape-хендлер, overlay click-to-close) — переиспользовать структуру.
- **`@nb/ui`**: `Input` (className passthrough), `Button` (variants default/outline/ghost),
  `Card`. **Select в `@nb/ui` — только scaffold, не используется**; во всём проекте дропдауны —
  нативный `<select>` (`recipe-meta-fields.tsx` и др.) → используем нативный `<select>` (доступен с
  клавиатуры из коробки). **Slider-примитива в проекте нет** → диапазоны ABV/IBU — парные
  `number`-инпуты.
- **BJCP-каталог** (`getBjcpCatalogData()` из `@nb/content`, server-only/async): `families[]`
  (`id`, `nameRu`, `styleIds`, `crossListedStyleIds`), `styles[]` (`bjcpId`, `title`). Страница
  (server) фетчит и прокидывает **слим-опции** в клиентские контролы пропсами.
- **SRM-палитра**: `features/recipes/beer-color.ts` (`SRM_COLOR_MAP`, `beerColorFromSrm`).

---

## Архитектурные решения (зафиксировать в отчёте)

1. **Клиент не импортирует `parsePublicRecipeFilters`** (тянет `@nb/content`/`beerStyleFixtures` в
   бандл). Вместо этого — новый **клиент-безопасный** чистый модуль
   `features/recipes/recipes-url.ts` (без тяжёлых импортов), контролы читают живой
   `useSearchParams()` и применяют патч через `mergeRecipeQuery`.
2. **Счётчик результатов — в серверном `RecipesResults`** (там есть `total`), а не в клиентском
   тулбаре: тулбар клиентский и живёт вне Suspense-границы, серверный `total` ему недоступен без
   проброса. Это естественный и единственный чистый вариант при текущей границе Suspense.
3. **Сортировка — нативный `<select>`** (конвенция проекта, a11y из коробки), НЕ Radix. Отклонение
   от формулировки §7 «Radix Select» оправдано реальным состоянием `@nb/ui` (Select — scaffold).
4. **Sheet — по паттерну `bjcp-filter-sheet`** (ручной dialog), как просил пользователь; не Radix
   Dialog.
5. **grid/list** — пресентационный параметр `view` (не часть `PublicRecipeFilters`, не влияет на
   SQL): читается в `page.tsx` отдельно, прокидывается в грид. Список = одноколоночная раскладка
   (минимально); богатый «компактный ряд» — за рамками.

---

## Новый чистый модуль (client-safe, тестируемый): `features/recipes/recipes-url.ts`

```ts
export const RECIPE_FILTER_DEFAULTS = { sort: "newest", page: "1", view: "grid" };
// Рабочие опции сортировки (БЕЗ popular/rating):
export const recipeSortOptions: { value: PublicRecipeSort; label: string }[] = [
  { value: "newest", label: "Сначала новые" },
  { value: "abv_desc", label: "Крепче" }, { value: "abv_asc", label: "Слабее" },
  { value: "ibu_desc", label: "Горше" }, { value: "ibu_asc", label: "Мягче" },
  { value: "color_asc", label: "Светлее" }, { value: "color_desc", label: "Темнее" },
  { value: "name", label: "По алфавиту" },
];

/**
 * Применяет патч к текущему query, удаляет пустые/дефолтные ключи (null → удалить).
 * resetPage=true (дефолт) — сбрасывает page (фильтр/поиск/сортировка); false — для
 * пагинации/смены view (page трогаем только если он в патче). Возвращает query-строку
 * без ведущего "?". Имена ключей — ровно по URL-контракту parsePublicRecipeFilters.
 */
export function mergeRecipeQuery(
  current: URLSearchParams,
  patch: Record<string, string | null>,
  opts?: { resetPage?: boolean }
): string;

/** Число активных смысловых фильтров (для бейджа на моб. кнопке): q, family, style,
 *  color(min|max), abv(min|max), ibu(min|max) — каждое измерение считается 1 раз. */
export function countActiveRecipeFilters(params: URLSearchParams): number;
```

`mergeRecipeQuery`: копирует `current`, применяет patch (set/delete), при `resetPage`(default) и
отсутствии `page` в патче — `params.delete("page")`; убирает `sort=newest`/`view=grid` как дефолты.

**7 SRM-сегментов** — добавить в `features/recipes/beer-color.ts`:
```ts
export const srmColorBands = [
  { id: "straw",  label: "Соломенный", min: 0,  max: 3 },
  { id: "gold",   label: "Золотистый", min: 3,  max: 6 },
  { id: "amber",  label: "Янтарный",   min: 6,  max: 9 },
  { id: "copper", label: "Медный",     min: 9,  max: 14 },
  { id: "brown",  label: "Коричневый", min: 14, max: 20 },
  { id: "dark",   label: "Тёмный",     min: 20, max: 30 },
  { id: "black",  label: "Чёрный",     min: 30, max: 80 },
] as const;
```
(значения — ориентир по `SRM_COLOR_MAP`; клик по сегменту ставит `colorMin`/`colorMax`).

---

## Новые клиентские компоненты (`apps/web/components/recipes/`)

Каждый: `"use client"`; читает `useSearchParams()`; навигация — `router.push(`?${mergeRecipeQuery(...)}`,
{scroll:false})` в `startTransition`; поиск — `router.replace` с debounce. Любое изменение
фильтра/поиска/сортировки → `resetPage` (page удаляется). Контролы с `<label>`, видимым focus,
`aria-label` для иконок-кнопок.

- **`recipes-toolbar.tsx`** — строка управления (вне Suspense):
  - поиск: `@nb/ui` `Input` + локальный стейт + debounce ~250мс → `q` (`router.replace`);
  - сортировка: нативный `<select>` из `recipeSortOptions` → `sort` (push);
  - переключатель grid/list (две icon-кнопки, `aria-pressed`) → `view` (push, **без сброса page**);
  - кнопка «Фильтры» (только моб., `lg:hidden`) с бейджем `countActiveRecipeFilters` → открывает sheet.
- **`recipes-filter-controls.tsx`** — общий контент фильтров (DRY для sidebar и sheet):
  семейство (нативный `<select>` из `familyOptions` → `family`), стиль (нативный `<select>` из
  `styleOptions` → `style`=bjcpId), 7 цветовых сегментов (кнопки → `colorMin`/`colorMax`, активный
  подсвечен), ABV (2 number-инпута → `abvMin`/`abvMax`), IBU (2 number-инпута → `ibuMin`/`ibuMax`),
  кнопка «Сбросить» (push на `/recipes`). Принимает `familyOptions`/`styleOptions` пропсами.
- **`recipes-filter-sidebar.tsx`** — desktop-обёртка (`hidden lg:block`, sticky) над
  `RecipesFilterControls`.
- **`recipes-filter-sheet.tsx`** — моб. bottom-sheet по паттерну `bjcp-filter-sheet.tsx`
  (`role="dialog"`, `aria-modal`, Escape, overlay-close) с `RecipesFilterControls` + бейдж активных.
  Состояние open — локальный `useState` (UI-only, не в URL).
- **`active-filter-chips.tsx`** — активные фильтры удаляемыми пилюлями (`X`). Лейблы:
  `family`→nameRu (из `familyOptions`), `style`→title (из `styleOptions`), цвет→`srmColorBands`/`SRM a–b`,
  `abv`→`ABV a–b %`, `ibu`→`IBU a–b`, `q`→`«текст»`. Клик ✕ → `mergeRecipeQuery({key:null})` (push).
- **`recipes-pagination.tsx`** — интерактивный numbered-контрол: рендерит `Link` (краулабельно §7) с
  href из `mergeRecipeQuery(params,{page},{resetPage:false})`; номера страниц + prev/next, текущая
  выделена, `aria-current="page"`. Заменяет инлайновый prev/next в `recipes-results.tsx`.

---

## Изменяемые файлы

- **`app/(public)/recipes/page.tsx`** (server): `getBjcpCatalogData()` → собрать слим
  `familyOptions` (`{id,name}` из `families`, отсортировано) и `styleOptions`
  (`{code,name,familyIds}` из `styles`); прочитать `view` из `raw`; новый layout —
  `<RecipesToolbar/>` сверху, ниже двухколоночно: `<RecipesFilterSidebar/>` (lg) + правая колонка
  (`<ActiveFilterChips/>` → `<Suspense fallback={<RecipesGridSkeleton/>}><RecipesResults/></Suspense>`);
  `<RecipesFilterSheet/>` (моб.). Прокинуть options в клиентские контролы. Контролы — **вне**
  Suspense (остаются на экране во время навигации).
- **`components/recipes/recipes-results.tsx`** (server): добавить счётчик «Найдено N» над гридом;
  заменить инлайн prev/next на `<RecipesPagination current={page} totalPages={…}/>`; принять `view`
  и пробросить в `RecipesGrid`. (Чистые `hasActiveFilters` оставить для выбора empty-state.)
- **`components/recipes/recipes-grid.tsx`**: проп `view?: "grid" | "list"`; list → одноколоночная
  раскладка (минимально, переиспользуя `RecipeCard`).
- **`features/recipes/beer-color.ts`**: `srmColorBands`.

---

## Тесты (Vitest)

- **`tests/recipes-url.test.ts`** (чистые функции, основной объём):
  - `mergeRecipeQuery`: смена фильтра/сорта/поиска **сбрасывает page**; **прочие параметры
    сохраняются** (не затираются); `null` удаляет ключ (удаление чипа); `sort=newest`/`view=grid`
    не попадают в URL; пагинация/`view` (`resetPage:false`) **не сбрасывают** page; смена страницы
    сохраняет фильтры. (Покрывает «парс/мерж query», «удаление чипа», «логику поиска» — построение
    query из значения, без таймеров.)
  - `countActiveRecipeFilters`: корректный подсчёт по измерениям; sort/page/view не считаются.
- **`tests/recipes-filter-sheet.test.ts`**: `renderToStaticMarkup` с моками `next/navigation`
  (`useRouter`/`useSearchParams`/`usePathname`, как `tests/site-shell.test.ts`); `open=true` →
  рендерятся семейства/лейблы ABV/IBU/цвет; бейдж активных фильтров. (Опц. аналогичный smoke для
  `recipes-toolbar`: присутствуют рабочие сорт-опции, **нет** popular/rating.)
- Существующие `recipe-card`/`recipes-page`/`public-recipe-query`/`beer-color`/сервисные — не ломать.

---

## Жёсткие правила Фазы C (контроль при ревью)
- В сорт-селекте и фильтрах — только рабочее: сортировки newest/abv/ibu/color/name; фильтры
  стиль/семейство, цвет, ABV, IBU. **НЕ выводить** popular, rating, фильтр «метод». popular в этой
  фазе не включаем (нужен трекинг клонов/просмотров — §10.1).
- Любое изменение фильтра/поиска/сортировки → `page=1` (сброс).
- Изменение одного параметра мержится в существующий query (не затирает остальные).
- Loading-UX через Suspense-границу `recipes-results` сохраняется (контролы вне границы).
- Доступность: `<label>`, клавиатура, видимый focus, `aria-label` на иконках; `aria-current` в
  пагинации; sheet — фокус/Escape по паттерну `bjcp-filter-sheet`.
- Пагинация остаётся краулабельной (`Link`/`<a href>`), не только JS (§7).

## Риски
- **`useSearchParams` требует динамического рендера / Suspense**: маршрут уже динамический
  (`searchParams`), контролы рендерятся всегда на динамической странице — ок; следить за warning
  при сборке, при необходимости пометить осознанно.
- **`router.push` vs `replace`**: дискретные изменения (сорт/фильтр/чип/страница) — `push` (рабочая
  «назад» по §2); печать в поиске — `replace` (не засорять историю).
- **Клиентский бандл**: не импортировать `public-recipe-query.ts`/`@nb/content`/`beerStyleFixtures`
  в клиентские контролы — только `recipes-url.ts` + пропсы-опции с сервера.
- **`styleOptions` объём (~100 стилей)**: достаточно `{code,name,familyIds}`; стиль как вторичный
  `<select>` (можно фильтровать список по выбранному семейству на клиенте — без доменной логики).
- **`bjcpId` подстилей не уникален** (риск из Phase A) — для грубого фильтра по стилю приемлемо;
  значение селекта = `bjcpId`, матчинг — существующий `resolveStyleScope`.
- **Дубли UI sidebar/sheet** — устраняются общим `recipes-filter-controls.tsx`.

## Команды проверки
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npx vitest run recipes-url recipes-filter-sheet recipes-page recipe-card public-recipe-query beer-color` (в `apps/web`)
- Полный прогон web: `npx vitest run`; перед коммитом — `npm run typecheck`, `npm run lint`
  (файлы фазы держать lint-чистыми; пред-существующие чужие lint-ошибки — вне диффа), `npm run test`.
- Визуально (`npm run dev`): `/recipes` — поиск/сорт/фильтры/чипы/пагинация меняют URL; «назад»
  работает; при навигации виден скелетон; моб. sheet открывается, бейдж активных корректен.
- Отчёт — `docs/specs/recipes-page-plan-C.md` (первым шагом исполнения — копия плана).

## Definition of Done (Phase C)
- [x] Тулбар (поиск debounce→q, сорт-select, grid/list, счётчик результатов на сервере).
- [x] Сайдбар (desktop) + sheet (mobile) с общими контролами: семейство/стиль, цвет (7 сегм.),
      ABV, IBU, «Сбросить»; бейдж активных на моб. кнопке.
- [x] Активные фильтр-чипы с удалением.
- [x] Интерактивная numbered-пагинация через URL (краулабельная).
- [x] Состояние только в URL; смена фильтра сбрасывает page; параметры мержатся; «назад» работает.
- [x] popular/rating/метод не выводятся; только рабочие сортировки/фильтры.
- [x] Suspense-скелетон при навигации; a11y (label/focus/aria) соблюдены.
- [x] `typecheck`/`lint`/`test` зелёные; добавлены тесты merge/chips/sheet.
- [x] Решения/отклонения зафиксированы ниже.

---

## Итоги реализации (Phase C — выполнено)

### Что сделано (по факту)
- **Чистый client-safe модуль** `features/recipes/recipes-url.ts`: `mergeRecipeQuery`
  (мерж патча, удаление по `null`/пустой строке, сброс `page`, отбрасывание дефолтов
  `sort=newest`/`view=grid`/`page=1`), `countActiveRecipeFilters`, `recipeSortOptions` (только
  рабочие сорта). `srmColorBands` (7 сегментов) — в `features/recipes/beer-color.ts`.
- **Хук навигации** `components/recipes/use-recipe-query.ts` (`useRecipeQueryNav`): читает живой
  `useSearchParams`, строит href через `mergeRecipeQuery`, `push`/`replace` в `startTransition`
  (`scroll:false`), `reset`.
- **Клиентские контролы** (`components/recipes/`): `recipes-toolbar` (поиск debounce 250мс→`q`
  replace; сорт нативный `<select>`→`sort` push; grid/list→`view` push без сброса page),
  `recipes-filter-controls` (семейство/стиль `<select>`, 7 цветовых сегментов→`colorMin/Max`,
  парные number-инпуты ABV/IBU с debounce 300мс replace, «Сбросить»), `recipes-filter-sidebar`
  (desktop sticky), `recipes-filter-sheet` (моб. диалог по паттерну `bjcp-filter-sheet` +
  триггер-кнопка с бейджем), `active-filter-chips`, `recipes-pagination` (numbered, `Link`,
  `aria-current`).
- **Сервер**: `page.tsx` фетчит `getBjcpCatalogData()` → `familyOptions`/`styleOptions`, читает
  `view`, новый layout (тулбар + sheet + 2 колонки: sidebar | чипы+Suspense(results)).
  `recipes-results.tsx` — счётчик «Найдено N» (RU-склонение) + `<RecipesPagination>` вместо
  инлайновых prev/next; проп `view`. `recipes-grid.tsx` — проп `view` (list = 1–2 колонки).
- **Тесты**: `tests/recipes-url.test.ts` (12), `tests/recipes-filter-sheet.test.ts` (5, рендер
  controls + бейдж sheet с моком `next/navigation`); обновлён `tests/recipes-page.test.ts` под новую
  сигнатуру `RecipesResults({filters,view})` и клиентскую пагинацию. Полный прогон web:
  **576/576** зелёные; `npm run typecheck` (все workspace) и `next lint` по файлам фазы — чисто.

### Расхождения с планом/ТЗ (зафиксировано)
1. **Триггер «Фильтры» инкапсулирован в `RecipesFilterSheet`** (моб.-only кнопка с бейджем), а не в
   тулбаре: так состояние open остаётся локальным в sheet, без проброса между компонентами.
   Функционально — кнопка рядом с тулбаром, как в ТЗ.
2. **Счётчик результатов — в серверном `RecipesResults`** (там `total`), не в клиентском тулбаре —
   единственный чистый вариант при текущей Suspense-границе (решение из плана подтверждено).
3. **Нативный `<select>` для сорта/семейства/стиля** (конвенция проекта; `@nb/ui` Select —
   неиспользуемый scaffold), не Radix. **Sheet — ручной dialog** по паттерну `bjcp-filter-sheet`,
   не Radix Dialog. Клавиатура/Escape/focus обеспечены.
4. **Диапазоны ABV/IBU — парные number-инпуты** с debounce (Slider-примитива в проекте нет).
5. **`view` (grid/list)** — презентационный URL-параметр, не часть `PublicRecipeFilters`/SQL;
   list = одноколоночная/двухколоночная раскладка тех же карточек (минимально).
6. **`RecipesResults` больше не принимает `raw`** — пагинация стала клиентской и читает
   `useSearchParams` сама; SSR-prev/next из Фазы B заменены на numbered `<RecipesPagination>`.
7. **popular/rating/«метод» в UI не выводятся** (нет данных, отчёты A/B); `popular` в этой фазе не
   включён (нужен трекинг — §10.1).
