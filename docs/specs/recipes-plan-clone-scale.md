# Рецепты: владение — сохранение, клон чужого, пересчёт под объём

> **Статус:** реализовано. Источник истины — код; конвенции — `docs/reference/recipes-public-page.md`, `recipes-editor.md`.
> **Миграция:** `packages/db/drizzle/0033_recipe_cloned_from.sql` (применена).

## Контекст

«Мои рецепты» и «публичные» — одна таблица `recipes` (различие в `publicationState`
+ `authorId`). До этого захода: закладка (`recipe_saves`, `/app/saved`) была
read-only тупиком; `cloneRecipe` умел копировать только СВОЙ рецепт; перенести
чужой под свой объём было нельзя. Заход вводит три разведённых действия —
**Сохранить** (закладка) → **Клонировать** (своя редактируемая копия) →
**Пересчитать под объём** (эфемерный просмотр) — и мост из «Сохранённого»/публичной
страницы в «Мои рецепты».

## Часть 1 — Сохранение (переиспользовано)

`recipe_saves` + `setRecipeSave` + `toggleRecipeSaveAction` + `listSavedRecipes` +
`/app/saved` — без изменений. Добавлены: **мост** «Клонировать» на карточке
`/app/saved` и **явный фидбэк сохранения** — эфемерный тост `SavedToast`
(«Сохранено в «Избранное»» + ссылка на `/app/saved`, авто-скрытие 5с, портал в
body, без глобального провайдера), триггерится в `RecipeSaveButton` при добавлении
(не при снятии).

## Часть 2 — Клон чужого рецепта

- **Схема:** `recipes.cloned_from_recipe_id` (self-FK `ON DELETE SET NULL`) +
  индекс `recipes_cloned_from_idx`. Провенанс к чужому рецепту, не путать с
  `recipeFamilyId`+`versionNumber`. Объявлено в `packages/db/src/schema.ts`.
- **Сервис** (`apps/web/features/recipes/service.ts`):
  - `buildRecipeClonePayload` / `buildRecipeCloneIngredientPayload` — общий билдер
    (копия = черновик `private`, полные данные). Кросс-юзерный клон приватного
    кастома чужого автора ремапится в **imported-снимок** (иначе нарушится
    `recipe_ingredients_source_linkage_chk` / `ensureOwnedCustomIngredient`).
  - `assertRecipeCloneAllowed` — пур-гард: свой в любом статусе / чужой только
    `published`, иначе `FORBIDDEN`.
  - `cloneRecipeFromPublic(userId, sourceRecipeId)` — мост: новый черновик во
    владении пользователя, `clonedFromRecipeId = source.id`.
  - `cloneRecipe` (дубликат своего) переписан на общий билдер; без `clonedFrom`.
  - **Название копии:** `buildCloneTitle` → «{исходное} (копия {имя})», где имя —
    `displayName` клонирующего (иначе локальная часть email). Усечение до 180
    символов с сохранением суффикса. Применяется к обоим путям клона.
  - `resolveRecipeCloneSource` + поле `clonedFrom` в `RecipeDetailDto` (резолв в
    `mapRecipeDetailDto`; данные неперсональные → деталь кэшируема).
- **Server action:** `apps/web/app/(public)/recipes/[slug]/clone-actions.ts` —
  `cloneRecipeFromPublicAction`. `getSessionUser` (null → `AUTH`), Zod (`recipeId`
  uuid), `revalidatePath('/app/recipes')`, `{ ok, recipeId }`. userId только из сессии.
- **UI:** `CloneFromPublicButton` («Клонировать», `Copy`) на детальной
  (`public-recipe-header.tsx`) и на карточке `/app/saved` (через проп
  `showCloneAction` в `recipes-grid` → `recipe-card`). Успех → переход в
  `/app/recipes/[id]/edit`; аноним → `/login?next=…`. Баннер атрибуции
  `RecipeCloneAttribution` («Адаптировано из …») на публичной странице и в
  редакторе; скрыт для клона своего.

## Часть 3 — Пересчёт под объём (немутирующий)

- **Чистая функция** `apps/web/features/recipes/scale.ts` — `scaleRecipeToVolume`:
  `factor = target/base` (через `toBatchVolumeLiters`), масштабирует абсолютные
  количества и объём; интенсивные `og/fg/abv/ibu/color/efficiency/boilTime` НЕ
  меняются (зафиксированное приближение). Клампы: невалидный/≤0/пусто → factor 1;
  потолок 1000 л. Ничего не пишет.
- **UI** `recipe-scale-panel.tsx` — только на публичной детальной
  (`public-recipe-page.tsx`), рядом с панелью склада. Эфемерный `useState`,
  подпись «не меняет оригинал; чтобы сохранить — клонируйте».

## Жёсткие правила
Сохранять/клонировать — только аутентифицированный, userId из сессии; клон чужого
— гард `published`, копия = `private`; Zod на входах; масштаб read-only; счётчики
популярности (incl. `clone_count`) НЕ добавлялись.

## Тесты
`recipe-clone-service.test.ts` (гард + билдер/ремап), `recipe-clone-action.test.ts`
(auth/uuid/revalidate/маппинг), `recipe-scale-volume.test.ts` (пропорциональность,
интенсивные неизменны, клампы), `recipe-clone-bridge.test.ts` (кнопка на детальной
и saved-карточке; баннер атрибуции).

## Проверка
`npx tsc -p apps/web/tsconfig.json --noEmit` · `npx tsc -p packages/db/tsconfig.json
--noEmit` · `npx vitest run recipe-clone-service recipe-clone-action
recipe-scale-volume recipe-clone-bridge --root apps/web`.

## Вне скоупа
Слияние `/app/recipes` + `/app/saved` в табы; унификация `RecipeCard`; сорт
`popular`/счётчики популярности; «я сварил»/лог варок; рейтинги; SQL-контракт
публичного поиска; кнопка клона на витрине `/recipes`; авто-дозавершение клона
после логина.

## Известное (вне этого захода)
`recipe-service.test.ts > published recipe requires style…` и
`recipe-editor-components.test.ts > publication readiness checklist` падали ДО
этого захода (валидацию публикации перестали требовать `styleId`, тесты не
обновили) — не связано с клоном/масштабом.
