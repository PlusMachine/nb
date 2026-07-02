# Roadmap — rebuild «витрина → мастерская»

Рабочая дорожная карта продукта. Источник истины по порядку шагов и принятым
продуктовым решениям. Архитектура — в `CONTEXT.md`, памятка — в `CLAUDE.md`,
технические референсы подсистем — в `docs/reference/`.

## Продуктовая модель

Web-first платформа для домашних пивоваров. Две петли:

- **Витрина (публичная, без логина)** — контент/гайды на главной, рецепты
  сообщества, BJCP, калькуляторы. Привлекает (SEO).
- **Мастерская (рабочая зона, требует логина)** — рецепт из склада → Match
  «что можно сварить» → варка в двух режимах (виртуальный on-screen гид /
  автоматика на своём контроллере BrewForge) → журнал замеров. Удерживает.
  Подробности по режимам — раздел «Режимы исполнения варки» ниже.

**Рецепт — центр гравитации.** Принцип последовательности: между этапами держим
«следующий логичный шаг»; retention (мастерская) раньше acquisition (контент).
UI самоочевидный из IA/иконок/порядка, без поясняющих подзаголовков под кнопками.

> Кандидаты названия: «NB» и «hmelo» — финальный выбор за владельцем; не
> «чинить» одно на другое автоматически.

---

## Track B — мастерская (в работе)

### Сделано (июнь 2026)

1. **Навигационный скелет.** Единый конфиг `apps/web/lib/navigation.ts`; сайдбар
   рабочей зоны (`components/app/app-sidebar-nav.tsx` + `app-shell.tsx` с
   мобильным drawer/bottom-nav); дуальный хром `components/shared/public-shell.tsx`
   (залогиненному справочники открываются в сайдбаре); хаб «Рецепты» с табами
   Мои/Сохранённые/Найти; раздел «Варки» `/app/brew-batches`; якоря регистрации
   (save/rating → `/login?next=`, см. `lib/auth-links.ts`).

2. **Match-бейдж «можно сварить / почти».** На карточках рецептов
   (discovery/Мои/Сохранённые): батч `computeRecipeMatchesForUser` +
   `loadRecipeMatchStates` (server action) + `RecipeMatchProvider` (after-hydration,
   cache-safe) + `RecipeMatchBadge` + чистый `resolveBrewabilityBadge`. Порог по
   ДОЛЕ типов ингредиентов ≥70% И не более 2 недостающих (`MAX_ALMOST_MISSING`);
   «можно сварить» = есть все типы (кол-во не строго).

3. **Правки движка матчинга** (`features/recipes/match-service.ts`):
   - дрожжи матчатся по **наличию штамма**, а не по количеству (`presenceBased`):
     тот же штамм (exactKey) на складе в любой единице → covered. Чинит «ложное
     нет» когда рецепт в `pack`, а склад в `g`. Штамм-специфичность сохранена.
   - бренд-каскад/обобщённые сорта через `groupKey` (Pilsner разных брендов и т.п.).

4. **«Добавить на склад» из панели рецепта** (НЕ «докупить» — магазина нет).
   В `RecipeMatchPanel` секция «Не хватает на складе»: недостающие/частичные
   каталожные строки с инлайн-полем (предзаполнено нехваткой в человеческой
   единице) → `addRecipeIngredientToInventory` (cache-safe) → панель
   перезапрашивает матч. `RecipeMatchLineDto` расширен полями каталога +
   `suggestedAddQuantity/Unit` (округление ВВЕРХ, иначе строка осталась бы partial).

5. **Жизненный цикл варки + журнал замеров OG/FG.** Детальная страница
   `/app/brew-batches/[id]` — «центр управления варкой»: статус-степпер (гибкий:
   любой переход + отмена), журнал замеров (SG, OG=ранний/FG=поздний, ABV и
   сбраживание vs цели рецепта), заметки; device-дашборд — секцией при `deviceId`.
   Таблица `brew_measurements` (миграция 0037), сервис + `summarizeBrewMeasurements`
   + `[id]/actions.ts`.

6. **Дашборд-командный центр** (`/app`, был заглушкой). Свёл петлю воедино:
   - «Активные варки» (planned/brewing/fermenting): карточки отсортированы по
     срочности подсказки «следующего шага» (`features/brew-batches/dashboard.ts`,
     чистый `resolveBrewNudge` + тесты): «пора начинать» / «запишите OG» /
     «N дней без замера — проверьте FG» (порог `STALE_MEASUREMENT_DAYS`=5);
   - «Можно сварить сейчас» — СВОИ рецепты (схлопнуты до последней версии в
     семействе), у которых на складе есть все типы ингредиентов
     (`findBrewableOwnRecipesForUser`, tier `ready` из `resolveBrewabilityBadge`);
   - статы (рецепты / в наличии / всего позиций), быстрые входы (создать рецепт,
     склад, каталог), discover-полоска (стили / калькуляторы / публичные рецепты).
   Секции count-conditional: новый юзер видит чистый онбординг, активный — петлю
   сверху. Новые сервисы: `listActiveBrewBatchesForUser` (активные + агрегат
   журнала замеров ОДНИМ grouped-запросом, без N+1; слим-`columns`-проекция) и
   `countRecipesForAuthor` (индексный count вместо загрузки строк/версий). UI без
   слоп-подписей: карточки = иконка + название. Бейдж/степпер варки вынесены в
   общий `brewBatchStatusBadgeClass` (3 поверхности). Адверс-ревью (3 lens × verify,
   15 агентов): 0 корректностных багов, 8 quality-находок пофикшено.

> Track B завершён: рабочая петля замкнута рецепт → склад → варка → журнал →
> дашборд. Полировка в бэклоге (не блокеры): один-клик «начать варку» прямо из
> дашборда (сейчас ведёт в редактор, где штатная кнопка «Начать варку»); общий
> core для `findBrewableOwnRecipes`/`findBrewableRecipes`, если разойдутся.

---

## Режимы исполнения варки (виртуальный / устройство BrewForge)

**Продуктовое решение:** свой рецепт можно варить в ДВУХ режимах. Оба создают одну
сущность `brew_batch` и идут по одному жизненному циклу (статус-степпер + журнал
замеров OG/FG + заметки, Track B #5–6); различие — «контур исполнения» и привязка
устройства через `brew_batches.device_id`.

1. **Виртуальный (ручной).** Без устройства (`device_id = NULL`). Человек сам
   управляет своим оборудованием, портал — гид и контроль: на экране показываются
   шаги/паузы/тайминги (затор, кипячение, засыпи хмеля, температуры), плюс журнал
   замеров. Точка входа: «Сварить» (`BrewPickerDialog`) → виртуальная партия.
   - **Есть:** `brew_batch` создаётся; деталь = статус-степпер + журнал + заметки;
     план варки лежит в `brewPlanSnapshot` (mashSteps / boilPlan.timedAdditions /
     whirlpool / fermentation), генерится `@nb/brewing-core generateBrewSteps`.
   - **Есть (сделано):** пошаговый «варочный день» на экране — рендер
     `brewPlanSnapshot` живым чек-листом (`features/brew-batches/brew-day.ts` +
     компонент `brew-day-guide.tsx`): группы затор/кипячение/вирпул/брожение,
     таймеры пауз/кипячения (переживают reload через `timerStartedAt`), отметки
     «шаг выполнен». Прогресс — колонка `brew_day_progress` (миграция 0038),
     атомарное обновление через `setBrewDayStepState` (tx + `FOR UPDATE`). Секция
     показывается только при `device_id = NULL` (виртуальный аналог device-дашборда).
   - **Есть (сделано):** списание склада на варку — `features/brew-batches/inventory.ts`
     (`consumeBrewBatchInventory`/`restoreBrewBatchInventory`/`getBrewBatchInventoryView`):
     авто-подбор склада + consume активных аллокаций с привязкой к `brewBatchId`,
     компенсирующий откат (release) при отмене варки, рецепт-скоупный гард от
     двойного списания. Секция «Склад» на странице партии.

2. **Автоматический (BrewForge).** Через собственный контроллер BrewForge (ESP32-S3;
   прошивка в соседнем репо `../brewforge`), запускается ПРЯМО с сайта nb. Точка
   входа: та же «Сварить» (`BrewPickerDialog`) → выбор устройства (`device-picker-list.tsx` /
   `brew-recipe-on-device-picker.tsx`) → `startBrewOnDeviceAction`:
   openSession → push рецепта → START_BREW; статус `brewing`, привязка `device_id`).
   Деталь варки показывает live-дашборд и график телеметрии (секция при `device_id`).
   - **Есть:** контракт `@nb/brewforge-protocol` (zod, заморожен; прошивка зеркалит
     в cJSON), `features/brew-controller` (провайдер устройства + транслятор рецепта),
     `features/devices` (пайринг/токены/конфиги), два транспорта (LAN напрямую +
     облако через `apps/bridge` MQTT↔WS↔Postgres), симулятор `@nb/device-sim`.
     Safety нагрева живёт на устройстве — портал её не ослабляет.
   - **Есть (2026-06-29): облачный путь «варка откуда угодно».** Портал подключён к
     облаку: `cloud-transport.ts` + `mqtt-client.ts` — для устройства БЕЗ `localUrl`
     (или при `BREWFORGE_PREFER_CLOUD`) телеметрию читаем из `brew_telemetry` (её
     пишет мост), команды/рецепт публикуем в брокер, ack коррелируем по `cmd.id`
     (фикс: `device_commands.id = cmd.id`). `live-dashboard` и `startBrewOnDevice`
     работают по обоим транспортам без изменений. `device-sim --mqtt` + прошивочный
     лог `recipe_saved` (для cloud START_BREW по слоту). Env `BREWFORGE_MQTT_URL`.
     Верифицировано e2e (mosquitto+мост+sim): телеметрия, Пауза/Продолжить/Пропустить,
     cloud start-brew (DOUGH_IN). `apps/web/scripts/brewforge-cloud-*-e2e.ts`.
   - **Референсы:** интеграция со стороны nb — `docs/brewforge-integration.md`;
     полный план/протокол прошивки — `../brewforge/docs/PHASE2-4_PLAN.md`.

> Оба режима — поверх готового жизненного цикла варки. Виртуальный «гид варочного
> дня» — ближайший инкремент мастерской; BrewForge — параллельный трек (идёт в
> `../brewforge` + `docs/brewforge-integration.md`), его статус/фазы там.

---

## Track A — витрина/контент

### Сделано (Phase 2–3)

- **Контент-CMS** по `docs/articles-rollout-plan.md`: таблица `content_articles`
  (миграция 0039) + `features/content-articles` (service: CRUD, role-gating через
  `getContentCapabilities`, slug, reading-time, публичные/админ-чтения). Типы:
  гайд/обзор; статусы draft/published/archived. BJCP остаётся file-backed.
- **Админ-CRUD** `/admin/articles` (список + статусы), `/admin/articles/new`,
  `/admin/articles/[id]/edit` — Tiptap-редактор тела (`content-body-editor.tsx`),
  publish/feature/delete по ролям (editor черновики, moderator публикует/выводит
  на главную, admin всё). Server actions с `requireContentRole`.
- **Публичная зона**: хаб `/guides` + страница `/guides/[slug]` (безопасный
  рендер Tiptap JSON → React `tiptap-content.tsx` с санитайзингом ссылок, SEO
  metadata + JSON-LD). Cache-safe (не читают сессию).
- **Главная** переделана в хаб гайдов (продуктовый H1 + featured-гайды из CMS +
  BJCP + точки входа), `/guides` добавлен в навигацию.

### Осталось (Phase 4)

- Реальный upload обложек/изображений (storage adapter вместо текстового
  `coverImageUrl`), OG-images, canonical/robots tuning, расширение JSON-LD.
- Обоснование порядка: контент-CMS дороже и SEO окупается с лагом, поэтому после
  рабочей петли.

---

## Ключевые технические конвенции (чтобы не переоткрывать)

- **Cache-safety публичных страниц.** Публичные документы (`/recipes`,
  `/recipes/[slug]`) НЕ читают сессию/cookie → остаются кэшируемыми. Любой
  per-user слой (saves, match, «добавить на склад») грузится ПОСЛЕ гидрации через
  server action (`getSessionUser` внутри экшена), не на странице.
- **Доменная логика — в `features/*` или `@nb/*`,** не в компонентах. Контракты —
  `features/*/contracts.ts`. Чистые хелперы (резолверы бейджа, сводки замеров)
  выносить отдельно и покрывать юнит-тестами без БД/React.
- **React 18:** `useTransition().isPending` НЕ держится на `await` серверного
  экшена. Для in-flight UI/анти-дабл-сабмита вести явный `busy` (useState) +
  `inFlight` (useRef) с try/finally, а не полагаться на `isPending`.
- **Время в client-компонентах:** форматирование Date зависит от TZ → SSR(сервер)
  vs hydration(браузер) расходятся. Использовать `suppressHydrationWarning` на
  узле с временем; ввод `datetime-local` конвертить в ISO на клиенте перед
  отправкой (иначе сервер распарсит наивное время в своей TZ).
- **Проверка фич на реальных данных:** `npm run seed:sample` (склад + оборудование
  + рецепты для `DEV_AUTH_EMAIL`); dev-автологин через `DEV_AUTH_EMAIL`.
- **Перед завершением правок:** `npx tsc -p apps/web/tsconfig.json --noEmit` (или
  по затронутому workspace) + затронутые тесты. Пре-существующие падения (на
  момент июня 2026): `recipe-editor-components`, `recipe-service`,
  `recipes-filter-sheet` — не регрессии.

### Caveat по миграциям (важно)

В `_journal.json` у миграций 0032/0033 были фейковые «будущие» таймстампы, из-за
чего drizzle (apply по `created_at > watermark`) пропускал все более поздние
миграции (0034 BrewForge device-таблицы, 0035, 0036, 0037) на любой БД. Починено
бампом `when` 0034–0037 выше 0033. **Если на какой-то БД device-таблицы 0034–0036
уже были применены, повторный `npm run db:migrate` упадёт «relation exists» →
`npm run db:reset`.** Также `@nb/brewforge-protocol` (`type:module`, импорты с
`.js` на `.ts`) добавлен в `transpilePackages` + `resolve.extensionAlias` в
`apps/web/next.config.ts` — иначе device-дашборд отдавал 500.

---

## Связанные документы

- `CONTEXT.md` — архитектура и канонический контекст
- `docs/reference/*` — глубокие референсы подсистем (inventory, recipes-editor,
  equipment, water, …)
- `docs/articles-rollout-plan.md` — план Track A (контент-CMS)
- `docs/brewforge-integration.md` — интеграция устройств BrewForge
- `docs/improvement-recommendations.md` — расширенный аудит/идеи
