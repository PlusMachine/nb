# ТЗ: Страница «Рецепты сообщества» (`/recipes`)

> Задача для Claude Code. Проект **NB** — web-first платформа для домашних пивоваров (Next.js 15 App Router, React 18, TypeScript strict, Drizzle ORM, Tailwind + `@nb/ui`).
> Дата: 2026-06-24.

---

## 0. Прежде чем писать код

Это ТЗ написано по сводному `project-context.md` и **может расходиться с реальным кодом в деталях**. Перед реализацией:

1. Прочитай `CONTEXT.md` и `CLAUDE.md` в корне репо.
2. Открой и сверь фактические сигнатуры:
   - `apps/web/features/recipes/service.ts` — найди `listPublicRecipes()` и её текущий контракт.
   - `apps/web/features/recipes/contracts.ts`
   - `apps/web/features/recipes/beer-color.ts` — есть ли уже SRM→hex / SRM→EBC.
   - `packages/db/src/schema.ts` — таблицы `recipes`, `recipeImages`, `users`; как хранятся `color`, `processMeta`, версии/клоны, привязка стиля.
   - `packages/brewing-core/src/styles/*` и `color.ts` — как считается style-fit и цвет.
   - `packages/content/src/*` — `getBjcpCatalogData()` (семейства/стили BJCP).
   - `apps/web/app/(public)/recipes/page.tsx` — текущая страница.
   - `apps/web/components/content/bjcp-filter-sheet.tsx` — паттерн мобильного фильтр-шита для переиспользования.
   - `apps/web/components/recipes/*` — что уже есть (`public-recipe-page.tsx`, `clone-recipe-button.tsx`, `recipe-stats-summary.tsx`).
3. **Где это ТЗ противоречит реальной схеме/контрактам — следуй коду, а не ТЗ, и зафиксируй расхождение в финальном отчёте.**

### Инварианты проекта (соблюдать строго)

- Доменная логика — в service layer (`features/recipes`), **не** в страницах/компонентах.
- Фильтрация/сортировка/пагинация — **на стороне SQL (Drizzle)**, никогда «load all → filter in memory» (это известный P2-антипаттерн из аудита — повторять его нельзя).
- Нормализация единиц — только на сервере.
- Ownership/permissions — на сервере. На этой странице только **published**-рецепты.
- Переиспользовать существующие сервисы и UI-примитивы (`@nb/ui`), не строить параллельные.
- Перед коммитом: `npm run typecheck`, `npm run lint`, `npm run test` должны проходить. Точечно: `npx tsc -p apps/web/tsconfig.json --noEmit`.

---

## 1. Цель

Превратить `/recipes` из плоского списка в **витрину для discovery**: поиск, фасетная навигация по стилям и цвету, диапазоны ABV/IBU, сортировка, и карточки, по которым с одного взгляда понятно — что это, **чей рецепт**, насколько хорош, и ключевые цифры.

### Что входит в скоуп
- Серверная страница `/recipes` с фильтрами/сортировкой/пагинацией через URL query-параметры.
- Расширение `listPublicRecipes()` под фильтры/сортировку/пагинацию (SQL-side).
- Карточка рецепта с цветом пива по SRM (fallback вместо фото), бейджем стиля, автором, статами, рейтингом.
- Тулбар (поиск + сортировка + переключатель вида), сайдбар фильтров (desktop) + sheet (mobile), активные фильтр-чипы, пагинация, empty states.
- Необходимые изменения схемы/индексов (см. §3).

### Что НЕ входит (отдельные итерации / out of scope)
- Полноценная система рейтингов и отзывов — это **Фаза D**, выносится в конец и помечена отдельно (в текущей схеме её нет).
- Страница автора / публичный профиль автора.
- Featured-полки / рейлы «рецепт недели» (можно заложить место, но не реализовывать).
- Bookmark/save рецептов (иконка в карточке — пока визуальная, без бэкенда; либо вынести в отдельную задачу).
- Изменения страницы детального рецепта `/recipes/[slug]`, кроме того, что нужно для Фазы D.

---

## 2. Маршрут и состояние (URL-driven)

Всё состояние списка живёт в query-параметрах — для shareable-ссылок, рабочей кнопки «назад» и SSR/SEO.

```
/recipes
  ?q=<строка>
  &family=<slug семейства BJCP>
  &style=<код стиля BJCP, напр. 21A>
  &colorMin=<SRM>&colorMax=<SRM>
  &abvMin=<%>&abvMax=<%>
  &ibuMin=<int>&ibuMax=<int>
  &method=all_grain,biab,extract        (csv, множественный)
  &sort=<см. ниже>
  &page=<int, 1-based>
```

- `page.tsx` — **server component**: читает `searchParams`, парсит/валидирует (Zod) в `PublicRecipeFilters`, вызывает сервис, рендерит layout + grid + пагинацию (SSR).
- Контролы, меняющие URL (поиск, сортировка, фильтры, пагинация) — **client components** через `useRouter`/`useSearchParams`/`usePathname` (`router.push` с обновлённым query). Поиск — с debounce ~300мс.
- Невалидные/отсутствующие параметры → дефолты, страница не падает.

**Enum сортировки** (`sort`):

| Значение | Описание | Данные | Фаза |
|---|---|---|---|
| `newest` | Сначала новые (`publishedAt` desc) | есть | A (default) |
| `abv_desc` / `abv_asc` | По крепости | колонка `abv` | A |
| `ibu_desc` / `ibu_asc` | По горечи | колонка `ibu` | A |
| `color_asc` / `color_desc` | По цвету (SRM) | колонка `color` | A |
| `name` | По алфавиту | `name` | A |
| `popular` | По популярности (число клонов / просмотров) | см. §3.3 | C (контингентно) |
| `rating` | По среднему рейтингу | новая таблица | D |

Дефолтная сортировка: `newest` (на Фазе A). Опции `popular`/`rating` показываются в селекте, только когда соответствующие данные доступны (или отключены/скрыты до своей фазы — не показывать «мёртвую» опцию).

---

## 3. Изменения данных (schema / Drizzle)

> Сначала **сверь с реальной `schema.ts`**. Ниже — целевое состояние; часть полей может уже существовать.

### 3.1 Привязка стиля к рецепту (критично для фильтра по стилю)

Фильтрация/сортировка по стилю BJCP должна работать в SQL → **стиль должен храниться на рецепте**, а не вычисляться style-fit при рендере.

- Проверь, есть ли на `recipes` поле со стилем (`styleCode`/`bjcpStyleCode` + опц. `bjcpFamily`).
- Если нет — добавь денормализованные `style_code TEXT NULL` и `style_family TEXT NULL`, заполняемые из style-fit (`@nb/brewing-core/styles`) **на сервере при сохранении/публикации** рецепта (там, где уже считаются og/fg/abv/ibu/color). Это уважает инвариант «нормализация/доменная логика на сервере».
- Индексы: `idx_recipes_style_code`, `idx_recipes_style_family`.
- Если переопределение стиля автором уже хранится — используй его, style-fit только как фолбэк.

### 3.2 Индексы под сортировку/фильтр

Добавь индексы (миграция через `npm run db:generate` → `db:migrate`) на колонки, по которым идут ORDER BY / WHERE на published-рецептах:
- `published_at`, `abv`, `ibu`, `color`, `name`
- по `publication_state` (если ещё нет) для фильтра `published`
- частичный индекс по `publication_state = 'published'`, если СУБД-план это оправдывает.

### 3.3 Сигнал популярности (Фаза C, контингентно)

`clone-recipe-button` существует, но в сводке **не видно, как трекаются клоны** (`recipeFamilyId` — это версионирование, не клоны).

- Проверь схему: есть ли `cloned_from_recipe_id` (или аналог) на `recipes`.
- Если есть → `popular` = `COUNT` клонов (или денормализованный счётчик `clone_count` + индекс).
- Если нет → **не блокируй Фазу A/B на этом**. Варианты:
  - добавить `cloned_from_recipe_id TEXT NULL` + индекс и инкрементить при клоне;
  - либо добавить дешёвый счётчик просмотров `view_count` и сортировать по нему;
  - либо временно убрать опцию `popular` из селекта.
- Решение по `popular` вынеси в отчёт и согласуй (см. §10).

### 3.4 Рейтинги (Фаза D — отдельно, в конце)

В текущей схеме рейтингов нет. Реализуется последней.

```
table recipe_ratings
  id            TEXT PK
  recipe_id     TEXT FK -> recipes.id (on delete cascade), NOT NULL
  user_id       TEXT FK -> users.id, NOT NULL
  stars         INTEGER NOT NULL  CHECK (stars BETWEEN 1 AND 5)
  body          TEXT NULL
  created_at    TIMESTAMPTZ DEFAULT now()
  updated_at    TIMESTAMPTZ DEFAULT now()
  UNIQUE (recipe_id, user_id)        -- один пользователь = одна оценка
  INDEX (recipe_id)
```

- Для сортировки по рейтингу без тяжёлых агрегатов на каждый запрос — денормализуй `rating_avg REAL` и `rating_count INTEGER` на `recipes`, пересчитывай в сервисе при вставке/обновлении/удалении оценки (или через триггер). Индекс на `rating_avg`.
- Только аутентифицированный пользователь может оценивать; нельзя оценивать собственный рецепт (проверка на сервере).

---

## 4. Service layer (`features/recipes`)

### 4.1 Контракты (`contracts.ts`)

Добавь/уточни типы (имена подгони под существующий стиль файла):

```ts
export type RecipeMethod = 'all_grain' | 'biab' | 'extract';

export type RecipeSort =
  | 'newest'
  | 'abv_desc' | 'abv_asc'
  | 'ibu_desc' | 'ibu_asc'
  | 'color_asc' | 'color_desc'
  | 'name'
  | 'popular'   // Фаза C
  | 'rating';   // Фаза D

export interface PublicRecipeFilters {
  q?: string;
  family?: string;           // slug семейства BJCP
  styleCode?: string;        // код стиля BJCP
  colorMinSrm?: number;
  colorMaxSrm?: number;
  abvMin?: number;
  abvMax?: number;
  ibuMin?: number;
  ibuMax?: number;
  method?: RecipeMethod[];
  sort?: RecipeSort;         // default 'newest'
  page?: number;             // 1-based, default 1
  pageSize?: number;         // default 24, max 48
}

export interface PublicRecipeListItem {
  id: string;
  slug: string;
  name: string;
  author: { id: string; displayName: string | null };
  style: { code: string; name: string } | null;
  og: number | null;
  fg: number | null;
  abv: number | null;
  ibu: number | null;
  colorSrm: number | null;
  colorEbc: number | null;
  batchSizeL: number | null;
  method: RecipeMethod | null;
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  cloneCount: number;                                  // 0, пока нет Фазы C
  rating: { average: number; count: number } | null;   // null до Фазы D
  publishedAt: string;
}

export interface PublicRecipeFacets {
  families: { slug: string; name: string; count: number }[];
  styles: { code: string; name: string; count: number }[];
}

export interface PublicRecipeListResult {
  items: PublicRecipeListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets?: PublicRecipeFacets;   // для счётчиков в сайдбаре (опц., см. §4.3)
}
```

Добавь Zod-схему для парсинга `searchParams` → `PublicRecipeFilters` (с дефолтами и клампами диапазонов), переиспользуемую в `page.tsx`.

### 4.2 Расширение `listPublicRecipes()`

- Принимает `PublicRecipeFilters`, возвращает `PublicRecipeListResult`.
- **Всё в одном SQL-запросе на Drizzle** (плюс отдельный `count` для пагинации; плюс опц. запрос фасетов). Никакого in-memory фильтра/сортировки.
- `WHERE`:
  - `publication_state = 'published'`
  - `q` → ILIKE по `name` (и опц. по автору/стилю; полнотекст не обязателен на этой итерации).
  - `family` / `styleCode` → по денормализованным полям из §3.1.
  - `colorMin/MaxSrm`, `abvMin/Max`, `ibuMin/Max` → диапазоны по колонкам.
  - `method` → IN (...). Уточни, где хранится метод (вероятно `processMeta` JSONB); если в JSONB — фильтруй по JSONB-выражению Drizzle.
- `ORDER BY` — по `sort` (см. §2). Вторичный ключ сортировки — `published_at desc` для стабильности.
- Пагинация — `LIMIT pageSize OFFSET (page-1)*pageSize` (keyset не обязателен).
- **Без N+1**: автор, hero-image и стиль подтягиваются join'ами/батч-запросом, не на каждую карточку.
- Hero-image: верни `thumbUrl` (URL варианта `thumb` через существующий роут `/api/recipe-images/[imageId]/[variant]`) и `blurDataUrl`. Если изображения нет → `heroImage: null`.

### 4.3 Фасеты (опционально, не блокирующее)

Для счётчиков рядом с семействами/стилями в сайдбаре — отдельный агрегирующий запрос (`GROUP BY family/style` по текущему `WHERE` без фасетного измерения). Если по времени не укладываешься — отдай сайдбар без счётчиков, поле `facets` оставь опциональным.

### 4.4 Цвет пива (`features/recipes/beer-color.ts`)

- Проверь, нет ли уже `srmToHex` / SRM-палитры.
- Если нет — добавь `srmToHex(srm: number): string` по стандартной шкале SRM (clamp 1..40+), и хелпер `pickTextColorForSrm(srm)` (светлый текст на тёмном пиве, тёмный — на светлом) для подписей поверх свотча.
- Это presentation-логика; держи её рядом с расчётами цвета, переиспользуй в карточке и на детальной странице.

---

## 5. UI-компоненты (`apps/web/components/recipes/*`)

Используй примитивы `@nb/ui` (Button, Card, Input, Select, Dialog/Sheet), Lucide-иконки, шрифты проекта (Montserrat display / Rubik body). Стиль — как у существующих страниц (`/bjcp`, `/app/recipes`).

| Компонент | Тип | Ответственность |
|---|---|---|
| `app/(public)/recipes/page.tsx` | server | Парс `searchParams` (Zod) → `listPublicRecipes` → layout. Suspense + skeleton. SEO-метаданные. Empty states. |
| `recipes-toolbar.tsx` | client | Поиск (debounce → `q`), `Select` сортировки, переключатель grid/list, счётчик результатов. Обновляет URL. |
| `recipes-filter-sidebar.tsx` | client | Desktop-сайдбар: семейства/стили BJCP (из `getBjcpCatalogData()`), цветовая шкала (7 SRM-сегментов), диапазоны ABV/IBU, метод. Обновляет URL. Кнопка «Сбросить». |
| `recipes-filter-sheet.tsx` | client | Мобильный bottom-sheet с теми же фильтрами + бейдж числа активных. Переиспользуй паттерн `bjcp-filter-sheet.tsx`. |
| `active-filter-chips.tsx` | client | Активные фильтры как удаляемые чипы (клик ✕ убирает параметр). |
| `recipe-card.tsx` | server | Карточка (см. §6). Ссылка на `/recipes/[slug]`. |
| `recipe-color-swatch.tsx` | server | Свотч цвета пива по SRM (через `srmToHex`) + подпись `SRM N`. |
| `recipes-grid.tsx` | server | Сетка карточек (`grid`, responsive). Режим list — компактная строка (опц.). |
| `recipes-pagination.tsx` | client | Пагинация через URL (`page`). |
| `recipes-empty-state.tsx` | server | Два варианта: «ничего не найдено» (+ сброс фильтров) и «рецептов пока нет» (+ CTA: создать рецепт / войти). |
| `recipes-grid-skeleton.tsx` | server | Скелетон под Suspense. |

**Разделение server/client:** страница и карточки — серверные (данные с сервера, SSR/SEO). Интерактив, меняющий URL (тулбар, фильтры, пагинация, чипы), — клиентский. Не тащи доменную логику в клиент.

---

## 6. Карточка рецепта (`recipe-card.tsx`) — ключевой элемент

Должна за полсекунды отвечать: что, чьё, насколько хорошо, ключевые цифры.

Анатомия (сверху вниз):
1. **Обложка (≈62px высотой):**
   - Если `heroImage` — `<Image>` варианта `thumb` с `blurDataURL` (плейсхолдер).
   - Если нет — **заливка цветом пива** через `recipe-color-swatch` (`srmToHex(colorSrm)`). Это основной кейс (у большинства рецептов нет фото).
   - Поверх: подпись `SRM N` (цвет текста через `pickTextColorForSrm`) и иконка bookmark (пока визуальная).
2. **Бейдж стиля** — `American IPA · 21A` (нейтральный pill).
3. **Название** — 1–2 строки, обрезка по 2 строкам.
4. **Автор** — аватар-инициалы (`users.displayName`, fallback по первым буквам; настоящих аватаров в схеме нет — подтвердить) + имя. Это закрывает «непонятно чей рецепт». Справа — рейтинг (`★ 4,7 (18)`) или бейдж `Новый`, если `rating == null`/нет оценок и рецепт свежий.
5. **Строка статов** — 4 ячейки: `ABV` / `IBU` / `OG` / `Объём`. Лейблы ≥11px, значения 500. Числа форматировать (RU-локаль: запятая, `1.048`).

Требования:
- Цвет **никогда не единственный сигнал** — всегда дублируется числом SRM и названием стиля (a11y + точность).
- Вся карточка — кликабельная ссылка с доступным именем (название рецепта).
- Никакой клиентской логики в карточке (серверный компонент).

Опорные референсы для тона карточки: stat-forward карточки Brewer's Friend / Brewfather, рейтинг+цвет как у Untappd. Сетка/фасеты — паттерн Airbnb/Booking.

---

## 7. Нефункциональные требования

**Производительность**
- Фильтр/сортировка/пагинация — в SQL. Запрет на «load all → filter in memory».
- Без N+1 (joins/батчи для автора, hero-image, стиля).
- `pageSize` дефолт 24, max 48; пагинация на уровне БД.

**SEO / SSR**
- Страница рендерится на сервере. Сохрани/добавь `generateMetadata`.
- Для отфильтрованных/постраничных состояний задай `canonical` на `/recipes` (или rel-next/prev), чтобы не плодить дубли в индексе.
- Пагинация ссылками (`<a href>` с query), не только JS, чтобы краулилось.

**Доступность (a11y)**
- Цвет не единственный носитель смысла (см. §6).
- Все контролы фильтров — с label, доступны с клавиатуры, видимый focus.
- `Select`/`Dialog`/`Sheet` — на Radix-примитивах `@nb/ui` (фокус-трапы уже там).
- Иконки-кнопки — с `aria-label`.

**Локализация**
- Строки на русском (i18n в проекте пока нет — хардкодим RU, как везде). Не плодить новый i18n-слой.

---

## 8. Тесты (Vitest, в духе существующих ~14 recipe-тестов)

- **service:** `listPublicRecipes` — корректные `WHERE`/`ORDER BY` для каждого фильтра и каждой опции `sort`; пагинация (total/page/pageSize); только `published`; (опц.) фасеты считают верно.
- **Zod-парсер `searchParams`:** валидные → фильтры; мусор/из диапазона → дефолты и клампы.
- **`srmToHex` / `pickTextColorForSrm`:** граничные SRM (1, 4, 10, 20, 40+), выбор цвета текста.
- **`recipe-card`:** рендер с фото vs цветовой fallback; состояние `Новый` vs рейтинг; форматирование чисел.
- **empty states:** «нет результатов» vs «нет рецептов».
- (Фаза D) **ratings:** агрегат avg/count, запрет оценки своего рецепта, уникальность (recipe_id,user_id).

---

## 9. Порядок выполнения (фазы)

Делать инкрементально, каждая фаза — рабочая и покрыта тестами; коммит после прохождения `typecheck`/`lint`/`test`.

- **Фаза A — данные и сервис (без UI).**
  1. Сверка схемы; добавить `style_code`/`style_family` (если нет) + заполнение из style-fit на сервере; индексы (§3.1, §3.2).
  2. Контракты + Zod-парсер (§4.1).
  3. Расширить `listPublicRecipes` (фильтры/сорт/пагинация, SQL-side) (§4.2).
  4. `srmToHex`/`pickTextColorForSrm` (§4.4). Тесты сервиса и утилит.
- **Фаза B — UI списка (SSR).**
  1. `recipe-card` + `recipe-color-swatch` + `recipes-grid` + skeleton + empty states.
  2. Переписать `page.tsx`: `searchParams` → сервис → grid; сортировки `newest/abv/ibu/color/name`; SEO. Тесты рендера.
- **Фаза C — навигация и контролы.**
  1. `recipes-toolbar` (поиск+сорт+вид), `recipes-filter-sidebar` + `recipes-filter-sheet`, `active-filter-chips`, `recipes-pagination` — всё через URL.
  2. (контингентно) сорт `popular` — после решения по трекингу клонов/просмотров (§3.3).
- **Фаза D — рейтинги (отдельно, в конце).**
  1. Таблица `recipe_ratings` + денормализованные `rating_avg`/`rating_count` + индекс (§3.4).
  2. Сорт `rating`, звёзды в карточке, минимальный UI оценки на `/recipes/[slug]`. Тесты.

После Фазы C страница уже полностью функциональна по исходному запросу; Фаза D — расширение.

---

## 10. Решения, требующие подтверждения (вынести в отчёт)

1. **Трекинг клонов:** есть ли `cloned_from_recipe_id`? Если нет — добавлять его, добавлять `view_count`, или временно убрать сорт `popular`?
2. **Стиль на рецепте:** хранится ли уже `style_code`, или вычисляется style-fit при рендере (тогда добавляем денормализацию)?
3. **Метод (all_grain/biab/extract):** где лежит (`processMeta` JSONB?) и в каком виде — нужно для фильтра.
4. **Аватары авторов:** в схеме их, похоже, нет → инициалы. Подтвердить.
5. **Default-сортировка:** `newest` ок, или сразу `popular`, когда появится сигнал?

---

## 11. Definition of Done

- [ ] `/recipes` рендерится на сервере; всё состояние — в URL; «назад» и шеринг ссылки работают.
- [ ] Работают фильтры: стиль/семейство, цвет (SRM-диапазон), ABV, IBU, метод; и сортировки Фаз A/B.
- [ ] Карточка показывает: цвет пива (или фото), бейдж стиля, **автора**, статы ABV/IBU/OG/объём, рейтинг/«Новый».
- [ ] Цвет всегда продублирован числом SRM и стилем (a11y).
- [ ] Фильтрация/сортировка/пагинация — в SQL; нет N+1; нет in-memory обработки полного списка.
- [ ] Пустые состояния: «нет результатов» (сброс фильтров) и «нет рецептов» (CTA).
- [ ] Мобильный фильтр-sheet работает; контролы доступны с клавиатуры.
- [ ] `npm run typecheck`, `lint`, `test` — зелёные; добавлены тесты сервиса/утилит/карточки.
- [ ] Решения из §10 зафиксированы в финальном отчёте; расхождения с этим ТЗ описаны.
