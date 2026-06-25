# Phase B — UI списка `/recipes` (SSR) — план

## Context

ТЗ `docs/specs/recipes-page.md` (§5–§7) превращает `/recipes` в витрину для discovery.
**Фаза A уже выполнена и закоммичена** (`docs/specs/recipes-page-plan-A.md`): есть data-слой —
`searchPublicRecipes(filters)` (`features/recipes/service.ts:1802`, фильтры/сорт/пагинация в SQL,
без N+1, только `published`), чистый парсер `parsePublicRecipeFilters` (`public-recipe-query.ts`),
SRM-хелперы `srmToHex`/`pickTextColorForSrm`/`beerColorFromSrm` (`beer-color.ts`), индексы.

Фаза B — **только UI списка, server-side**: переписать `page.tsx` на `searchPublicRecipes`,
собрать серверные компоненты карточки/сетки/скелетона/empty-state, убрать ставший мёртвым
legacy-путь (`listPublicRecipes` + `PublicRecipeList`). Интерактивные контролы (тулбар, сайдбар,
чипы, клиентская пагинация) — **Фаза C, в этой фазе НЕ делаем**: страница рендерится из
`searchParams` server-side.

### Учёт расхождений из отчёта A (важно для B)
- `searchPublicRecipes` — **новая** функция рядом с legacy `listPublicRecipes(limit)`; на B страница
  переходит на неё, после чего legacy удаляется (см. ниже — кто ещё её вызывает).
- `method`/`popular`/`rating` есть в типах, но **данных нет** → в UI этой фазы **не показывать**:
  сортировки только `newest/abv_desc/abv_asc/ibu_desc/ibu_asc/color_asc/color_desc/name`; фильтр
  «метод» и опции `popular`/`rating` не выводим. `rating` в карточке всегда `null` → бейдж «Новый».
- `publishedAt` маппится из `updatedAt`; `cloneCount=0`; `colorSrm = recipes.color`.
- DTO `PublicRecipeListItem` уже отдаёт `style {code,name}`, `author {id,displayName,image}`,
  `heroImage {thumbUrl, blurDataUrl}` — карточка **без доменной логики**, только из DTO.

---

## Изменяемые / новые файлы

### Сервис/формат (минимально)
- **`features/recipes/format.ts`** — добавить RU-форматтеры для карточки (рядом с существующими
  `formatGravityWithPlato` и т.п.):
  - `formatAbvShort(abv)` → `"6,2 %"` (RU-запятая, 1 знак; `null → "—"`);
  - `formatIbuShort(ibu)` → `"45"` (целое; `null → "—"`);
  - `formatOgShort(og)` → `"1.048"` (3 знака, гравитационная конвенция — точка, как в
    `formatGravityWithPlato`; `null → "—"`);
  - `formatBatchVolume(l)` → `"20 л"` (RU-запятая для дробных; `null → "—"`).
  Использовать `Intl.NumberFormat("ru-RU")` для дробных, чтобы запятая была локалью, не replace.

### Новые серверные компоненты (`apps/web/components/recipes/`)
- **`recipe-color-swatch.tsx`** (server) — заливка `srmToHex(srm)`, подпись `SRM N`
  цветом `pickTextColorForSrm(srm)`, видимое/`sr-only` название цвета `beerColorFromSrm(srm).label`
  (a11y — цвет не единственный сигнал). Props: `{ srm: number | null; className?: string }`.
  `srm == null` → нейтральная заливка + `SRM —`.
- **`recipe-card.tsx`** (server) — анатомия §6, данные только из `PublicRecipeListItem`:
  1. Обложка: если `heroImage` → `next/image` (`fill`, `unoptimized`, `placeholder` `blur`/`empty`,
     `blurDataURL`, `sizes` — по образцу `recipe-image-card.tsx:98`); иначе `<RecipeColorSwatch>`.
     Иконка bookmark — визуальная (`lucide` `Bookmark`, `aria-hidden`), без логики.
  2. Бейдж стиля: `${style.name} · ${style.code}` (нейтральный pill, span; Badge-примитива в `@nb/ui`
     нет — span как в `bjcp-filter-sheet`/`public-recipe-list`); если `style == null` — не рендерим.
  3. Название — `line-clamp-2`.
  4. Автор: аватар из `author.image` (`next/image`/`img`) с fallback на инициалы по `displayName`
     (хелпер инициалов — локальный в файле; «настоящих аватаров обычно нет» → инициалы основной кейс)
     + имя. Справа: `rating ? "★ 4,7 (18)" : бейдж «Новый»` (в Фазе B всегда «Новый»).
  5. Строка статов — 4 ячейки `ABV / IBU / OG / Объём` через форматтеры из `format.ts`.
  - **Вся карточка — ссылка** `next/link` на `/recipes/${slug}` с доступным именем (название как
    текст ссылки или `aria-label`). Без `"use client"`.
- **`recipes-grid.tsx`** (server) — responsive `grid` карточек (`grid-cols-1 sm:2 lg:3 xl:4`,
  как сетки в проекте). Props `{ recipes: PublicRecipeListItem[] }`.
- **`recipes-grid-skeleton.tsx`** (server) — `animate-pulse`-плейсхолдеры в той же сетке (паттерн
  скелетона из `app/(public)/bjcp/page.tsx`). Для Suspense fallback.
- **`recipes-empty-state.tsx`** (server) — `variant: "no-results" | "no-recipes"`:
  - `no-results` — «Ничего не найдено» + подсказка сбросить фильтры (ссылка на `/recipes`);
  - `no-recipes` — «Публичных рецептов пока нет» + CTA (создать рецепт / войти).

### Страница
- **`app/(public)/recipes/page.tsx`** (server) — переписать:
  - сигнатура `({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> })`
    (Next 15 — `searchParams` это Promise; `await` перед парсингом);
  - `const filters = parsePublicRecipeFilters(await searchParams)` → `searchPublicRecipes(filters)`;
  - layout: header-секция (заголовок + подзаголовок, тон существующей страницы / `/bjcp`) →
    `<Suspense fallback={<RecipesGridSkeleton/>}>` вокруг асинхронного рендера сетки;
  - результат: `total>0` → `<RecipesGrid>` + пагинация; иначе `<RecipesEmptyState variant=…>`
    (`no-results`, если активны фильтры `q/family/style/color*/abv*/ibu*`; иначе `no-recipes`);
  - **пагинация (SSR, link-based)**: простые `<a href>` prev/next (и кратко номера) на основе
    `searchParams` (сохранять прочие параметры, менять `page`) — крауллабельно по §7. Это **не**
    клиентский интерактив; полноценный numbered-контрол с `useRouter` — Фаза C
    (`recipes-pagination.tsx`). Решение зафиксировать в отчёте.
  - **SEO**: заменить статический `metadata` на `generateMetadata` →
    `alternates.canonical = ${getServerEnv().APP_URL}/recipes` (по паттерну
    `app/(public)/bjcp/[slug]/page.tsx:24-33`), чтобы отфильтрованные/постраничные URL
    канонизировались на `/recipes` (без дублей в индексе). Опц. `rel` prev/next.

### Удаление мёртвого кода (после миграции страницы)
- `features/recipes/service.ts:1725-1733` — `listPublicRecipes`. (Внимание: `mapRecipeListDto`
  используется в 948/1002/1363/1672 — **оставить**, удаляется только сама `listPublicRecipes`.)
- `components/recipes/public-recipe-list.tsx` — единственный потребитель `page.tsx`, станет мёртв.
- `tests/recipe-service.test.ts` — убрать импорт `listPublicRecipes` (:208) и тест
  «listPublicRecipes returns only published public recipes» (:870-879).
- `tests/public-recipes-pages-wiring.test.ts` — убрать `listPublicRecipes` из mock/hoisted/beforeEach
  и тест «public listing page uses listPublicRecipes accessor» (:140-146); **slug-detail тесты
  оставить**.

---

## Тесты (Vitest; компоненты — `renderToStaticMarkup` из `react-dom/server`, как
`tests/bjcp-card-stats.test.ts` / `tests/site-shell.test.ts`)

- **`tests/recipe-card.test.ts`** — рендер `RecipeCard`:
  - фото (`heroImage`) vs цветовой fallback (`heroImage:null` → swatch + `SRM N` + название цвета);
  - состояние `Новый` (`rating:null`) vs рейтинг (`rating:{average,count}` → `★ 4,7 (18)`);
  - форматирование чисел (ABV запятая, OG `1.048`, объём `л`);
  - карточка ссылается на `/recipes/${slug}`, доступное имя присутствует.
- **`tests/recipes-page.test.ts`** (интеграция page) — мок `../features/recipes/service`
  (`searchPublicRecipes`) + при необходимости `@/lib/env`; вызвать `Page({ searchParams })`:
  - `searchParams` → `parsePublicRecipeFilters` → `searchPublicRecipes` вызван с распарсенными
    фильтрами; рендерится grid с элементами;
  - empty states: `total:0` без фильтров → «нет рецептов»; `total:0` с фильтром (`q`) → «не найдено».
  (Заменяет удалённый listing-тест из `public-recipes-pages-wiring.test.ts`.)
- Существующие `tests/public-recipe-query.test.ts`, `tests/beer-color.test.ts`,
  `tests/public-recipes-service.test.ts` — не трогаем (зелёные с Фазы A).

---

## Ограничения Фазы B (строго)
- В UI только рабочие сортировки (без `popular`/`rating`); без фильтра «метод».
- Цвет всегда дублируется числом SRM и названием стиля (a11y).
- Карточка — серверный компонент, без доменной логики, данные только с сервера.
- Вся карточка — ссылка с доступным именем.
- Интерактивные контролы (тулбар/сайдбар/чипы/клиентская пагинация) — НЕ в этой фазе.

## Риски
- **Next 15 `searchParams` — Promise**: обязательно `await` (иначе парсер получит Promise).
- **`next/image` без домен-конфига**: использовать `unoptimized` (как `recipe-image-card.tsx`),
  иначе внешние/`/api/...` URL сломаются. `placeholder="blur"` только при наличии `blurDataURL`.
- **Удаление legacy** ломает 2 теста — синхронно поправить в том же коммите.
- **RU-формат**: для запятой использовать `Intl.NumberFormat("ru-RU")`, не `toFixed().replace`.
- **wiring-тест**: после удаления `listPublicRecipes` mock в `public-recipes-pages-wiring.test.ts`
  не должно остаться висящих ссылок на `publicList`.

## Команды проверки
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run test -- recipe-card recipes-page public-recipe-query beer-color public-recipes-service`
- (опц. визуально) `npm run dev` → `/recipes`, `/recipes?sort=abv_desc&abvMin=6`, `?q=zzz` (empty).
- Перед коммитом: `npm run typecheck`, `npm run lint` (учесть пред-существующие lint-ошибки в чужих
  файлах из отчёта A — файлы этой фазы держать чистыми), `npm run test`.
- Отчёт сохранить в `docs/specs/recipes-page-plan-B.md` (первым шагом исполнения — копия плана).

## Definition of Done (Phase B)
- [x] `/recipes` рендерится server-side из `searchParams` через `searchPublicRecipes`.
- [x] Карточка: цвет/фото, бейдж стиля, автор (аватар/инициалы), статы ABV/IBU/OG/объём, «Новый».
- [x] Цвет продублирован SRM + названием стиля; вся карточка — доступная ссылка.
- [x] Empty states: «не найдено» (сброс) и «нет рецептов» (CTA).
- [x] Suspense + skeleton; `generateMetadata` + canonical на `/recipes`; пагинация — `<a href>`.
- [x] legacy `listPublicRecipes` + `PublicRecipeList` удалены, мёртвые тесты сняты/заменены.
- [x] `typecheck`/`lint`/`test` зелёные; добавлены тесты карточки и интеграции страницы.
- [x] Расхождения/решения (пагинация link-based в B) зафиксированы ниже.

---

## Итоги реализации (Phase B — выполнено)

### Что сделано (по факту)
- **Форматтеры** (`features/recipes/format.ts`): `formatAbvShort` (`6,2 %`, RU-запятая),
  `formatIbuShort` (целое), `formatOgShort` (`1.048`, гравитационная точка), `formatBatchVolume`
  (`20 л`) — через `Intl.NumberFormat("ru-RU")`.
- **Серверные компоненты** (`components/recipes/`): `recipe-color-swatch.tsx` (SRM-заливка + `SRM N`
  + название оттенка), `recipe-card.tsx` (§6: обложка фото/цвет, бейдж стиля, название `line-clamp-2`,
  автор-аватар/инициалы, рейтинг/«Новый», статы; вся карточка — `next/link` на `/recipes/[slug]`),
  `recipes-grid.tsx`, `recipes-grid-skeleton.tsx`, `recipes-empty-state.tsx` (2 варианта),
  `recipes-results.tsx` (async-поддерево: `searchPublicRecipes` → grid + link-based пагинация / empty).
- **Страница** (`app/(public)/recipes/page.tsx`): `searchParams` → `parsePublicRecipeFilters` →
  `<Suspense fallback={<RecipesGridSkeleton/>}>` вокруг `<RecipesResults/>`; `generateMetadata` с
  `alternates.canonical = ${APP_URL}/recipes`.
- **Удалён legacy-путь**: `listPublicRecipes` (service.ts), компонент `public-recipe-list.tsx`;
  сняты мёртвые тесты в `recipe-service.test.ts`, `public-recipes-pages-wiring.test.ts`,
  `recipes-read-components.test.ts`.
- **Тесты**: `tests/recipe-card.test.ts` (7), `tests/recipes-page.test.ts` (4, мок
  `searchPublicRecipes` + `next/image`). Полный прогон web: **564/564** зелёные;
  `npx tsc -p apps/web/tsconfig.json --noEmit` и весь `npm run typecheck` чистые; `next lint` по
  файлам фазы — без ошибок.

### Расхождения с планом (зафиксировано)
1. **`RecipesResults` вынесен в `components/recipes/recipes-results.tsx`**, а не оставлен в
   `page.tsx`: Next генерирует строгий тип route-файла и запрещает посторонние именованные экспорты
   (`OmitWithTag ... satisfies { [x]: never }`). Вынос также упростил unit-тест поддерева
   (`renderToStaticMarkup` не умеет рендерить suspending RSC-дерево — тестируем уже-зарезолвенный
   результат `await RecipesResults(...)`).
2. **`searchParams` типизирован как `Promise<RawSearchParams>`** (Next 15 `PageProps` требует
   `Promise<any>`), `await` перед парсингом.
3. **Пагинация — SSR link-based** (`<a href>` Назад/Дальше + «Страница X из Y», `rel` prev/next,
   сохранение query). Полноценный numbered-контрол с клиентским роутингом — Фаза C
   (`recipes-pagination.tsx`).
4. **`next/image`** с `unoptimized` (как `recipe-image-card.tsx`); `placeholder="blur"` только при
   наличии `blurDataURL`. В тестах `next/image` мокается на простой `<img>`.
5. В UI показаны только рабочие сортировки/фильтры; `popular`/`rating`/«метод» не выводятся
   (нет данных — отчёт Phase A). `rating` всегда `null` → бейдж «Новый».
