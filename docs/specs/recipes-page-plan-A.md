# Phase A — Данные и сервис для редизайна `/recipes` (NB)

## Context

Редизайн публичной страницы `/recipes` из плоского списка в витрину для discovery (ТЗ: `docs/specs/recipes-page.md`). Phase A — **только данные + service layer, без UI**: контракты, Zod-парсер `searchParams`, расширение `listPublicRecipes()` (фильтры/сортировка/пагинация **в SQL**), SRM-хелперы для карточки, миграция индексов, тесты сервиса и утилит.

Инварианты проекта (строго): фильтрация/сортировка/пагинация только в SQL на Drizzle (запрещён «load all → filter in memory»); доменная логика в service layer; на странице только `publication_state = 'published'`; без N+1; нормализация на сервере.

> На исполнении (после выхода из plan mode) **первым шагом** скопировать этот план в `docs/specs/recipes-page-plan-A.md` (в plan mode редактировать туда нельзя).

---

## §0 — Сверка ТЗ с реальным кодом (расхождения)

| Тема | ТЗ предполагает | Реальный код | Решение |
|---|---|---|---|
| `listPublicRecipes` | расширить под фильтры | `listPublicRecipes(limit=50): RecipeListItemDto[]`, фильтр `published` + `orderBy updatedAt` в SQL, **без join-ов** (автор/hero/стиль не подтягиваются) — `service.ts:1706` | Расширяем сигнатуру + добавляем join-ы |
| Стиль на рецепте | возможно считается style-fit на лету; денорм `style_code`/`style_family` | **хранится** `recipes.styleId varchar(64)` = id фикстуры brewing-core (`getBeerStyleById`/`getStyleRangeById`, `service.ts:395`) | Денорм НЕ нужен; фильтр через styleId + индекс |
| Семейство BJCP | денорм `style_family` | связка через `BeerStyle.styleKey` (=`full_bjcp_id`) ↔ `getBjcpCatalogData().families[].styleIds` (1:1, словарь `/bjcp`) | **Унификация с `/bjcp`** (вариант Б): family→styleKey→brewing-core id→`WHERE styleId IN (...)`, без новой колонки |
| `color` | SRM или EBC? | `recipes.color doublePrecision` = **SRM** (из `calculateColor`) | `colorSrm = color`; `colorEbc = srmToEbc(color)` (`@nb/brewing-core`) |
| og/fg/abv/ibu | колонки | реальные колонки `doublePrecision` | используем напрямую |
| `publishedAt` | sort `newest = publishedAt desc` | **колонки нет**, есть `createdAt`/`updatedAt` | `newest = updatedAt desc` (подтверждено); `publishedAt` в DTO маппим из `updatedAt` |
| `srmToHex` / палитра | добавить, если нет | **есть** `beerColorFromSrm(srm): {hex,label,textColor}` + `SRM_COLOR_MAP` (`beer-color.ts`) | Reuse: тонкие `srmToHex` / `pickTextColorForSrm` поверх существующей палитры |
| Аватары авторов | в схеме нет → инициалы | **есть** `users.image text` | `author.image` в DTO; инициалы как fallback в UI |
| Hero-image | `thumbUrl` + `blurDataUrl` | `recipes.heroImageId` → `recipe_images` (`storageKeyThumb`, `blurDataUrl`); роут `/api/recipe-images/[imageId]/[variant]` | LEFT JOIN `recipe_images`, `thumbUrl` через роут |
| Клоны / `popular` | трекинг клонов | `cloneRecipe` НЕ ставит `cloned_from`; нет `clone_count`/`view_count` | `cloneCount = 0`; sort `popular` **не реализуем** (fallback на newest) |
| Метод all_grain/biab/extract | фильтр в Фазе A | **нигде не персистится** (нет колонки, нет в `processMeta`; BeerXML хардкодит "All Grain") | **Отложить** (подтверждено): тип в контрактах остаётся, фильтр/бейдж не реализуем |
| Рейтинги | Фаза D | таблицы нет | Phase D, вне Phase A |

## §10 — Закрытые вопросы

1. **Клоны:** не трекаются → `popular` вне Phase A, `cloneCount=0`.
2. **Стиль:** хранится `styleId` (id фикстуры brewing-core). Денорм не нужен.
3. **Метод:** не хранится → отложен.
4. **Аватары:** есть `users.image`.
5. **Default sort:** `newest` = `updatedAt desc`.

---

## Phase A — затрагиваемые файлы

### Новые
- `apps/web/features/recipes/public-recipe-query.ts` — **чистые** хелперы (тестируемы без БД): `parsePublicRecipeFilters` (Zod), `resolvePublicRecipeSort`, `resolvePagination`, `resolveStyleScope` (family/style → set styleId через фикстуры + `getBjcpCatalogData`).
- `docs/specs/recipes-page-plan-A.md` — копия этого плана (первый шаг исполнения).
- Тесты: `apps/web/tests/public-recipe-query.test.ts`, `apps/web/tests/beer-color.test.ts`, расширение `apps/web/tests/recipe-service.test.ts` (или новый `public-recipes-service.test.ts`).

### Изменяемые
- `apps/web/features/recipes/contracts.ts` — новые типы (см. ниже).
- `apps/web/features/recipes/service.ts` — переписать `listPublicRecipes`.
- `apps/web/features/recipes/beer-color.ts` — добавить `srmToHex` / `pickTextColorForSrm` (reuse `SRM_COLOR_MAP`).
- `packages/db/src/schema.ts` — добавить индекс(ы) (см. миграция).

---

## 1. Контракты (`contracts.ts`)

Добавить (имена подогнать под стиль файла; существующий `RecipeListItemDto` не трогаем — author-side):

```ts
export const recipeMethods = ["all_grain", "biab", "extract"] as const;
export type RecipeMethod = (typeof recipeMethods)[number];

export const publicRecipeSorts = [
  "newest", "abv_desc", "abv_asc", "ibu_desc", "ibu_asc",
  "color_asc", "color_desc", "name", "popular", "rating"
] as const;
export type PublicRecipeSort = (typeof publicRecipeSorts)[number];

export interface PublicRecipeFilters {
  q?: string;
  family?: string;          // id семейства из getBjcpCatalogData()
  styleCode?: string;       // styleKey / bjcp код
  colorMinSrm?: number; colorMaxSrm?: number;
  abvMin?: number; abvMax?: number;
  ibuMin?: number; ibuMax?: number;
  method?: RecipeMethod[];  // парсится, но в Phase A в WHERE НЕ применяется (нет данных)
  sort: PublicRecipeSort;   // default 'newest'
  page: number;             // 1-based, default 1
  pageSize: number;         // default 24, max 48
}

export interface PublicRecipeListItem {
  id: string; slug: string; name: string;
  author: { id: string; displayName: string | null; image: string | null };
  style: { code: string; name: string } | null;
  og: number | null; fg: number | null; abv: number | null; ibu: number | null;
  colorSrm: number | null; colorEbc: number | null;
  batchSizeL: number | null;
  method: RecipeMethod | null;       // null в Phase A
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  cloneCount: number;                // 0 в Phase A
  rating: { average: number; count: number } | null; // null до Phase D
  publishedAt: string;               // ISO, маппится из updatedAt
}

export interface PublicRecipeListResult {
  items: PublicRecipeListItem[];
  total: number; page: number; pageSize: number;
  facets?: { families: {...}[]; styles: {...}[] }; // опц., см. §4
}
```

**Zod-парсер `parsePublicRecipeFilters(searchParams)`** (в `public-recipe-query.ts`):
- `q` trim, max длина;
- `family`/`styleCode` строки;
- диапазоны `z.coerce.number` + **clamp** (color 0..80, abv 0..20, ibu 0..200), min ≤ max (иначе своп/сброс);
- `method` csv → фильтр по `recipeMethods`;
- `sort` — `enum`, невалид → `newest`; `popular`/`rating` в Phase A маппятся на `newest` (нет данных);
- `page` ≥ 1 default 1; `pageSize` default 24, max 48.
- Любой мусор → дефолты, не бросать.

## 2. `listPublicRecipes(filters): Promise<PublicRecipeListResult>`

- Сигнатура меняется с `(limit=50)` на `(filters: PublicRecipeFilters)`. **Проверить и обновить вызовы** (текущий `app/(public)/recipes/page.tsx`, тесты wiring — на Phase B страница переписывается; на Phase A временно вызвать с дефолтами).
- Один Drizzle `db.select({...}).from(recipes)` + `leftJoin(users, eq(users.id, recipes.authorId))` + `leftJoin(recipeImages, eq(recipeImages.id, recipes.heroImageId))`.
- `WHERE and(...)`:
  - `eq(recipes.publicationState, "published")` — всегда;
  - `q` → `ilike(recipes.title, %q%)` (опц. OR по `users.displayName`);
  - `family`/`styleCode` → `inArray(recipes.styleId, styleIdScope)` (scope из `resolveStyleScope`, async, через `getBjcpCatalogData` + фикстуры; пустой scope → вернуть 0 результатов);
  - диапазоны color/abv/ibu → `gte`/`lte` по колонкам;
  - `method` — **не применяется** (TODO-коммент: нет данных).
- `ORDER BY` по `resolvePublicRecipeSort`: `newest→updatedAt desc`, `abv_desc/asc`, `ibu_*`, `color_*`, `name→title asc`; **вторичный ключ `updatedAt desc`** для стабильности.
- `limit/offset` из `resolvePagination`.
- Отдельный `db.select({ value: count() }).from(recipes).where(<тот же where>)` для `total`.
- Маппинг строки → `PublicRecipeListItem`: стиль через `getBeerStyleById(styleId)` (`code = bjcpId`, `name = nameRu ?? name`) — статическая фикстура, **не N+1**; `colorEbc = srmToEbc(color)`; `batchSizeL` из `batchSizeNormalizedQuantity` (проверить нормализованную единицу — l/ml — и привести к литрам); `heroImage.thumbUrl` = `/api/recipe-images/${heroImageId}/thumb` если `storageKeyThumb`, иначе `null`; `author.image`; `publishedAt = updatedAt.toISOString()`.
- **Без N+1**: всё join-ами/одним select; стиль — in-memory из фикстур.

## 3. Style scope (`resolveStyleScope`) — унификация с `/bjcp`

- `family` → `getBjcpCatalogData()` → `families.find(id===family).styleIds` (+ при желании cross-listed) = массив `styleKey`.
- `styleCode` → если это `styleKey`/код, добавить его.
- Построить `Map<styleKey, BeerStyle.id[]>` из `beerStyleFixtures` (`styleKey → id`), развернуть в плоский `string[]` для `inArray(recipes.styleId, ids)`.
- Пустой результат (неизвестное семейство) → сервис возвращает пустой список (не падать).

## 4. Фасеты (опц., не блокирует Phase A)
Поле `facets` опциональное. Реализация — отдельный `GROUP BY styleId` запрос с тем же WHERE (без стилевого измерения) + агрегация в семейства через фикстуры. **Можно отложить на Phase C** — оставить поле опциональным.

## 5. SRM-хелперы (`beer-color.ts`) — reuse
```ts
export function srmToHex(srm: number): string { return beerColorFromSrm(srm).hex; }
export function pickTextColorForSrm(srm: number): string { return beerColorFromSrm(srm).textColor; }
```
(Переиспользуют существующий `SRM_COLOR_MAP` / `beerColorFromSrm`; clamp уже в палитре через `DARKEST` fallback.)

---

## Миграция (db:generate → db:migrate)

В `packages/db/src/schema.ts` добавить в `recipes` индексы под фильтр/сортировку:
- `recipes_style_id_idx` on `styleId` — **обязательно** (для `inArray` фильтра по стилю/семейству).
- (под сортировку, опц., но по ТЗ §3.2) `recipes_abv_idx`, `recipes_ibu_idx`, `recipes_color_idx`, `recipes_updated_at_idx`, `recipes_title_idx`. `recipes_publication_state_idx` уже есть.
- Партиал-индексы `WHERE publication_state='published'` — опционально, отметить как возможную оптимизацию, не обязательную при текущем объёме.

Шаги: `npm run db:generate` → проверить SQL миграции → `npm run db:migrate`. **Только добавление индексов**, без изменения колонок/данных → безопасно, без бэкафилла.

---

## Тесты (Vitest)

Тест-стиль проекта: сервис-тесты **мокают `@nb/db`** in-memory (см. `recipe-service.test.ts`), реальной БД нет.

1. `public-recipe-query.test.ts` (чистые функции, без БД, основной объём):
   - `parsePublicRecipeFilters`: валидные → фильтры; мусор/вне диапазона → дефолты/клампы; `popular`/`rating`/невалид → `newest`; `pageSize` clamp 48; csv `method`.
   - `resolvePublicRecipeSort`: каждое значение → ожидаемая колонка/направление + вторичный ключ.
   - `resolvePagination`: page/pageSize → limit/offset.
   - `resolveStyleScope`: family → ожидаемый набор styleId (вкл. подстили; проверить связку styleKey↔id); неизвестное семейство → пусто.
2. `beer-color.test.ts`: `srmToHex` на граничных SRM (1,4,10,20,40+); `pickTextColorForSrm` (светлый текст на тёмном пиве).
3. `listPublicRecipes`: расширить `@nb/db` мок до поддержки `db.select().from().leftJoin().where().orderBy().limit().offset()` + `count` (по образцу существующего hoisted-мока); проверить: только `published`; корректный WHERE/ORDER на каждый фильтр и sort; пагинация (total/page/pageSize); маппинг DTO (стиль из фикстур, colorEbc, heroImage url, author.image, cloneCount=0, rating=null).

---

## Риски
- **Вызовы `listPublicRecipes`**: смена сигнатуры ломает текущую `page.tsx` и wiring-тесты. На Phase A — вызвать с дефолтными фильтрами/обновить тест; полноценно страница переписывается на Phase B.
- **Расширение `@nb/db` мока** под query-builder `db.select(...)` нетривиально — заложить время; чистые хелперы покрывают большую часть логики без мока.
- **`batchSizeL`**: нормализованная единица может быть `ml` (в wiring-тесте `batchSizeNormalizedUnit:"ml"`) — обязательно конвертировать в литры, не брать число как есть.
- **styleKey↔id связка**: подстили (`id="21B-white-ipa"`, `styleKey="21B-White IPA"`) — строить Map по `styleKey`, не по `bjcpId` (bjcpId у подстилей не уникален).
- **`method`/`popular`/`rating`** присутствуют в типах, но в Phase A не дают данных — задокументировать TODO, в UI (позже) не показывать «мёртвые» опции.

## Команды проверки
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run test -- public-recipe-query beer-color recipe-service` (или конкретные файлы)
- `npm run db:generate` (проверить diff миграции) → `npm run db:migrate`
- Перед коммитом (по ТЗ): `npm run typecheck`, `npm run lint`, `npm run test`.

## Definition of Done (Phase A)
- [x] Контракты + Zod-парсер с клампами/дефолтами.
- [x] Витринный сервис — фильтры/сорт/пагинация в одном SQL + count; без N+1; только published.
- [x] Унификация фильтра стиля/семейства с `/bjcp` (без новой колонки).
- [x] `srmToHex`/`pickTextColorForSrm` (reuse палитры).
- [x] Индексы (`recipes_style_id_idx` + sort-индексы), миграция применена.
- [x] Тесты сервиса + чистых хелперов + SRM зелёные; typecheck чистый.
- [x] Расхождения с ТЗ и решения §10 — ниже.

---

## Итоги реализации (Phase A — выполнено)

### Что сделано (по факту)
- **Контракты** (`features/recipes/contracts.ts`): `recipeMethods`, `PublicRecipeSort`/`publicRecipeSorts`, `PublicRecipeFilters`, `PublicRecipeListItem`, `PublicRecipeFacets`, `PublicRecipeListResult`, `default/maxPublicRecipePageSize`.
- **Чистые хелперы** (`features/recipes/public-recipe-query.ts`): `parsePublicRecipeFilters` (Zod-словарь дефолтов/клампов/свопов), `resolvePublicRecipeSort`, `resolvePagination`, `resolveStyleScope` (family/style → set `styleId` через `getBjcpCatalogData` + `beerStyleFixtures`, мост по `styleKey`).
- **Сервис** (`features/recipes/service.ts`): `searchPublicRecipes(filters)` — один Drizzle `select` с `leftJoin(users)` + `leftJoin(recipeImages)`, WHERE/ORDER/limit/offset в SQL, отдельный `count`-запрос; маппинг в `PublicRecipeListItem` (стиль из фикстур, `colorEbc` через `srmToEbc`, `batchSizeL` из normalized ml, hero-thumb URL).
- **SRM** (`features/recipes/beer-color.ts`): `srmToHex`, `pickTextColorForSrm` — тонкие обёртки над `beerColorFromSrm`/`SRM_COLOR_MAP`.
- **БД**: `packages/db/src/index.ts` — добавлены `gte`/`lte` в re-export drizzle-операторов; `packages/db/src/schema.ts` — 6 индексов (`recipes_style_id_idx`, `recipes_abv_idx`, `recipes_ibu_idx`, `recipes_color_idx`, `recipes_updated_at_idx`, `recipes_title_idx`); миграция `drizzle/0030_public_recipes_indexes.sql` (ручная, idempotent `CREATE INDEX IF NOT EXISTS`) + запись в `_journal.json`. Применена (`db:migrate`), индексы подтверждены в БД.
- **Тесты**: `tests/public-recipe-query.test.ts` (14), `tests/beer-color.test.ts` (4), `tests/public-recipes-service.test.ts` (6, мок `@nb/db` с поддержкой `db.select(...)`-чейна). Полный прогон: **556/556** зелёные. `npx tsc -p apps/web/tsconfig.json --noEmit` и весь `npm run typecheck` чистые.

### Расхождения с ТЗ/планом (важно для Phase B)
1. **Новая функция вместо переписывания.** Реализована как `searchPublicRecipes(filters): PublicRecipeListResult` **рядом** со старой `listPublicRecipes(limit)`. Причина: смена сигнатуры/формы DTO ломала бы текущую `page.tsx` + `PublicRecipeList` + `RecipeStatsSummary` (тянет UI-работу в data-фазу) и теряла бы `styleId`/style-fit. Старый путь оставлен нетронутым и зелёным. **Phase B**: страница переходит на `searchPublicRecipes`, после чего legacy `listPublicRecipes` можно удалить.
2. **Денормализация стиля не делалась** — стиль уже на рецепте (`styleId`); семейство фильтруется через `/bjcp`-каталог (`resolveStyleScope`), без колонки `style_family`. Поддерживает кросс-листинг.
3. **Миграция:** `db:generate` в этом репозитории генерирует ПОЛНЫЙ снапшот (snapshots в `meta/` не ведутся, миграции рукописные). Поэтому сгенерированный full-файл удалён и заменён ручной index-миграцией по конвенции репозитория. Учесть при будущих миграциях.
4. **`method`/`popular`/`rating`** присутствуют в типах, но без данных: method-фильтр не применяется (нет колонки), `popular`/`rating` в сортировке fallback на `newest`. В UI (Phase C/D) «мёртвые» опции не показывать.
5. **`publishedAt`** в DTO маппится из `updatedAt` (колонки `published_at` нет); дефолтная сортировка `newest = updatedAt desc`.
6. **Lint:** `npm run lint` падает на **пред-существующих** ошибках в чужих файлах (`app/(app)/app/ingredients/error.tsx`, `components/ingredients/admin-ingredient-form.tsx`) — не входят в диф Phase A. Файлы этой фазы lint-чистые.

### Решения §10 (зафиксировано)
1. Клоны не трекаются → `popular` вне Phase A, `cloneCount=0`.
2. Стиль хранится (`styleId`, id фикстуры brewing-core) → денорм не нужен.
3. Метод не персистится → отложен.
4. Аватары есть (`users.image`) → `author.image` в DTO.
5. Default sort = `newest` (`updatedAt desc`).
