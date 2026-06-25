# Публичная страница рецептов — Reference

> **Назначение:** навигация, URL-контракт фильтров, серверный путь, карта компонентов, рейтинги и сохранения публичных рецептов.
> **Источники истины (код):** `apps/web/app/(public)/recipes/*`, `apps/web/features/recipes/{public-recipe-query,recipes-url,style-search,range-slider}.ts`, `apps/web/components/recipes/recipes-*.tsx`
> **Обновлено:** 2026-06-25
> **См. также:** [CONTEXT.md](../../CONTEXT.md), [recipes-editor.md](recipes-editor.md)

---

## Навигация и структура страницы

Витрина `/recipes` — **публичная** (доступна без логина). Шапка сайта общая для
публичной и рабочей зоны: разделы `Стили пива` (`/bjcp`), `Калькуляторы`
(`/calculators`), `Рецепты` (`/recipes`); правый блок — `Войти` для гостя либо
`Рабочая зона` + меню пользователя для залогиненного. Публичный layout
(`app/(public)/layout.tsx`) оборачивает страницу в контейнер `max-w-7xl`.

Файл страницы — `app/(public)/recipes/page.tsx` (серверный async-компонент).
Сверху вниз:

1. **Hero-блок** — «Рецепты сообщества» + подзаголовок.
2. **Тулбар** (`RecipesToolbar`) — поиск, сортировка, переключатель вида.
3. **Кнопка «Фильтры»** (`RecipesFilterSheet`) — **только на мобильных**
   (`lg:hidden`), открывает bottom-sheet с фильтрами; на кнопке бейдж с числом
   активных фильтров.
4. **Двухколоночная сетка** (`lg:grid-cols-[260px_1fr]`):
   - Левая колонка (десктоп) — sticky-сайдбар фильтров (`RecipesFilterSidebar`,
     скрыт на мобильных).
   - Правая колонка — активные чипы (`ActiveFilterChips`) + результаты
     (`RecipesResults` под `Suspense` со скелетоном `RecipesGridSkeleton`).

Одни и те же контролы (`RecipesFilterControls`) рендерятся дважды: в sticky-сайдбаре
на десктопе и в bottom-sheet на мобильном.

### Что страница готовит на сервере

- `getBjcpCatalogData()` — каталог BJCP (семейства + стили).
- `buildRecipeStyleSearchIndex(catalog)` — **компактный поисковый индекс** (только
  поля для поиска/отображения, без контента статей) для клиентского пикера стиля.
- `getPublicRecipeFamilyCounts()` — `{ familyId → число_рецептов }` по
  опубликованным рецептам. **Семейства с 0 рецептов в карту не попадают.**
- `familyOptions` / `styleOptions` — лёгкие словари `id/code → название` для лейблов
  активных чипов.

### Ключевой принцип: всё состояние — в URL

Фильтры, поиск, сортировка, страница и вид — это **query-параметры URL**, а не
локальный стейт. Любой контрол лишь патчит URL; серверная страница перечитывает
параметры и заново запрашивает данные. Плюсы: расшаривается ссылкой, краулабельна
(SEO), работают кнопки «назад/вперёд», нет рассинхрона UI и данных.

Инфраструктура:

- **`useRecipeQueryNav()`** (`components/recipes/use-recipe-query.ts`) — хук
  навигации: читает живой `searchParams`, мержит патч и обновляет URL
  (`push`/`replace`) внутри `startTransition` (Suspense-граница показывает скелетон
  во время загрузки).
- **`mergeRecipeQuery()`** (`features/recipes/recipes-url.ts`) — чистая функция
  слияния патча с текущим query:
  - `null`/пустая строка в патче → ключ удаляется (снятие фильтра);
  - прочие текущие ключи сохраняются (мерж, не перезапись);
  - любое изменение фильтра/поиска/сортировки сбрасывает `page` (для пагинации и
    смены вида — `{ resetPage: false }`);
  - дефолты в URL не пишутся: `sort=newest`, `view=grid`, `page=1` опускаются.

`generateMetadata` страницы канонизирует все отфильтрованные/постраничные URL на
`/recipes` (`alternates.canonical`), чтобы не плодить дубли в индексе.

---

## URL-контракт параметров

Источник истины парсинга — `parsePublicRecipeFilters()`
(`features/recipes/public-recipe-query.ts`); имена ключей для клиентских контролов —
`features/recipes/recipes-url.ts`.

| Параметр              | Назначение                          | Парсинг / клампы                                  | Пример                  |
|-----------------------|-------------------------------------|--------------------------------------------------|-------------------------|
| `q`                   | Поиск по названию рецепта/автора    | trim, ≤120 симв.                                 | `q=west coast`          |
| `family`              | Фильтр по семейству BJCP (id)       | trim, ≤120 симв.                                 | `family=ipa_hoppy`      |
| `style`               | Фильтр по стилю (BJCP-код)          | trim, ≤64 симв. → `styleCode`                    | `style=21A`             |
| `colorMin`/`colorMax` | Диапазон цвета, SRM                 | число, кламп 0–80, своп перевёрнутых границ      | `colorMin=6&colorMax=9` |
| `abvMin`/`abvMax`     | Диапазон крепости, %                | число, кламп 0–20, своп                          | `abvMin=5&abvMax=7`     |
| `ibuMin`/`ibuMax`     | Диапазон горечи, IBU                | число, кламп 0–200, своп                         | `ibuMin=30`             |
| `method`              | Метод варки (csv)                   | подмн-во `all_grain,biab,extract`; **в SQL не применяется** | `method=all_grain,biab` |
| `sort`                | Сортировка                          | из `publicRecipeSorts`, иначе `newest`           | `sort=abv_desc`         |
| `page`                | Номер страницы                      | целое ≥1, иначе 1                                | `page=2`                |
| `pageSize`            | Размер страницы                     | целое, кламп 1–48, дефолт 24; **UI его не пишет** | `pageSize=48`           |
| `view`                | Вид списка (презентационный)        | `list` иначе `grid`; в SQL не участвует           | `view=list`             |

- `family` и `style` **взаимоисключающи** — оба резолвятся в один и тот же
  серверный `styleId IN (...)`; выбор одного очищает другой.
- Мусор и вне-диапазонные значения тихо нормализуются — страница не падает.
- Дефолты (`sort=newest`, `view=grid`, `page=1`) при патче URL опускаются
  (`recipeFilterDefaults` + `stripDefaults`). `pageSize` в дефолты не входит и из
  URL не вычищается, но клиентские контролы его не выставляют.
- **`countActiveRecipeFilters`** считает активные смысловые измерения для бейджа:
  `q`, `family`, `style`, цвет (`colorMin|colorMax`), ABV, IBU — каждое один раз;
  `sort`/`page`/`view`/`pageSize` не учитываются.

---

## Фильтры

Все контролы собраны в `RecipesFilterControls` в порядке:
**пикер стиля → шкала цвета → слайдер ABV → слайдер IBU → «Сбросить фильтры»**.

### Пикер стиля/семейства (`RecipeStylePicker`)

Два раздельных блока без вложенности.

**Блок «Семейство»** — список кнопок во всю ширину:
- Первая строка — `Все семейства` (активна, когда не выбрано ни семейство, ни стиль;
  снимает фильтр).
- Далее — только **непустые** семейства (есть рецепты), справа — число рецептов
  (`tabular-nums`). Пустые скрыты. Источник чисел — `getPublicRecipeFamilyCounts()`;
  порядок/фильтрация — чистая `orderedFamiliesWithCounts(index, counts)`.
- Клик ставит `family=<id>` (и очищает `style`); повторный по активному — снимает.

**Блок «Поиск стиля»** — всегда видимое поле фаззи-поиска:
- Тот же скоринг-движок, что и `/bjcp` (`@nb/brewing-core`:
  `buildBjcpQueryVariants`, `foldBjcpSearchDiacritics`, `normalizeBjcpSearchText`,
  `scoreBjcpSearchText`), client-side через `searchRecipeStyles` (style-search.ts).
- Запрос < 2 нормализованных символов → пусто. Иначе — выпадающий `listbox` (топ-8
  стилей) строками `код · название`. Понимает код (`21A`), RU/EN-название,
  диакритику, кириллицу.
- Клик по результату ставит `style=<код>` (и очищает `family`), очищает поле.
- При пустом поле и выбранном стиле — тёмная строка выбранного стиля с крестиком.

### Шкала цвета пива (`RecipesColorScale`)

Кликабельная градиентная шкала из 7 сегментов `srmColorBands`
(`features/recipes/beer-color.ts`), заливка — реальный цвет пива по середине
SRM-диапазона (`srmToHex`):

| Сегмент    | SRM   |     | Сегмент      | SRM   |
|------------|-------|-----|--------------|-------|
| Соломенный | 0–3   |     | Коричневый   | 14–20 |
| Золотистый | 3–6   |     | Тёмный       | 20–30 |
| Янтарный   | 6–9   |     | Чёрный       | 30–80 |
| Медный     | 9–14  |     |              |       |

- Клик ставит `colorMin`/`colorMax` границами бэнда; повторный — снимает.
  Активный сегмент в `ring`.
- **a11y:** у каждого сегмента `aria-label` («Янтарный, SRM 6–9»), `aria-pressed`,
  `sr-only`-текст; подпись снизу `aria-live="polite"`.

### Слайдеры ABV / IBU (`RecipesRangeSlider`)

Двухпальцевые слайдеры диапазона поверх `@radix-ui/react-slider` (`SliderScaffold`
из `packages/ui`).

- **ABV:** 0–20 %, шаг 0.1 (`abvBound`). **IBU:** 0–200, шаг 1 (`ibuBound`).
- Значение читается из URL; **drag** меняет только локальную подпись, **запись в
  URL — по отпусканию** (`onValueCommit`, режим `replace`).
- **Граница диапазона = «нет фильтра»:** нижний thumb на минимуме → `*Min`
  опускается; верхний на максимуме → `*Max` опускается (совпадает с серверным
  контрактом: отсутствующий параметр = безграничный).
- Подпись: «любой» / «до X» / «от X» / «X – Y» (+ единица).
- Чистые функции `sliderValueFromParams` / `rangeSliderToParams` /
  `formatSliderRange` (`features/recipes/range-slider.ts`): клампы, своп
  перевёрнутых границ, снэп к шагу (убирает float-дрожание).

### Шкала на мобиле и сброс

- Кнопка «Сбросить фильтры» — `router.push(pathname)` без query.
- **Мобильный (`< lg`):** `RecipesFilterSheet` — bottom-sheet (`role="dialog"`,
  `aria-modal`, закрытие по Escape/overlay/крестику, кнопка «Показать результаты»),
  на кнопке бейдж `countActiveRecipeFilters`.

### Тулбар, чипы, результаты

- **`RecipesToolbar`** — поиск с debounce → `q` (`replace`, ищет по названию рецепта
  и имени автора, отдельно от поиска стиля); нативный `<select>` сортировки → `sort`
  (`push`, опции из `recipeSortOptions`); переключатель сетка/список → `view` (без
  сброса страницы).
- **`ActiveFilterChips`** — удаляемые чипы всех активных фильтров; ✕ убирает
  параметр(ы) из URL (мерж, `page` сбрасывается). Лейблы семейства/стиля — из
  серверных словарей.
- **`RecipesResults`** (серверный, под `Suspense`) — `searchPublicRecipes(filters)`,
  счётчик со склонением, `RecipesGrid` (grid/list), `RecipesPagination`. Пустые
  состояния: `no-results` (фильтры активны) либо `no-recipes` (рецептов нет вовсе).
- **`RecipesPagination`** — numbered (окно `1 … c-1 c c+1 … N` + «Назад/Дальше»),
  рендерится как `<Link>` (краулабельно), меняет только `page`. Дефолт страницы 24,
  макс. 48.

---

## Серверный путь

Чистые хелперы (без БД) — `public-recipe-query.ts`; SQL — `features/recipes/service.ts`.

1. **`parsePublicRecipeFilters(searchParams)`** → валидированный
   `PublicRecipeFilters` с дефолтами/клампами (см. URL-контракт).
2. **`resolveStyleScope(filters)`** → набор `recipes.styleId` для `WHERE styleId IN
   (...)`. Семейства из `getBjcpCatalogData()` (тот же словарь, что `/bjcp`),
   учитывает `crossListedStyleIds`; маппинг ключей → id фикстур через
   `buildStyleKeyIndex()` (`styleKey`/`bjcpId`/`id` из `beerStyleFixtures`).
   Возвращает `null`, если ни семейство, ни стиль не заданы; `[]`, если задан, но
   ничего не сматчилось (→ пусто, без падения).
3. **`searchPublicRecipes(filters)`** собирает SQL:
   - `WHERE publicationState='published'` + `q` (`ilike` по `recipes.title` ИЛИ
     `users.displayName`) + `styleId IN` + `color/abv/ibu` через `gte/lte`;
   - `filters.method` **не применяется** (метод нигде не хранится);
   - сортировка: `resolvePublicRecipeSort(sort)` → колонка из
     `publicRecipeSortColumns` + направление; рейтинг — `rating_avg ... nulls last`
     (через `sql`, т.к. drizzle `asc/desc` не выражают NULLS LAST); вторичный ключ
     `updatedAt desc` для стабильности;
   - пагинация `resolvePagination` (limit/offset); отдельный `count(*)` для total;
   - leftJoin `users` (автор) и `recipeImages` (hero-thumb/blur); для рецептов без
     своего фото — hero-фото BJCP-стиля (`getBjcpStyleHeroImageByBjcpId`).
4. **`getPublicRecipeFamilyCounts()`** — один `GROUP BY styleId` по опубликованным
   рецептам, маппинг в семейства через `resolveFamilyStyleScopes()` (обратная
   сторона `resolveStyleScope`: `familyId → styleId[]`). Возвращает только непустые
   семейства — отдельный агрегат для UI фильтра, контракт витрины не меняет.

План сортировки `resolvePublicRecipeSort` (`PublicRecipeSortKey →` колонка):

| `sort`       | Лейбл UI            | Колонка / направление            |
|--------------|---------------------|----------------------------------|
| `newest`     | Сначала новые (деф.)| `updatedAt desc`                 |
| `popular`    | Популярные          | `saveCount desc` (save_count)    |
| `rating`     | По рейтингу         | `ratingAvg desc nulls last`      |
| `abv_desc`   | Крепче              | `abv desc`                       |
| `abv_asc`    | Слабее              | `abv asc`                        |
| `ibu_desc`   | Горше               | `ibu desc`                       |
| `ibu_asc`    | Мягче               | `ibu asc`                        |
| `color_asc`  | Светлее             | `color asc`                      |
| `color_desc` | Темнее              | `color desc`                     |
| `name`       | По алфавиту         | `title asc`                      |

---

## Рейтинги и сохранения

### Схема (`packages/db/src/schema.ts`)

- **`recipe_ratings`** — одна оценка на пользователя на рецепт
  (`UNIQUE(recipe_id, user_id)` → upsert), `stars` 1..5 (`CHECK`), `body` (text).
- **`recipe_saves`** — одна запись на пользователя на рецепт
  (`UNIQUE(recipe_id, user_id)` → idempotent), `createdAt` (порядок «Избранного»).
- **Денормализованные агрегаты на `recipes`** (источник — таблицы выше, пересчёт
  транзакционно в сервисе):
  - `rating_avg` (`double precision`, nullable) — индекс `recipes_rating_avg_idx`;
  - `rating_count` (`integer`, default 0, not null);
  - `save_count` (`integer`, default 0, not null) — индекс `recipes_save_count_idx`.

### Server actions

**Оценки** — `app/(public)/recipes/[slug]/actions.ts`:
- `loadRecipeRatingViewerState(recipeId)` → `{ authenticated, canRate, rating }`;
  читает сессию + `getViewerRecipeRatingState`. Вызывается клиентом **после
  гидрации**, чтобы документ не читал cookie.
- `rateRecipeAction({ recipeId, slug, stars, body })` → `rateRecipe`; revalidate
  `/recipes/[slug]` и `/recipes`.
- `deleteRecipeRatingAction({ recipeId, slug })` → `deleteRecipeRating`.
- Ошибки: `AUTH` / `OWN_RECIPE` / `NOT_FOUND` (`NOT_FOUND`|`FORBIDDEN`) / `INVALID`
  (`ZodError`) / `ERROR`.

**Сохранения** — `app/(public)/recipes/save-actions.ts`:
- `toggleRecipeSaveAction({ recipeId, slug?, next })` → `setRecipeSave`; revalidate
  `/recipes`, `/app/saved` и (если есть slug) `/recipes/[slug]`. userId всегда из
  сессии — клиентскому payload не доверяем.
- `loadRecipeSaveViewerState(recipeId)` → `{ authenticated, saved }` (детальная).
- `loadRecipeSaveStates(recipeIds[])` → массив сохранённых id (батч для витрины);
  анониму — пустой список.

### Сервис (`features/recipes/service.ts`) — TOCTOU/lock

Все write-path сериализованы через row-lock рецепта
(`lockRecipeForRatingMutation`: `SELECT ... FOR UPDATE`) внутри `db.transaction`:

- **`rateRecipe`** — Zod-валидация снаружи транзакции; внутри: **сначала лок**,
  затем чтение `authorId`/`publicationState` **под локом** (нет TOCTOU между
  проверкой и записью), проверки → `NOT_FOUND` / `FORBIDDEN` (не published) /
  `OWN_RECIPE`; upsert в `recipe_ratings`; пересчёт `rating_avg`/`rating_count`
  (`recomputeRecipeRatingAggregates`) в той же транзакции.
- **`deleteRecipeRating`** — лок → delete → пересчёт агрегатов.
- **`setRecipeSave`** — лок → проверка published (`NOT_FOUND`/`FORBIDDEN`) →
  insert (`onConflictDoNothing`) либо delete → пересчёт `save_count`
  (`recomputeRecipeSaveCount`). Идемпотентно.
- Read-only: `getViewerRecipeRatingState` (`canRate = published && не свой` +
  текущая оценка), `getUserRecipeRating`, `getViewerRecipeSaveState`,
  `getSavedRecipeIds` (батч), `listSavedRecipes`.

### Клиентская развязка кэшируемости

- **Витрина:** `RecipesGrid` оборачивает карточки в `RecipeSavesProvider`, который
  одним батч-вызовом `loadRecipeSaveStates(recipeIds)` после гидрации тянет
  состояние флажков и раздаёт через контекст (оптимистичные апдейты тоже здесь).
  `RecipeSaveButton` (`variant="icon"`) берёт состояние из контекста.
- **Детальная (`/recipes/[slug]`):** документ **не читает сессию/cookie** —
  рендерит `<PublicRecipePage recipe={recipe} />` (остаётся ISR/static для
  анонимов). `RecipeRatingForm` после гидрации зовёт `loadRecipeRatingViewerState`
  (до загрузки — placeholder «Загрузка…»), затем презентационный
  `RecipeRatingFormView` (экспортируется для тестов) рисует ветку: не авторизован →
  CTA «Войдите»; не canRate → «Нельзя оценивать собственный рецепт»; иначе звёздный
  инпут (префилл). Агрегат `★ avg (count)` — SSR из DTO. `RecipeSaveButton`
  (`variant="button"`, без провайдера) грузит своё состояние через
  `loadRecipeSaveViewerState`.

### `/app/saved` — Избранное

`app/(app)/app/saved/page.tsx` — рабочая зона (`requireUser`). `listSavedRecipes`
(только published, новые сверху) → `RecipesGrid`. Пусто → CTA на `/recipes`.

---

## Карта компонентов

| Файл | Роль |
|------|------|
| `app/(public)/recipes/page.tsx` | Серверная страница: индекс/счётчики, разметка |
| `app/(public)/recipes/[slug]/page.tsx` | Детальная (кэшируема, без cookie) |
| `app/(public)/recipes/[slug]/actions.ts` | Server actions оценок |
| `app/(public)/recipes/save-actions.ts` | Server actions сохранений |
| `app/(app)/app/saved/page.tsx` | Страница «Избранное» (рабочая зона) |
| `components/recipes/recipes-toolbar.tsx` | Поиск, сортировка, вид |
| `components/recipes/recipes-filter-controls.tsx` | Сборка контролов фильтра |
| `components/recipes/recipes-filter-sidebar.tsx` | Desktop sticky-сайдбар |
| `components/recipes/recipes-filter-sheet.tsx` | Mobile bottom-sheet + бейдж |
| `components/recipes/recipe-style-picker.tsx` | Семейства (счётчики) + поиск стиля |
| `components/recipes/recipes-color-scale.tsx` | Градиентная шкала цвета |
| `components/recipes/recipes-range-slider.tsx` | Слайдеры ABV/IBU |
| `components/recipes/active-filter-chips.tsx` | Удаляемые чипы |
| `components/recipes/recipes-results.tsx` | Запрос + счётчик + сетка + пагинация |
| `components/recipes/recipes-grid.tsx` | Сетка карточек + `RecipeSavesProvider` |
| `components/recipes/recipe-card.tsx` | Карточка рецепта + флажок «Сохранить» |
| `components/recipes/recipes-pagination.tsx` | Numbered-пагинация |
| `components/recipes/recipes-grid-skeleton.tsx` | Скелетон под `Suspense` |
| `components/recipes/recipes-empty-state.tsx` | `no-results` / `no-recipes` |
| `components/recipes/recipe-rating-form.tsx` | `RecipeRatingForm` + `RecipeRatingFormView` |
| `components/recipes/recipe-save-button.tsx` | Флажок/кнопка «Сохранить» |
| `components/recipes/recipe-saves-provider.tsx` | Батч-состояние флажков (контекст) |
| `components/recipes/public-recipe-page.tsx` | Сборка детальной страницы |
| `components/recipes/use-recipe-query.ts` | Хук URL-навигации |
| `features/recipes/recipes-url.ts` | Мерж query, дефолты, опции сортировки, бейдж |
| `features/recipes/range-slider.ts` | Чистые хелперы слайдер ↔ URL |
| `features/recipes/style-search.ts` | Индекс/поиск стилей, счётчики семейств |
| `features/recipes/public-recipe-query.ts` | Парсинг фильтров, резолв scope, план сортировки |
| `features/recipes/service.ts` | SQL витрины/детальной, агрегаты, рейтинги, сохранения |
| `features/recipes/beer-color.ts` | SRM → цвет, `srmColorBands` |
| `packages/db/src/schema.ts` | `recipes` (агрегаты), `recipe_ratings`, `recipe_saves` |

---

## Ограничения и решения

- **Кэшируемость детальной `/recipes/[slug]`.** Документ не вызывает
  `getSessionUser`/чтение cookie → остаётся ISR/static для анонимов; персональное
  состояние (оценка, флажок «Сохранить») тянется клиентом отдельными server-actions
  после гидрации. Осознанный размен: залогиненный (и аноним) делает 1 доп.
  server-action вызов на просмотр детальной. `generateMetadata`/SEO не затронуты.
- **Витрина не де-кэшируется.** Состояние флажков сохранений грузится одним
  батч-вызовом `loadRecipeSaveStates` после гидрации (через `RecipeSavesProvider`),
  а не на сервере при рендере списка.
- **TOCTOU в write-path устранён.** В `rateRecipe`/`deleteRecipeRating`/
  `setRecipeSave` проверки published/own-recipe и пересчёт денормализованных
  агрегатов выполняются **внутри транзакции под `FOR UPDATE`-локом** строки рецепта
  (Zod-валидация — снаружи). Расхождение rating_avg/save_count с источником
  невозможно.
- **`method` не персистится.** Параметр `method` есть в контракте (csv), парсится,
  но в SQL не применяется — метод варки нигде не хранится.
- **`popular` сортирует по `save_count desc`.** Сохранения трекаются
  (`recipe_saves` + денормализованный `save_count`), опция «Популярные» видна в UI
  (`recipeSortOptions`). **Расхождение с кодом:** комментарий
  `contracts.ts:512` всё ещё гласит «нет данных по клонам/просмотрам, маппится на
  newest» — устарел; фактический маппинг (`resolvePublicRecipeSort`) — на
  `saveCount`. Клоны/просмотры рецептов отдельно не трекаются.
- **Денормализация агрегатов.** `rating_avg`/`rating_count`/`save_count` хранятся на
  `recipes` (с индексами) ради дешёвой сортировки/отображения на витрине; источник
  истины — таблицы `recipe_ratings`/`recipe_saves`, пересчёт транзакционный.
- **Счётчики семейств** считают **рецепты на витрине** (опубликованные), а не число
  стилей в справочнике; пустые семейства скрыты из фильтра.
- **Канонизация URL.** Все отфильтрованные/постраничные варианты канонизируются на
  `/recipes` (`generateMetadata`) — без дублей в индексе.
</content>
</invoke>
