# Хаб каталога ингредиентов: `/catalog` → секции по категориям

Дата: 2026-07-07. Статус: РЕАЛИЗОВАНО (ветка `feature/catalog-hub`), адверсариальное ревью пройдено, живой прогон зелёный. Не смёржено в main.
Решение владельца: вместо плоского смешанного списка на `/catalog` — хаб с секциями по категориям (вариант 4 из обсуждения), сквозной поиск на хабе, фолбэк «найдено ещё N в других разделах» на категорийных лендингах.

## Мотивация

Смешанный список «всё подряд» — самый слабый вид каталога: у каждой категории свои значимые параметры (солод — EBC/экстракт, хмель — альфа, дрожжи — аттенюация), общий список показывает случайную смесь и сортирует Citra рядом с Carapils. Категорийные лендинги (`/catalog/malts` и т.п.) уже существуют и остаются местом полноценного браузинга (пагинация, сортировка). Хаб — витрина-оглавление.

## Понятия

- **Хаб** — `/catalog` без `landing` (путь `landing=null` в `IngredientCatalogContent`).
- **Лендинг** — `/catalog/{slug}` (7 штук, `catalogCategoryLandings` в `features/ingredients/seo.ts:25-100`): malts, fermentables, hops, yeast, water, additives, consumables. *(На момент написания этого ТЗ `consumable` был одной секцией/лендингом; позже расщеплён на `additives` («Специи и добавки») и `consumables` («Расходники») — см. `docs/reference/ingredient-add-and-search.md`.)*
- **Секция** — блок хаба, соответствующий ровно одному лендингу (7 секций, тот же порядок).

## Инварианты (не ломать)

1. Сигнатура и контракт `listUserCatalogIngredients` (`catalog-service.ts:1716`) — не менять: потребители `api/ingredients/custom/route.ts`, лендинги, тесты `coverage-catalog-browse.test.ts`, `catalog-search-noise-and-sort.test.ts`.
2. Слаги лендингов и их URL — не менять (breadcrumbs/JSON-LD деталки, sitemap).
3. Контракт диплинков `buildIngredientCatalogActionHref` (`features/ingredients/catalog-links.ts`) — имена query-параметров `addSource/addId/addQty/addUnit` и рендер кнопки «На склад» в строке.
4. Таксономия `ingredientCategories` / `IngredientCategory` — общий словарь.
5. Поведение лендингов (пагинация, soft-404 за диапазоном, сортировки, canonical) — без изменений, кроме добавления фолбэка поиска.
6. `/app/ingredients` (склад), `/admin/ingredients`, `IngredientPicker` — не трогать (не пересекаются).

## S1. Сервисный слой: `listCatalogHubSections`

Новая функция в `apps/web/features/ingredients/catalog-service.ts` (рядом с `listUserCatalogIngredients`, контракт того — не трогать). Типы — в `features/ingredients/contracts.ts`.

```ts
type CatalogHubParams = {
  view?: "all" | "mine";
  q?: string;
};

type CatalogHubSection = {
  slug: CatalogLandingSlug;            // связка с лендингом
  category: IngredientCategory;
  subtype?: "malt" | "fermentable";    // только для двух fermentable-секций
  items: UserCatalogIngredientDto[];   // превью, усечённое до лимита, с usage counts
  total: number;                       // полное число позиций секции при текущих q/view
};

type CatalogHubResult = {
  sections: CatalogHubSection[];       // все 7 (было 6 до расщепления consumable на additives/consumables); пустые (total=0) включать — UI сам скрывает
  facets: UserCatalogListResult["facets"]; // для пилюль тулбара, та же форма
  total: number;                       // сумма total секций
};

export const listCatalogHubSections = async (
  userId: string | null,
  params: CatalogHubParams = {}
): Promise<CatalogHubResult>
```

Реализация:
- Источник данных — `loadUnifiedCatalogItems(userId)` (как в `listUserCatalogIngredients`), персонализация сохраняется (custom-ингредиенты и избранное видны как на лендингах).
- **Без `q`**: один проход `sortCatalogItems(items, "name")`, затем партиционирование по секциям (fermentable делится по subtype как в `catalog-service.ts:1746-1751`), превью = первые `CATALOG_HUB_PREVIEW_LIMIT = 6`. Порядок секций — как в `catalogCategoryLandings`.
- **С `q`**: ранжирование ОДИН раз тем же путём, что `listUserCatalogIngredients` (`buildRankedItem` → `sortRankedCatalogItems` → `filterRankedCatalogNoise`; НЕ `searchUserCatalogIngredients` — у него другая семантика, шум не режется). Затем группировка ранжированного списка по секциям; внутри секции порядок ранга сохраняется; превью = первые `CATALOG_HUB_SEARCH_GROUP_LIMIT = 10`. **Порядок секций при q — по первому вхождению в общем ранжированном списке** (лучший матч определяет первую секцию); секции с total=0 в хвосте в каноническом порядке.
- `view="mine"` — базовый набор = только custom (как `baseItems` в `listUserCatalogIngredients`).
- `facets` — считать так же, как в `listUserCatalogIngredients:1753-1783` (byCategory/byFermentableSubtype на базовом наборе после q-ранжирования, customCount/catalogCount на ranked-all). Вынести общий кусок в хелпер, если это не раздувает дифф; копипаста 15 строк тоже допустима — решить по месту.
- Usage counts: `applyUsageCounts(userId, <конкатенация превью всех секций>)` — один вызов (≤60 позиций), затем разложить обратно по секциям.
- Кэширования не добавлять (`loadIngredients` уже держит процессный TTL-кэш; `unstable_cache` запрещён — ловушка 2MB задокументирована в `service.ts:345-362`).
- Источник определений секций — `catalogCategoryLandings` из `seo.ts` (единая точка правды; проверить отсутствие циклического импорта — `seo.ts` не импортирует `catalog-service`).

Мёртвый фасет `filteredByCategory` (`catalog-service.ts:1778`, нигде не потребляется) — НЕ удалять в этом рефакторе (отдельная уборка, не смешивать).

## S2. UI хаба (`content.tsx`, `landing=null`)

Структура страницы (в `<main className="space-y-6">`):
1. H1 «Каталог ингредиентов» + существующий intro-текст (`content.tsx:481-487`) — без изменений.
2. `IngredientCatalogToolbar` — как сейчас (пилюли, «Все» активна, поиск, reset, «Создать свой»), НО **сортировка на хабе скрыта** (проп `showSort?: boolean`, дефолт true; на хабе false). На лендингах сортировка как была.
3. **Без q**: секции в порядке `catalogCategoryLandings`, только с `total > 0`:
   - Шапка секции: иконка категории (та же `categoryMeta`, что в пилюлях тулбара) + заголовок + справа ссылка «Все {total}» → лендинг (с сохранением `view`, как `buildLandingHref` в тулбаре). Заголовки секций = лейблы пилюль: «Солод», «Сбраживаемое сырье», «Хмель», «Дрожжи», «Водоподготовка», «Специи и добавки», «Расходники». Никаких пояснительных подзаголовков.
   - Тело секции: те же строки, что на лендинге (desktop-таблица + mobile-карточки), через переиспользуемый компонент (S3). `hideSubtypeBadge` — по аналогии с лендингом: в секциях «Солод»/«Сбраживаемое сырье» бейдж подтипа скрыт.
   - Обёртка секции — существующий визуальный язык: `rounded-[28px] border border-border bg-card shadow-sm`, тело гаснет при поиске через класс `catalog-search-dim`.
4. **С q** (сквозной поиск): те же секции, но только с совпадениями (total>0), в порядке из S1; в шапке секции счётчик = total совпадений; если total > лимита превью — внизу секции ссылка «Все {total} в разделе» → `/catalog/{slug}?q=...`. Если совпадений нет нигде — существующее пустое состояние («По текущим условиям ничего не найдено» + «Сбросить поиск»).
5. `view=mine`: секции фильтруются до custom-позиций (сервис уже отдаёт), пустые скрыты; если пусто везде — существующее пустое состояние для mine.
6. Пагинации на хабе нет. JSON-LD: один `ItemList` из первых 10 позиций конкатенации превью (в порядке секций), только при `!q && view !== "mine"`, `offset=0`, `path="/catalog"`; `<script>` — последним ребёнком `main` (ловушка space-y, `content.tsx:740-742`).

## S3. Переиспользуемый рендер строк

Вынести из `content.tsx` разметку desktop-таблицы (`content.tsx:535-616`) и mobile-карточек (`content.tsx:618-694`) в общий серверный компонент (например, `apps/web/components/ingredients/catalog-items-list.tsx` или локально в `content.tsx` как компонент — решить по объёму; предпочтительно отдельный файл). Параметры: `items`, `hideSubtypeBadge`, `canManage`, `userId`-зависимые пропсы действий — ровно то, что уже используется. Никаких визуальных изменений строк: чистый extract-рефакторинг, существующие тесты презентации должны проходить с тем же HTML (с точностью до расположения в секциях).

## S4. Лендинги: фолбэк «в других разделах»

На лендинге при непустом `q`:
- Посчитать `otherCount` из уже возвращаемых фасетов (`result.facets`, q-осведомлённые, `catalog-service.ts:1753-1783`):
  - malts: `sum(byCategory) - byFermentableSubtype.malt`
  - fermentables: `sum(byCategory) - byFermentableSubtype.fermentable`
  - остальные: `sum(byCategory) - byCategory[<категория>]`
- Если `otherCount > 0` и результаты в текущем разделе есть: под тулбаром (над списком) строка: «Ещё {otherCount} совпадений в других разделах — показать все» → `/catalog?q=...` (view сохранять; sort не переносить). Визуально — сдержанная строка, не баннер (text-sm text-muted-foreground, ссылка обычным линк-стилем).
- Если в текущем разделе 0 совпадений, а `otherCount > 0`: в пустом состоянии первой кнопкой «Показать {otherCount} совпадений в каталоге» → `/catalog?q=...` (вместе с существующей «Сбросить поиск»).
- Склонение «совпадений» — по правилам ru-плюрализации; посмотреть, есть ли готовый хелпер в `packages/shared`/`lib`, иначе локальная функция.
- Новых сервисных вызовов не требуется.
- На хабе фолбэк не нужен (поиск и так сквозной).

## S5. Роутинг и SEO

1. `apps/web/app/(public)/catalog/page.tsx` — легаси-редиректы ДО рендера (`permanentRedirect` из `next/navigation`):
   - `?category=` (и/или `?subtype=`) резолвится через `resolveCatalogLandingForFilter` → `permanentRedirect("/catalog/{slug}" + сохранённые q/view/sort/page)`;
   - `category=fermentable` без subtype (лендинг не резолвится) → `permanentRedirect("/catalog" + сохранённые q/view)`;
   - `?page=` (page>1) без category → `permanentRedirect("/catalog" + сохранённые q/view)` (у хаба нет пагинации);
   - обычный заход без легаси-параметров — рендер хаба, никаких редиректов.
2. `buildCatalogListMetadata` (`seo.ts:137-197`): для базового `/catalog` canonical всегда чистый `/catalog` — вариант `?page=N` больше не даёт self-canonical (ветку `seo.ts` про page на базовом пути убрать). Лендинги — без изменений (`?page=N` остаётся). `q`/`view=mine` → noindex без canonical — без изменений.
3. Sitemap/robots — без изменений.

## S6. Тесты

1. **Новые unit-тесты сервиса** (`apps/web/tests/catalog-hub-sections.test.ts`, мок уровня B — как `catalog-search-noise-and-sort.test.ts:104-146`): партиционирование по 7 секциям и порядок; сплит fermentable по subtype; лимит превью 6 и корректный total; q-группировка (порядок секций по лучшему матчу, лимит 10, срез шума как в listUserCatalogIngredients); view=mine; facets в той же форме, что у listUserCatalogIngredients; пустой каталог.
2. **Переписать хаб-тесты** в `ingredient-catalog-metadata-ui.test.ts`: мок `listCatalogHubSections` (function-level, уровень C); презентационные ассерты (бейджи, EBC-свотч, key stats, дубли desktop+mobile) — на рендер секции хаба; два soft-404 теста по page=999 — удалить (пагинации на хабе нет; поведение лендинга покрыть НЕ нужно — там код не менялся); добавить тесты: секции с total=0 скрыты; ссылка «Все N» ведёт на лендинг; сквозной поиск группирует и показывает «Все N в разделе»; фолбэк на лендинге (обе ветки: со списком и в пустом состоянии, корректный N).
3. **Обновить `ingredient-seo.test.ts:181-185`**: canonical `/catalog?page=3` → чистый `/catalog`. Тест 193-202 (category=fermentable без subtype → базовый canonical) остаётся валидным.
4. **Редиректы**: тест на page.tsx — `?category=hop` → permanentRedirect на `/catalog/hops` с переносом q; `?page=2` → на `/catalog` (мок `next/navigation`, как `notFound` в существующих тестах).
5. Прогон: `npx vitest run` по затронутым файлам + полный `npm run test`, `npm run typecheck`.

## S7. Приёмка (живой прогон)

Dev-сервер: хаб анонимом и залогиненным (`DEV_AUTH_EMAIL`), секции и счётчики, «Все N» → лендинг, сквозной поиск («citra» → секция хмеля первой), фолбэк на `/catalog/malts?q=citra` (0 в солоде → кнопка в пустом состоянии), «Мои», редиректы `?category=hop`/`?page=2`, отсутствие layout shift от JSON-LD, тёмная тема, mobile-вьюпорт.

## Вне скоупа

- Хлебные крошки на лендингах/хабе.
- Удаление `filteredByCategory`.
- Унификация `categoryLandingPaths` тулбара с `catalogCategoryLandings` (существующий дубль, отдельная уборка).
- Расширение intro-текстов, «популярные» превью вместо алфавитных.

## Итоги реализации и ревью (2026-07-07)

Реализовано 6 Sonnet-агентами по фазам, отревьюировано адверсариально (6 измерений × 2 скептика на находку). Коммиты в `feature/catalog-hub`: ТЗ → `feat` (хаб+сервис+редиректы) → `fix` (плоская обёртка секций, иерархия кнопок) → `fix` (регрессия P1).

Ключевые файлы: `features/ingredients/catalog-service.ts` (`listCatalogHubSections`), `contracts.ts` (типы + `CatalogLandingSlug` переехал сюда из `seo.ts`), `app/(public)/catalog/content.tsx` (`renderCatalogHub` + ветка лендинга с фолбэком), `app/(public)/catalog/page.tsx` (легаси-редиректы), `components/ingredients/catalog-items-list.tsx` (вынесенный рендер строк, общий для хаба и лендингов), `catalog-category-meta.ts` (иконки/цвета категорий без `"use client"`), тулбар (`showSort`, `resolveLandingPath`/`buildContextualHref`).

### Ловушка P1 (регрессия ревью, ПОЧИНЕНА)
Тулбар на лендинге строит `queryBasePath="/catalog"` (намеренно, чтобы не плодить `/catalog/hops?category=hop`). После введения легаси-редиректора `?category=` любой ввод в поиск и смена сортировки на лендинге строили `/catalog?category=hop&q=...` → 308 обратно на лендинг → **двойной round-trip на каждый дебаунс-ввод**. Фикс: на лендинге (`category !== "all"`) поиск/сортировка строят href прямо на путь лендинга без `?category=` (`resolveLandingPath`/`buildContextualHref`, module-level + юнит-тест `ingredient-catalog-toolbar-href.test.ts`). Легаси-вход `/catalog?category=X` по-прежнему 308 (закладки/старые ссылки). **Урок: клиентские билдеры href в тулбаре и серверные редиректы в page.tsx — связанная пара; правя один, проверять RSC-навигацию другого.**

### Спорная находка (fermentable без валидного subtype) — НЕ чиним код
`resolveHubSectionLanding` кладёт fermentable в секцию только при `subtype ∈ {malt, fermentable}`. Fermentable с `subtype=null`/мусором выпал бы из секций хаба И из строгого фильтра лендингов `listUserCatalogIngredients` (тот же критерий) — т.е. каталог согласован, но элемент невидим, при этом считается в `facets.byCategory`. Решение оркестратора: **строгая согласованность хаб↔лендинг важнее fallback-бакета** (клик «Все N» должен показывать ровно N). Механизм недостижим через штатный UI (нужен прямой вызов серверного экшена с рассогласованным `type/category`), в текущих данных потерь нет (проверено вживую: сумма секций 1208 = пилюля «Все» 1208; fermentable 449+174=623). Корень — тавтологичная проверка `category` в `buildCreateUserCustomIngredientSchema` (`features/inventory/contracts.ts`), **вне скоупа** этого рефактора. В код добавлен только комментарий-инвариант у `resolveHubSectionLanding`.

### Известное ограничение (предсуществующее, не наше)
`buildCatalogItemListJsonLd` считает `position` до фильтрации custom-элементов → при вырезании custom возможны разрывы в нумерации ItemList. Код идентичен дорефакторному, перенесён в хаб как есть. Незначимо для SEO, не трогали.

### Открытые хвосты
- Дыра в валидации custom-ингредиента (`features/inventory/contracts.ts`, тавтологичная проверка category) — отдельная задача.
- Живой прогон был на dev-данных под QA Admin; смоук анонимом отдельно не гонял (хаб для анонима = тот же путь без custom/избранного).
