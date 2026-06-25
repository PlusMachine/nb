# Post-D cleanup — точечные фиксы аудита `/recipes` (P2 #2, P3 #3, P3 #4)

> **Первый шаг исполнения:** скопировать этот план в `docs/specs/recipes-page-plan-postD.md`
> (в plan mode туда писать нельзя — конвенция Фаз A–D). Туда же дописать «Итоги реализации».

## Context

Аудит фичи `/recipes` (фазы A–D) выявил три пункта пост-D долга. Этот заход чинит **только их**,
строго в границах, без расширения скоупа:

1. **P2 #2 — кэшируемость `/recipes/[slug]`.** Сейчас `page.tsx:34` безусловно вызывает
   `getSessionUser()` (чтение cookie) → весь маршрут динамический для **всех**, включая анонимов,
   которым префилл оценки не нужен. Убрать чтение сессии с уровня документа; персональную оценку
   тянуть из клиентского `recipe-rating-form` после гидрации (server action). Документ снова
   ISR/статический для анонимов; SEO/canonical из Phase B не трогаем.
2. **P3 #3 — TOCTOU в `rateRecipe`.** `ensureRatableRecipe` + проверка own-recipe выполняются ВНЕ
   транзакции (`service.ts:1977-1981`), до `FOR UPDATE`-лока. Перенести published/own-recipe проверки
   ВНУТРЬ транзакции, под тот же recipes-row lock. Поведение и тексты ошибок не менять.
3. **P3 #4 — устаревший комментарий** `contracts.ts:513` («таблицы рейтингов нет, маппится на newest»)
   — теперь ложь (таблица есть, сорт по `rating_avg`). Поправить только этот комментарий.

**НЕ трогаем:** method-фильтр, `publishedAt`-колонку, focus-trap sheet, SRM на фото-карточках,
`popular` (его комментарий на `contracts.ts:512` оставить). Это отдельный долг.

---

## Затрагиваемые файлы

### Изменяемые
- `apps/web/app/(public)/recipes/[slug]/page.tsx` — убрать `getSessionUser`/`getUserRecipeRating` из
  рендера документа; рендерить `<PublicRecipePage recipe={recipe} />` без персональных пропсов.
- `apps/web/components/recipes/public-recipe-page.tsx` — `PublicRecipePage` снова `{ recipe }`;
  `RecipeRatingSection` показывает агрегат (SSR) + `<RecipeRatingForm recipeId slug />` (self-fetch).
- `apps/web/components/recipes/recipe-rating-form.tsx` — разделить на:
  - `RecipeRatingForm` (stateful): `useEffect` → `loadRecipeRatingViewerState(recipeId)` → хранит
    `viewerState | null`; пока `null` — нейтральный placeholder («Загрузка…»); иначе делегирует во view.
  - `RecipeRatingFormView` (presentational, **экспортируется для тестов**): принимает `viewerState`
    (+ `recipeId`,`slug`); своя локальная стейт-логика звёзд/комментария/сообщений + submit/remove
    через actions. Ветки: `!authenticated` → login CTA; `!canRate` → «Нельзя оценивать собственный
    рецепт»; иначе звёздный инпут (префилл из `viewerState.rating`).
- `apps/web/app/(public)/recipes/[slug]/actions.ts` — добавить `loadRecipeRatingViewerState(recipeId)`
  (`"use server"`): `getSessionUser()`; нет сессии → `{authenticated:false,canRate:false,rating:null}`;
  иначе `getViewerRecipeRatingState(user.id, recipeId)`. Тип `RecipeRatingViewerState` экспортировать
  здесь. `rateRecipeAction`/`deleteRecipeRatingAction` не трогаем (revalidate уже верный).
- `apps/web/features/recipes/service.ts`:
  - `rateRecipe` — внести published/own-recipe проверки внутрь `db.transaction` под локом (см. ниже);
    удалить ставший неиспользуемым `ensureRatableRecipe` (используется только тут).
  - добавить `getViewerRecipeRatingState(userId, recipeId): Promise<{canRate; rating}>` (доменная
    логика в сервисе, не в action) — читает `recipes` (authorId+publicationState) + `getUserRecipeRating`.
- `apps/web/features/recipes/contracts.ts:513` — поправить комментарий у `"rating"`.

### Тесты (изменяемые)
- `apps/web/tests/recipe-rating-form.test.ts` — переписать под `RecipeRatingFormView` (статический
  `renderToStaticMarkup` по каждому `viewerState`); + рендер `RecipeRatingForm` без эффектов →
  placeholder (доказывает: в SSR/статике нет персонального контента → кэшируемо).
- `apps/web/tests/recipe-rating-action.test.ts` — добавить тесты `loadRecipeRatingViewerState`
  (аноним → `{authenticated:false}`; залогинен → результат сервиса).
- `apps/web/tests/recipe-ratings-service.test.ts` — расширить мок `tx.select` под чтение строки
  `recipes` (authorId+publicationState) под локом; существующие own/forbidden/not-found тесты должны
  пройти (теперь проверки внутри транзакции); + тесты `getViewerRecipeRatingState`.
- `apps/web/tests/public-recipes-pages-wiring.test.ts` — убрать добавленные в Phase D моки
  `getSessionUser`/`getUserRecipeRating`/`../lib/auth`; маршрут рендерится **без** auth-мока (если бы
  он читал cookie — упал бы «cookies outside request scope»), что и есть guard кэшируемости.

---

## Детали реализации

### 1. `rateRecipe` — гейт под локом (P3 #3)
```ts
export const rateRecipe = async (userId, recipeId, payload) => {
  const input = recipeRatingInputSchema.parse(payload);     // валидация, без БД — снаружи
  return await db.transaction(async (tx) => {
    await lockRecipeForRatingMutation(tx, recipeId);         // FOR UPDATE — первым
    const [recipe] = await tx
      .select({ authorId: recipes.authorId, publicationState: recipes.publicationState })
      .from(recipes).where(eq(recipes.id, recipeId)).limit(1);
    if (!recipe) throw new Error("NOT_FOUND");
    if (recipe.publicationState !== "published") throw new Error("FORBIDDEN");
    if (recipe.authorId === userId) throw new Error("OWN_RECIPE");
    await tx.insert(recipeRatings).values({ recipeId, userId, stars: input.stars, body: input.body })
      .onConflictDoUpdate({ target:[recipeRatings.recipeId, recipeRatings.userId],
        set:{ stars: input.stars, body: input.body, updatedAt: new Date() } });
    return await recomputeRecipeRatingAggregates(tx, recipeId);
  });
};
```
- Чтение строки под локом через `tx.select` (executor уже включает `select` — `service.ts:1911`).
- Бросок внутри транзакции → rollback; тексты ошибок (`NOT_FOUND`/`FORBIDDEN`/`OWN_RECIPE`) и маппинг
  в `actions.ts` без изменений. Зод-валидация остаётся снаружи (не открывать txn на невалидный ввод).
- `ensureRatableRecipe` удалить (единственный потребитель). `deleteRecipeRating` не меняем.

### 2. Кэшируемость (P2 #2)
- `page.tsx`: оставить только `getPublicRecipeBySlug` + `generateMetadata` (без изменений — cookie не
  читает, canonical к детальной не относится). Рендер `<PublicRecipePage recipe={recipe} />`.
- `getViewerRecipeRatingState(userId, recipeId)` в сервисе:
  `recipe = db.query.recipes.findFirst({ where: eq(recipes.id,…), columns:{authorId,publicationState} })`;
  `canRate = !!recipe && recipe.publicationState==="published" && recipe.authorId!==userId`;
  `rating = await getUserRecipeRating(userId, recipeId)`; вернуть `{canRate, rating}`.
- `recipe-rating-form` (client): на маунте через `useEffect` зовёт action, ставит `viewerState`;
  `recipeId`/`slug` — публичные пропсы со страницы (не персональные, кэш-safe).

### 3. Комментарий (P3 #4)
`contracts.ts:513`: `"rating" // Phase D — таблицы рейтингов нет, маппится на newest` →
`"rating" // Phase D — сортировка по rating_avg (NULLS LAST)`. Строку `popular` (:512) не трогать.

---

## Риски
- **Нет DOM-окружения/@testing-library** (vitest `environment:"node"`, только `renderToStaticMarkup`).
  → эффект клиентского fetch не юнит-тестируем напрямую; тестируем презентационный `RecipeRatingFormView`
  (синхронно) + action (`loadRecipeRatingViewerState`) отдельно; для `RecipeRatingForm` проверяем, что
  статический рендер даёт placeholder (без персонального контента).
- **Доп. round-trip**: залогиненный клиент делает 1 server-action вызов на просмотр детальной; аноним —
  тоже 1 дешёвый вызов (возвращает `{authenticated:false}`). Приемлемо ради кэшируемости; зафиксировать.
- **Мок `tx.select` под чтение `recipes`** в сервис-тесте: builder должен различать aggregate-запрос
  (recipeRatings) и lookup строки recipes (по `.from`/проекции) — небольшое расширение существующего мока.
- **PublicRecipePage сигнатура**: убрать `currentUserId`/`userRating`. Потребители — только роут и
  `recipes-read-components.test.ts` (передаёт лишь `recipe`) — не ломаются. (Проверить grep
  `PublicRecipePage(` перед правкой.)
- **Импорт actions в node-тестах**: `recipe-rating-form` импортирует actions-модуль; в статик-рендере
  эффект не запускается → cookie не читается. Совместимо с текущим поведением (Phase D так и было).

## Команды проверки
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `cd apps/web && npx vitest run recipe-rating-form recipe-rating-action recipe-ratings-service public-recipes-pages-wiring recipes-read-components recipe-card public-recipe-query public-recipes-service`
- Полный прогон: `cd apps/web && npx vitest run`; затем `npm run typecheck` (все workspace).
- Линт по затронутым файлам: `cd apps/web && npx next lint --file features/recipes/service.ts --file "app/(public)/recipes/[slug]/actions.ts" --file components/recipes/recipe-rating-form.tsx --file components/recipes/public-recipe-page.tsx --file "app/(public)/recipes/[slug]/page.tsx" --file features/recipes/contracts.ts`.
- Визуально (`npm run dev` + `DEV_AUTH_EMAIL`): аноним на `/recipes/[slug]` — документ рендерится без
  чтения сессии (форма показывает CTA «Войдите» после гидрации); залогиненный — звёзды префиллятся его
  оценкой; поставить/изменить/убрать оценку работает; попытка оценить свой рецепт отклоняется
  (own-recipe note + серверный гард под локом).

## Definition of Done
- [x] `/recipes/[slug]` (документ) не читает cookie/сессию; персональная оценка тянется клиентом через
      `loadRecipeRatingViewerState`; `generateMetadata`/SEO не затронуты.
- [x] `rateRecipe`: published/own-recipe проверки внутри транзакции под `FOR UPDATE`-локом; тексты
      ошибок и внешнее поведение неизменны; `ensureRatableRecipe` удалён.
- [x] Комментарий `contracts.ts:513` поправлен; `popular` не тронут.
- [x] Тесты: префилл/ветки формы (view), action `loadRecipeRatingViewerState`, гейт под локом
      (own/forbidden/not-found), `getViewerRecipeRatingState`; wiring-тест без auth-мока (guard
      кэшируемости). Регрессий нет: полный web vitest + tsc зелёные.
- [x] Отчёт в `docs/specs/recipes-page-plan-postD.md`; границы скоупа соблюдены.

---

## Итоги реализации (post-D cleanup — выполнено)

### Что сделано (по факту)
- **P2 #2 — кэшируемость `/recipes/[slug]`.** `app/(public)/recipes/[slug]/page.tsx` больше **не**
  импортирует/не вызывает `getSessionUser`/`getUserRecipeRating` — рендерит `<PublicRecipePage recipe={recipe} />`
  (документ не читает cookie → кэшируем для анонимов). `PublicRecipePage`/`RecipeRatingSection` вернулись
  к `{ recipe }` (агрегат `★ avg (count)` — по-прежнему SSR из DTO). Новый server action
  `loadRecipeRatingViewerState(recipeId)` (`actions.ts`) + сервисная `getViewerRecipeRatingState(userId, recipeId)`
  (`{canRate, rating}`, доменная логика в сервисе). `recipe-rating-form.tsx` разбит на
  `RecipeRatingForm` (stateful: `useEffect` → action → `viewerState`, до загрузки — placeholder «Загрузка…»)
  и `RecipeRatingFormView` (презентационный, экспортируется для тестов). `generateMetadata` не тронут.
- **P3 #3 — TOCTOU устранён.** В `rateRecipe` (`service.ts`) published/own-recipe проверки перенесены
  **внутрь** `db.transaction` ПОСЛЕ `FOR UPDATE`-лока строки рецепта (чтение через `tx.select`).
  Zod-валидация осталась снаружи. Тексты ошибок (`NOT_FOUND`/`FORBIDDEN`/`OWN_RECIPE`) и внешнее
  поведение/маппинг в `actions.ts` — без изменений. Неиспользуемый `ensureRatableRecipe` удалён.
- **P3 #4 — комментарий** `contracts.ts:513` исправлен на «сортировка по rating_avg (NULLS LAST)»;
  строка `popular` (:512) не тронута.

### Тесты и проверки
- `tests/recipe-rating-form.test.ts` переписан под `RecipeRatingFormView` (4 ветки: can-rate/anon/own/
  prefill) + guard: статический рендер `RecipeRatingForm` даёт placeholder без персонального контента.
- `tests/recipe-rating-action.test.ts` +2 теста `loadRecipeRatingViewerState` (anon / signed-in).
- `tests/recipe-ratings-service.test.ts`: мок `tx.select` расширен под чтение строки `recipes` под локом;
  существующие own/forbidden/not-found тесты проходят (теперь проверки внутри транзакции); +4 теста
  `getViewerRecipeRatingState` (non-author/author/draft/missing).
- `tests/public-recipes-pages-wiring.test.ts`: убраны Phase-D моки `getSessionUser`/`getUserRecipeRating`/
  `../lib/auth` — роут рендерится **без** auth-мока (guard кэшируемости: чтение cookie упало бы).
- **Полный web vitest: 608/608 зелёные**; `npm run typecheck` (все workspace) чист; `next lint` по
  затронутым файлам — без новых ошибок (пред-существующие warning'и `service.ts:87,1210` вне диффа).
- **E2E против реальной БД** (одноразовый скрипт, удалён): `getViewerRecipeRatingState` (canRate
  true/false), `rateRecipe` под локом, own-recipe/NOT_FOUND отклонены изнутри транзакции, delete → `0/null`.

### Границы скоупа (соблюдены)
Не трогались: method-фильтр, `publishedAt`-колонка, focus-trap sheet, SRM на фото-карточках, `popular`.

### Замечание (зафиксировано)
Залогиненный клиент делает 1 доп. server-action вызов на просмотр детальной (аноним — тоже 1 дешёвый,
возвращает `{authenticated:false}`) — осознанный размен ради кэшируемости документа.
