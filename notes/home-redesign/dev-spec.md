# ТЗ для разработчика — главная страница `/`

Файл страницы: `apps/web/app/(public)/page.tsx` (переписывается). Визуальный референс —
`mockup.html` рядом, поблочные требования — `design-spec.md`.

## 0. Инварианты (не ломать)

- Залогиненный редиректится на `/app` — сохранить как есть (`getSessionUser()` → `redirect`).
- Кроме этого редиректа страница **не читает сессию и per-user данные** (cache-safety публичных
  страниц — канон из `docs/roadmap.md`).
- Никаких новых зависимостей; всё из существующих пакетов.
- Доменная логика — в `features/*` / `@nb/*`, не в компонентах.

## 1. Данные и источники (проверено по коду)

| Что | Откуда |
|-----|--------|
| SRM-палитра, градиенты, band'ы | `apps/web/features/recipes/beer-color.ts` — `beerColorFromSrm`, `srmToSoftGradient`, `srmColorBands` |
| Витальные статистики BJCP | `@nb/content` → `getBjcpCatalogData().styles[]`; у каждого стиля `vitalStatistics: { og, fg, ibu, srm, abv }` (строки-диапазоны в SG/IBU/SRM/%, как в BJCP 2021) и `colorBand` |
| Фильтр по семейству витрины | URL-контракт `/recipes?family=<id>` — `features/recipes/public-recipe-query.ts` |
| Выборка рецептов | `searchPublicRecipes(filters)` — `features/recipes/service.ts`; `PublicRecipeFilters` поддерживает `page`/`pageSize` |
| Счётчики по семействам | `getPublicRecipeFamilyCounts()` — там же; пустые семейства в карту не попадают |
| Карточка рецепта | `components/recipes/recipe-card.tsx` (`RecipeCard`, нужен проп `preferredGravityUnit`) |
| Карточки калькуляторов | `CalculatorCard` — `components/calculators/calculators-index.tsx`; слаги — `popularCalculatorSlugs` из `features/calculators/catalog.ts` |
| Конверсия/формат плотности | `features/system/gravity-units.ts` — `formatGravity`; дефолт гостя — Plato |
| Стакан | `components/recipes/beer-glass-icon.tsx` — `BeerGlassIcon` (принимает `gradientFrom`/`gradientTo`) |
| Числовые поля | `components/shared/numeric-input.tsx` — `NumericInput` (конвенция проекта) |
| Featured-гайды | `listFeaturedContentArticles(3)` — `features/content-articles/service.ts` |

## 2. Архитектура страницы

Страница — серверный компонент. Интерактив — один клиентский островок (hero), всё остальное
серверное (SEO: контент рендерится сервером).

```
app/(public)/page.tsx                       — серверная сборка секций
components/home/home-style-vitals.tsx       — "use client": hero-панель с чипами стилей
components/home/home-loop.tsx               — серверный: петля мастерской (статичный)
components/home/home-brewforge.tsx          — серверный: пульт (статичный, SVG-график инлайном)
```

### 2.1 Hero — витальная панель (`HomeStyleVitals`)

- На сервере: резолв 6 фиксированных стилей по `bjcpId` из `getBjcpCatalogData()`:
  `4A, 3B, 10A, 21A, 10B, 15B` (порядок = от светлого к тёмному).
- Серверный маппер готовит плоский DTO на каждый стиль: `{ bjcpId, title, slug, og, ibu, abv,
  ebc, srmMid, colorLabel }`, где:
  - `og`: диапазон SG из `vitalStatistics.og` → °P через существующие конверсии
    (формат «11,0–11,9 °P»);
  - `ebc`: диапазон SRM × 1.97, округлённый («6–10 EBC»);
  - `srmMid`: середина SRM-диапазона — для заливки стакана;
  - `colorLabel`: `beerColorFromSrm(srmMid).label`.
  Парсер диапазонов (`"1.044 - 1.048"` → `[1.044, 1.048]`) положить в `features/`
  (не в компонент); на не распарсившийся диапазон — прочерк, не падение.
- Клиентский компонент получает готовый массив DTO пропом: никаких фетчей и конверсий
  на клиенте, переключение чипов — чистый state.
- Стакан: `BeerGlassIcon` c `gradientFrom`/`gradientTo` из `srmToSoftGradient`-логики
  (микс базового hex с белым 0.3 / чёрным 0.16 — функции уже есть в `beer-color.ts`,
  при необходимости экспортировать).
- Чипы: `<button aria-pressed>`; ссылка «справочника стилей BJCP» → `/bjcp`.

### 2.2 Чипы семейств стилей + счётчики

*(Ревизия 2026-07-03: вместо цветовой полосы — вход по стилю, не по цвету.)*
- Данные: существующий `getPublicRecipeFamilyCounts()` + `getBjcpCatalogData().families`
  (уже фетчится для hero) — новых функций сервиса не нужно.
- Сборка на сервере в `page.tsx`: sort по `sortOrder`, маппинг `{ id, nameRu, count }`,
  фильтр `count > 0` (пустые скрыты — как в табах `/recipes`).
- Чип — `<Link href={`/recipes?family=${id}`}>`, счётчик — приглушённым `tabular-nums`.

### 2.3 Рецепты сообщества

- `searchPublicRecipes({ ...defaults, sort: { key: "updatedAt", direction: "desc" }, page: 1, pageSize: 3 })`
  — 3 последних опубликованных. Использовать `parsePublicRecipeFilters({})` как базу,
  чтобы не собирать фильтры руками.
- Рендер — существующий `RecipeCard` c `preferredGravityUnit="plato"` (гость).
  `RecipeMatchBadge` внутри карточки для гостя сам ничего не показывает — проверять не нужно,
  но убедиться, что он не дёргает per-user API до логина (как на витрине).

### 2.4 Петля мастерской и BrewForge

- Полностью статичные серверные секции; контент — из `design-spec.md`/`mockup.html`.
- График телеметрии — инлайновый SVG с захардкоженным профилем затирания
  (см. функцию `drawMash` в `mockup.html` — перенести как JSX, генерация точек хелпером).
  Никаких запросов к devices/API — это иллюстрация.
- Пульс пилюли «связь» — CSS-анимация под `@media (prefers-reduced-motion: no-preference)`.

### 2.5 Калькуляторы

*(Ревизия 2026-07-03: живой `HomeAbvCalculator` с инпутами удалён — форма без контекста
инструмента на главной не нужна. Клиентский островок остался один — hero.)*
- Переиспользовать `CalculatorCard` (экспортирован из `calculators-index.tsx`) —
  та же карточка, что на `/calculators`: фото инструмента, `shortTitle`, `description`.
- Слаги: `popularCalculatorSlugs.slice(0, 6)`, резолв через `calculatorBySlug`.
- Секция полностью серверная, без клиентского кода.

### 2.6 Разобраться + два входа

- Гайды: `listFeaturedContentArticles(3)` + существующий стиль карточек (как сейчас на главной);
  секцию скрывать, если пусто (как сейчас).
- BJCP-баннер: статичный, спектр — CSS-градиент из hex'ов `SRM_COLOR_MAP`; счётчик стилей
  можно взять из `getBjcpCatalogData().styles.length` («Больше 120 стилей…» — вычислять, не хардкодить).
- Развилка: «Начать с рецепта» → `/login?next=/app/recipes/new`,
  «Начать со склада» → `/login?next=/app/ingredients`.

## 3. SEO / метаданные

- Обновить `metadata.description` под новую подачу (рецепт → склад → варка → журнал + автоматика).
- Канонический URL `/` без изменений; вся текстовая часть секций — в серверном HTML.
- Существующие блоки Featured-гайдов сохраняют разметку ссылок (`/guides/[slug]`).

## 4. Критерии приёмки

1. Гость: все 8 блоков видны, ни одного запроса к per-user API до взаимодействия;
   страница не читает cookie кроме существующего чтения сессии под редирект.
2. Залогиненный: по-прежнему мгновенный redirect на `/app`.
3. Переключение стилей в hero не вызывает сетевых запросов; цифры совпадают с
   витальными статистиками соответствующих страниц `/bjcp/*`.
4. Карточки калькуляторов на главной идентичны карточкам `/calculators`
   (один компонент, не копия вёрстки).
5. Клик по чипу семейства открывает `/recipes` с применённым фильтром семейства,
   счётчик чипа совпадает с числом результатов на витрине.
6. Мобайл 360 px: нет горизонтального скролла страницы; петля скроллится в собственном
   контейнере со снапом, чипы семейств переносятся строками.
7. `npm run typecheck` и `npm run lint` зелёные; на новые хелперы
   (парсер диапазонов) — vitest-тесты.
8. `prefers-reduced-motion`: пульс и переходы отключаются.

## 5. Этапность

См. `README.md` §Этапы — 6 последовательных PR, первые два (hero, чипы+рецепты) приоритетны.
Старые блоки текущей главной удаляются на последнем этапе, чтобы страница оставалась целой
между PR.
