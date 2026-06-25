# Phase D — Рейтинги `/recipes` (первый write-path пользователя) — план

> **Первый шаг исполнения (после выхода из plan mode):** скопировать этот план в
> `docs/specs/recipes-page-plan-D.md` (в plan mode туда писать нельзя — конвенция Фаз A/B/C).
> Туда же по завершении дописываются «Итоги реализации».

## Context

ТЗ `docs/specs/recipes-page.md` (§3.4, §9 Фаза D, §11). Фазы A (data/service), B (SSR-список),
C (URL-контролы) закоммичены. Сейчас `/recipes` — рабочая витрина; в карточке `rating` всегда `null`
→ бейдж «Новый» (`recipe-card.tsx` уже умеет рисовать звёзды при `rating != null`), сорт `rating`
fallback'ится в `newest`, опции «по рейтингу» в тулбаре нет.

Фаза D добавляет **систему оценок** — это **первый путь записи от пользователя** на этой странице,
поэтому жёсткие правила безопасности (auth/ownership/валидация/транзакционные агрегаты) — в приоритете.
Цель: аутентифицированный пользователь ставит 1–5 звёзд (одна оценка на рецепт, upsert) на странице
детального рецепта `/recipes/[slug]`; денормализованные `rating_avg`/`rating_count` на `recipes`
питают звёзды в карточке и сортировку «по рейтингу».

---

## §0 — Сверка ТЗ с реальным кодом (расхождения, следуем коду)

| Тема | ТЗ §3.4 | Реальный код | Решение |
|---|---|---|---|
| Тип id | `id TEXT PK`, FK `TEXT` | `recipes`/`users` = `uuid().defaultRandom()` (`schema.ts:467,46`) | **uuid** для `recipe_ratings.id`/FK (следуем коду, как Фаза A) |
| `rating_avg REAL` | REAL | в проекте дробные = `doublePrecision` | `doublePrecision("rating_avg")` (note: REAL≈ок) |
| user_id FK onDelete | не указан | `recipes.authorId`/`sessions.userId` → `cascade` | `onDelete: "cascade"` на оба FK (конвенция) |
| Триггер vs сервис | «или через триггер» | транзакции в сервисе — конвенция (`recipe-images/service.ts`) | пересчёт агрегатов **в сервисной транзакции**, без триггера |
| UI оценки | «минимальный UI на `/recipes/[slug]`» | детальная страница сейчас сессию НЕ читает | добавляем чтение сессии + клиентский звёздный инпут + server action |

**Конвенции, которые переиспользуем (не изобретать):**
- **Индексы — в табличном определении** (3-й аргумент `pgTable`), как источник правды — Фаза A
  (`recipes_*_idx`, `schema.ts:500-514`). `index(...)`, `uniqueIndex(...)`, `check("name", sql\`…\`)`.
- **Миграции рукописные**, идемпотентные (`CREATE … IF NOT EXISTS`); `db:generate` даёт полный снапшот
  и отбрасывается. Последняя — `0030_public_recipes_indexes.sql`; нумерация `00NN_*`; запись в
  `drizzle/meta/_journal.json` (idx/tag/when/breakpoints).
- **Транзакции:** `db.transaction(async (tx) => { … })` (`features/recipe-images/service.ts:291`).
- **Auth:** `lib/auth.ts` — `getSessionUser()` (→ user | null), `requireUser()` (→ user | redirect).
  user.id — uuid, user.role — enum.
- **Server actions:** `"use server"`, co-located с роутом, `getSessionUser/requireUser` → сервис →
  `revalidatePath(...)` → result-объект; ошибки Zod/доменные маппятся в сообщение
  (`app/(app)/app/recipes/actions.ts`).
- **DTO:** `RecipeDetailDto` уже содержит `id`, `authorId`, `publicationState` (через
  `RecipeListItemDto`) — нужные для ownership-проверки и upsert.
- **Драйзл-операторы** реэкспортятся из `@nb/db` (`and,eq,count,desc,asc,sql,inArray,…`).
- **Карточка `recipe-card.tsx`** уже рисует `★ avg (count)` при `rating != null`, иначе «Новый» —
  менять не нужно; достаточно заполнить DTO.

---

## Затрагиваемые файлы

### Новые
- `packages/db/drizzle/0031_recipe_ratings.sql` — рукописная миграция (таблица + 2 колонки + индексы).
- `apps/web/components/recipes/recipe-rating-form.tsx` — **client** звёздный инпут.
- `apps/web/app/(public)/recipes/[slug]/actions.ts` — **server actions** (`"use server"`).
- Тесты: `tests/recipe-ratings-service.test.ts`, `tests/recipe-rating-form.test.ts`,
  `tests/recipe-rating-action.test.ts` (+ расширение существующих, см. ниже).
- `docs/specs/recipes-page-plan-D.md` — копия этого плана (первый шаг исполнения).

### Изменяемые
- `packages/db/src/schema.ts` — таблица `recipeRatings`; колонки `ratingAvg`/`ratingCount` + индекс на `recipes`.
- `packages/db/drizzle/meta/_journal.json` — запись миграции 0031.
- `apps/web/features/recipes/contracts.ts` — Zod `recipeRatingInputSchema`; `RecipeRatingDto`;
  `rating` в `RecipeDetailDto`.
- `apps/web/features/recipes/service.ts` — `rateRecipe`/`deleteRecipeRating`/`getUserRecipeRating`;
  `mapPublicRecipeListItem` (заполнить `rating`); `mapRecipeDetailDto` (заполнить `rating`); сорт `rating`.
- `apps/web/features/recipes/public-recipe-query.ts` — `PublicRecipeSortKey += "rating"`, план сорта
  rating (`desc`, `nullsLast`).
- `apps/web/features/recipes/recipes-url.ts` — добавить опцию `{ value: "rating", label: "По рейтингу" }`.
- `apps/web/app/(public)/recipes/[slug]/page.tsx` — читать сессию + текущую оценку, прокинуть в страницу.
- `apps/web/components/recipes/public-recipe-page.tsx` — секция рейтинга (агрегат + форма).

---

## 1. БД (schema.ts + миграция)

**Таблица `recipeRatings`** (индексы/CHECK — в определении, источник правды):
```ts
export const recipeRatings = pgTable("recipe_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  recipeUserUidx: uniqueIndex("recipe_ratings_recipe_user_uidx").on(table.recipeId, table.userId),
  recipeIdIdx: index("recipe_ratings_recipe_id_idx").on(table.recipeId),
  starsCheck: check("recipe_ratings_stars_chk", sql`${table.stars} between 1 and 5`)
}));
```
**На `recipes`** добавить: `ratingAvg: doublePrecision("rating_avg")` (nullable),
`ratingCount: integer("rating_count").default(0).notNull()`, и в индексы —
`ratingAvgIdx: index("recipes_rating_avg_idx").on(table.ratingAvg)`.
(`check`, `integer`, `text`, `doublePrecision`, `index`, `uniqueIndex`, `sql` уже импортированы/используются.)

**Миграция `0031_recipe_ratings.sql`** (идемпотентно, по образцу 0030; FK-констрейнты обернуть в
guard `DO $$ … IF NOT EXISTS … $$` либо мирроринг существующего синтаксиса ADD CONSTRAINT):
`CREATE TABLE IF NOT EXISTS "recipe_ratings" (… CONSTRAINT "recipe_ratings_stars_chk" CHECK (stars between 1 and 5))`;
FK на `recipes(id)`/`users(id)` `ON DELETE cascade`; `CREATE UNIQUE INDEX IF NOT EXISTS recipe_ratings_recipe_user_uidx`;
`CREATE INDEX IF NOT EXISTS recipe_ratings_recipe_id_idx`;
`ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rating_avg" double precision`;
`ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL`;
`CREATE INDEX IF NOT EXISTS recipes_rating_avg_idx`. + запись `idx:31, tag:"0031_recipe_ratings"` в `_journal.json`.

## 2. Контракты (contracts.ts)

```ts
export const recipeRatingInputSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional().nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
});
export type RecipeRatingInput = z.infer<typeof recipeRatingInputSchema>;
export type RecipeRatingDto = { stars: number; body: string | null };
```
В `RecipeDetailDto` добавить `rating: { average: number; count: number } | null;` (как в `PublicRecipeListItem`).

## 3. Сервис (service.ts) — доменная логика тут

- **`getUserRecipeRating(userId, recipeId): Promise<RecipeRatingDto | null>`** — `db.query.recipeRatings.findFirst`
  по `(recipeId, userId)`.
- **`rateRecipe(userId, recipeId, payload: unknown): Promise<{average,count}>`**:
  1. `recipeRatingInputSchema.parse(payload)` (валидация stars 1..5 + длина body на сервере).
  2. `ensurePublicRecipe(recipeId)` — гарантирует **published** (иначе `NOT_FOUND/FORBIDDEN`);
     **оценивать можно только published**.
  3. `if (recipe.authorId === userId) throw new Error("OWN_RECIPE")` — **нельзя оценивать свой рецепт**.
  4. `db.transaction(async (tx) => { … })`:
     - **залочить строку рецепта** (`SELECT 1 FROM recipes WHERE id = … FOR UPDATE` через `tx.execute(sql…)`)
       — сериализует параллельные пересчёты, исключает дрейф агрегатов;
     - **upsert**: `tx.insert(recipeRatings).values({recipeId,userId,stars,body})
       .onConflictDoUpdate({ target:[recipeRatings.recipeId, recipeRatings.userId],
       set:{ stars, body, updatedAt: new Date() }})` (UNIQUE → одна оценка/пользователь);
     - **пересчёт из источника**: `SELECT avg(stars)::float, count(*) FROM recipe_ratings WHERE recipe_id = …`;
     - `tx.update(recipes).set({ ratingAvg, ratingCount })` — агрегаты в **той же транзакции**, что и запись.
- **`deleteRecipeRating(userId, recipeId)`** — транзакция: lock рецепта → `tx.delete(recipeRatings)`
  по `(recipeId,userId)` → пересчёт (пусто → `avg=null, count=0`) → `tx.update(recipes)`.
- **`mapPublicRecipeListItem`** — добавить в select/`PublicRecipeRow` поля `ratingAvg`/`ratingCount`,
  `rating = row.ratingCount > 0 ? { average: roundTo(row.ratingAvg!, 1), count: row.ratingCount } : null`
  (count==0 → `null` → карточка покажет «Новый»). Аналогично `count`-запрос не трогаем.
- **`mapRecipeDetailDto`** — заполнить `rating` из `recipe.ratingAvg/ratingCount` (строка уже грузится целиком).
- **Сорт `rating`**: в `public-recipe-query.ts` — `PublicRecipeSortKey += "rating"`,
  план `resolvePublicRecipeSort("rating") → { key:"rating", direction:"desc", nullsLast:true }`
  (расширить `PublicRecipeSortPlan` опц. `nullsLast?: boolean`). В `service.ts`:
  `publicRecipeSortColumns.rating = recipes.ratingAvg`; при `nullsLast` строить порядок
  `sql\`${sortColumn} desc nulls last\``, вторичный — `desc(recipes.updatedAt)` (publishedAt≈updatedAt).

## 4. Server actions (`app/(public)/recipes/[slug]/actions.ts`, `"use server"`)

- `rateRecipeAction({ recipeId, slug, stars, body })`:
  `const user = await getSessionUser();` → если `null` вернуть `{ ok:false, code:"AUTH" }`
  (**userId берётся только на сервере**, клиенту не доверяем); `try { const r = await rateRecipe(user.id, recipeId, { stars, body }); revalidatePath(\`/recipes/${slug}\`); revalidatePath("/recipes"); return { ok:true, rating:r }; }`
  маппинг ошибок: `OWN_RECIPE`/`NOT_FOUND`/`FORBIDDEN`/ZodError → `{ ok:false, code }`.
- `deleteRecipeRatingAction({ recipeId, slug })` — аналогично через `deleteRecipeRating`.
- Выбор `getSessionUser` (не `requireUser`): публичная страница не должна редиректить на /login —
  возвращаем `AUTH`, UI показывает CTA «Войдите, чтобы оценить».

## 5. UI

- **`app/(public)/recipes/[slug]/page.tsx`**: после `getPublicRecipeBySlug` —
  `const user = await getSessionUser(); const userRating = user ? await getUserRecipeRating(user.id, recipe.id) : null;`
  прокинуть `currentUserId={user?.id ?? null}` и `userRating` в `<PublicRecipePage>`.
  (Замечание: чтение cookie через `getSessionUser` делает страницу динамической — приемлемо; зафиксировать.)
- **`public-recipe-page.tsx`**: новые пропсы `currentUserId`, `userRating`; новая секция — агрегат
  `recipe.rating ? ★ average (count) : «Оценок пока нет»` + `<RecipeRatingForm>`.
- **`recipe-rating-form.tsx`** (`"use client"`): 5 звёзд-кнопок (`aria-label`, клавиатура),
  опциональный комментарий (textarea), submit через `rateRecipeAction` в `useTransition`;
  показывает текущую `userRating`; кнопка «Убрать оценку» → `deleteRecipeRatingAction`.
  Состояния: не залогинен → ссылка `/login`; свой рецепт (`currentUserId === recipe.author.id`) →
  инпут скрыт/задизейблен с пояснением (сервер всё равно запрещает — defense-in-depth).
- **`recipes-url.ts`**: добавить `{ value: "rating", label: "По рейтингу" }` в `recipeSortOptions` —
  опция автоматически появляется в `recipes-toolbar` (теперь данные есть).
- **`recipe-card.tsx`** — без изменений (звёзды vs «Новый» уже реализованы, питается из DTO).

---

## Тесты (Vitest)

- **`tests/recipe-ratings-service.test.ts`** (мок `@nb/db` с `transaction`/`insert.onConflictDoUpdate`/
  `delete`/aggregate-select; прецедент мока транзакции — `tests/recipe-inventory-service.test.ts`):
  корректность `avg`/`count` при insert/update/delete; **upsert** (повторная оценка обновляет, не плодит);
  **запрет своего рецепта** (`OWN_RECIPE`); **только published** (draft → throw); пересчёт пусто→`null/0`.
- **`tests/recipe-rating-action.test.ts`** (мок `getSessionUser` + сервис): нет сессии → `AUTH`;
  `OWN_RECIPE` → маппинг; успех → `revalidatePath` вызван.
- **`tests/public-recipe-query.test.ts`** (+): `resolvePublicRecipeSort("rating")` → `{rating,desc,nullsLast}`.
- **`tests/public-recipes-service.test.ts`** (+): сорт `rating` строит ORDER BY с **NULLS LAST**
  + вторичный `updatedAt desc`; DTO `rating` заполнен при `ratingCount>0`, иначе `null`.
- **`tests/recipe-card.test.ts`** (+): `rating={average,count}` (count>0) → звёзды; `rating:null` → «Новый».
- **`tests/recipe-rating-form.test.ts`** (`renderToStaticMarkup` + мок `next/navigation`): рендер звёзд;
  не залогинен → CTA `/login`; свой рецепт → инпут задизейблен.

---

## Жёсткие правила (контроль при ревью — первый write-path)
- Оценивать может **только аутентифицированный**; `userId` берётся **только на сервере** (из `getSessionUser`),
  никогда из клиентского payload.
- **Нельзя оценивать свой рецепт** — проверка `recipe.authorId === userId` на сервере (плюс UI-гард).
- **UNIQUE(recipe_id,user_id)** + `onConflictDoUpdate` → одна оценка/пользователь (upsert).
- `stars` 1..5 и длина `body` валидируются на сервере (Zod) **и** CHECK в БД.
- Оценивать можно **только published** (через `ensurePublicRecipe`).
- Агрегаты `rating_avg/rating_count` обновляются **в той же транзакции**, с **row-lock** рецепта —
  расхождение невозможно.

## Риски
- **Мок `@nb/db` под транзакцию/upsert/aggregate** — нетривиально; опереться на
  `recipe-inventory-service.test.ts`; чистую логику (Zod, сорт-план) тестировать отдельно без БД.
- **NULLS LAST** — нет хелпера у drizzle `desc()`; строить через `sql\`… desc nulls last\``.
- **FK ADD CONSTRAINT идемпотентность** — `IF NOT EXISTS` не поддерживается для constraints;
  обернуть в `DO/EXCEPTION` guard или принять, что миграция применяется один раз (как 0004).
- **Детальная страница станет динамической** (чтение cookie) — приемлемо; зафиксировать в отчёте.
- **REAL vs doublePrecision** — используем `doublePrecision` (конвенция проекта), функционально эквивалентно.
- **Гонка двух одновременных оценок** — снимается `SELECT … FOR UPDATE` по строке рецепта внутри транзакции.

## Команды проверки
- `npm run db:generate` (сверить diff, отбросить полный снапшот) → `npm run db:migrate` (применить 0031).
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npx vitest run recipe-ratings-service recipe-rating-action recipe-rating-form public-recipe-query public-recipes-service recipe-card` (в `apps/web`).
- Полный прогон web: `npx vitest run`; перед коммитом — `npm run typecheck`, `npm run lint`
  (файлы фазы держать lint-чистыми; пред-существующие чужие ошибки — вне диффа), `npm run test`.
- Визуально (`npm run dev` + `DEV_AUTH_EMAIL`): на `/recipes/[slug]` поставить/изменить/убрать оценку;
  карточка на `/recipes` показывает звёзды; `?sort=rating` сортирует (рейтинговые выше, без рейтинга — в конце);
  попытка оценить свой рецепт отклоняется.

## Definition of Done (Phase D)
- [x] Таблица `recipe_ratings` (uuid, FK cascade, CHECK 1..5, UNIQUE, INDEX) + `rating_avg`/`rating_count`
      + индекс на `recipes`; индексы в определении; миграция 0031 применена.
- [x] Сервис: upsert/delete/read оценки; агрегаты транзакционно с row-lock; сорт `rating` (NULLS LAST,
      вторичный publishedAt); DTO `rating` заполнен (карточка + детальная).
- [x] Звёздный инпут на `/recipes/[slug]` (client + server action), показывает оценку пользователя;
      опция «по рейтингу» в тулбаре.
- [x] Все жёсткие правила соблюдены (auth-only, не свой рецепт, upsert, серверная валидация, only published,
      транзакционные агрегаты).
- [x] `typecheck`/`lint`/`test` зелёные; добавлены тесты (avg/count, own-recipe, upsert, auth, сорт NULLS LAST,
      карточка звёзды/«Новый», DTO).
- [x] Отчёт сохранён в `docs/specs/recipes-page-plan-D.md`; расхождения с ТЗ зафиксированы.

---

## Итоги реализации (Phase D — выполнено)

### Что сделано (по факту)
- **БД** (`packages/db/src/schema.ts`): таблица `recipeRatings` (uuid PK, FK `recipe_id`/`user_id`
  → `ON DELETE cascade`, `stars int` + CHECK `between 1 and 5`, `body text`, timestamps,
  `uniqueIndex(recipe_id,user_id)`, `index(recipe_id)`); на `recipes` — `rating_avg double precision`,
  `rating_count integer default 0 not null`, `index(rating_avg)`; индексы/CHECK объявлены в
  табличном определении (источник правды). Добавлены relations (`recipesRelations.ratings`,
  `recipeRatingsRelations`). Рукописная идемпотентная миграция
  `drizzle/0031_recipe_ratings.sql` (`CREATE TABLE IF NOT EXISTS` с inline FK+CHECK,
  `CREATE [UNIQUE] INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) + запись `idx:31` в `_journal.json`.
  **Применена** (`db:migrate`); схема/констрейнты/индексы подтверждены в БД (`\d recipe_ratings`).
- **Контракты** (`features/recipes/contracts.ts`): `recipeRatingInputSchema` (Zod: `stars` coerce int 1..5,
  `body` trim ≤2000, пустой → null), `RecipeRatingInput`, `RecipeRatingDto`, `RecipeRatingSummary`;
  `rating: {average;count} | null` добавлен в `RecipeDetailDto`.
- **Сервис** (`features/recipes/service.ts`): `getUserRecipeRating`, `rateRecipe` (Zod-валидация →
  `ensureRatableRecipe` published-гард → запрет own-recipe → транзакция: `FOR UPDATE` row-lock →
  `insert … onConflictDoUpdate` по `(recipe_id,user_id)` → пересчёт `avg/count` из источника →
  `update recipes`), `deleteRecipeRating` (та же транзакционная схема). `searchPublicRecipes`/
  `mapPublicRecipeListItem` и `mapRecipeDetailDto` заполняют `rating` из денормализованных полей
  (`count>0 → {average: round1, count}`, иначе `null`). Сорт `rating` — `rating_avg desc NULLS LAST`
  (через `sql`), вторичный `updatedAt desc`; `publicRecipeSortColumns.rating = recipes.ratingAvg`.
- **Сорт-план** (`features/recipes/public-recipe-query.ts`): `PublicRecipeSortKey += "rating"`,
  `PublicRecipeSortPlan.nullsLast?`, `resolvePublicRecipeSort("rating") → {rating,desc,nullsLast:true}`.
- **Server actions** (`app/(public)/recipes/[slug]/actions.ts`, `"use server"`): `rateRecipeAction`/
  `deleteRecipeRatingAction` — `getSessionUser()` (userId только с сервера; `null → {code:"AUTH"}`),
  сервис, `revalidatePath("/recipes/[slug]")` + `revalidatePath("/recipes")`, маппинг
  OWN_RECIPE/NOT_FOUND/ZodError.
- **UI**: клиентский `components/recipes/recipe-rating-form.tsx` (5 звёзд с `aria-label`/клавиатурой,
  опц. комментарий, `useTransition`, состояния not-logged-in→`/login` CTA / own-recipe→дизейбл /
  обновить+убрать); `public-recipe-page.tsx` — секция «Оценки» (агрегат `★ avg (count)` / «Оценок пока
  нет» + форма), новые пропсы `currentUserId`/`userRating`; `app/(public)/recipes/[slug]/page.tsx` —
  читает `getSessionUser` + `getUserRecipeRating`, прокидывает в страницу. `recipes-url.ts` —
  добавлена опция сортировки `{rating,"По рейтингу"}` (появляется в тулбаре). `recipe-card.tsx`
  не менялся (звёзды vs «Новый» уже реализованы, питается из DTO).
- **Тесты**: новые `recipe-ratings-service.test.ts` (10 — avg/count insert/update/delete, upsert
  одной строкой, own-recipe, published-only, missing, Zod-валидация, getUserRecipeRating),
  `recipe-rating-action.test.ts` (7 — AUTH, userId только с сервера, revalidate, OWN_RECIPE/NOT_FOUND
  маппинг), `recipe-rating-form.test.ts` (4 — звёзды, login-CTA, own-recipe гард, предзаполнение).
  Расширены `public-recipe-query.test.ts` (rating NULLS LAST), `public-recipes-service.test.ts`
  (rating-сорт + DTO заполнение/«Новый»), обновлены под новый DTO/опцию: `recipes-url.test.ts`,
  `public-recipes-pages-wiring.test.ts` (моки `getSessionUser`/`getUserRecipeRating`), фикстуры
  `recipe-editor-components`/`recipe-interop`/`recipes-read-components`. **Полный прогон web: 601/601
  зелёные**; `npm run typecheck` (все workspace) чистый; `next lint` по файлам фазы — без новых
  ошибок (пред-существующие warning'и `service.ts:87,1210` вне диффа).
- **E2E-смоук против реальной БД** (одноразовый скрипт, удалён): insert→agg `{4,1}`, upsert→1 строка,
  CHECK отклонил `stars=9` на уровне БД, own-recipe отклонён сервисом, delete→agg `null/0`.

### Расхождения с ТЗ/планом (зафиксировано)
1. **uuid вместо `TEXT`** для `recipe_ratings.id`/FK — следуем фактической схеме (`recipes`/`users` —
   `uuid().defaultRandom()`), как в Фазе A. `user_id` FK — `ON DELETE cascade` (конвенция `sessions`/`recipes`).
2. **`rating_avg` = `double precision`** (а не REAL) — конвенция проекта (`doublePrecision`),
   функционально эквивалентно.
3. **Агрегаты пересчитываются в сервисной транзакции** (не триггером) — с `SELECT … FOR UPDATE`
   по строке рецепта, сериализует параллельные оценки → расхождение `rating_avg/count` невозможно.
4. **Auth в action — `getSessionUser`** (не `requireUser`): публичная страница не редиректит на /login,
   а возвращает `{code:"AUTH"}`, UI показывает CTA «Войдите». userId берётся ТОЛЬКО на сервере.
5. **Деталь-страница `/recipes/[slug]` стала динамической** — читает cookie (`getSessionUser`) для
   предзаполнения оценки текущего пользователя. Приемлемо.
6. **NULLS LAST** в ORDER BY построен через `sql\`${col} desc nulls last\`` (drizzle `desc()` не
   выражает NULLS LAST). `publishedAt`≈`updatedAt` как вторичный ключ (колонки `published_at` нет).
7. **`body`** хранится и валидируется (≤2000), форма содержит опц. комментарий; листинг отзывов —
   вне скоупа (ТЗ §3.4 — только оценки).
