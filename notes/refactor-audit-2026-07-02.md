# Аудит перед двухтрековым рефактором (продукт + UI/UX-код)

> Многоагентное исследование 2026-07-02, сверено по коду ветки
> `feat/navigation-app-first` (HEAD `3acbeed`). План работ — по этапам 0–8
> (план-файл сессии); связано с `docs/improvement-recommendations.md`,
> `docs/brewery-command-center-l2-redesign.md`, `notes/navigation-audit.md`.

## Решения владельца (2026-07-02)

1. **«Сварить» = две сущности:** (а) «Сварить самому» — виртуальный помощник
   варки (паузы, таймеры, «что сейчас делать») для варящих вручную;
   (б) «Сварить на автоматике» — через BrewForge. Клик «Сварить» запускает
   процесс, а не оставляет партию planned без сигнала.
2. **W5 включить полностью:** «Сварить рецепт» на пульте в простое + чужой
   published-рецепт на своём устройстве без клона.
3. **Декомпозиция recipe-designer — поэтапно:** сначала UX-фиксы + примитивы,
   полная разборка на хуки — отдельной финальной стадией.

## 1. Продуктовые сценарии — топ-10 обрывов

1. **Нет «Сварить рецепт» на пульте** (W5 из спеки L2 §7 не реализован;
   в idle только «Ручной режим», закомментировано в `live-dashboard-view.tsx`).
2. **«Сварить» ≠ «варится»**: CTA на публичном рецепте/карточках склада создаёт
   партию `planned`; для реального старта нужен второй, ничем не подсвеченный
   клик «Начать варку» в степпере партии.
3. **REMOTE_DISABLED теряется**: `startBrewOnDeviceAction` честно возвращает
   `ok:true, heatingStarted:false` + сообщение «нагрев не запущен», но
   `brew-on-device-modal` сразу делает `router.push`, не показывая его.
4. **Чужой рецепт → своё устройство = 3 лишних шага** (клон → редактор →
   «Варить на устройстве»), хотя сервисы уже умеют работать по партии.
5. **5 разных «Сварить»** с несогласованной семантикой и подтверждениями
   (одинаковый экшен: с confirm на публичной странице, без — на карточке склада).
6. **Нет итога завершённой варки**: при `completed` ни сводки (OG/FG/ABV/объём),
   ни призыва оценить исходный рецепт, ни дегустационных заметок; BrewDayGuide
   остаётся развёрнутым.
7. **Нет онбординга**: дашборд `/app` одинаков для дня 1 и дня 500; «С
   возвращением» при первом визите; «С чего начать» не адаптируется под нули.
8. **Каталог → склад ≥4 действия**, из списка каталога добавить нельзя (только
   через деталь); anon-CTA «Войти, чтобы добавить» без `next=`.
9. **`recipe-match-panel` (аноним)**: «Войдите, чтобы увидеть совпадение со
   складом» без `next=` — единственный обрыв контекста на публичном рецепте.
10. **Профиль недостроен**: вне дизайн-системы; управления push-подписками нет
    (готовый `NotificationOptIn` смонтирован только в devices-manager); смены
    пароля/OAuth-привязок нет.

## 2. Инвентаризация UI/UX-паттернов

- **Модалки:** 15 поверхностей, все — самописный `fixed inset-0` +
  `role="dialog"`; Radix `Dialog` из `@nb/ui` используется только в
  ui-playground. Ни одной с focus-trap/возвратом фокуса; scroll фона блокируют
  4 из 15 (`ConfirmActionDialog` — нет). Guard'ов несохранённых изменений нет
  (import-export теряет вставленный BeerXML по Esc). `PublicationReadinessDialog`
  — инлайн в recipe-designer. Фильтр-шиты recipes/bjcp — осознанная копия
  друг друга без общего Sheet.
- **Поиск:** ≥6 независимых реализаций — `IngredientPicker` (3172 строки,
  единственный шаренный, 7+ мест), `RecipeStylePicker` (независимый клиентский
  fuzzy), recipes-toolbar + ingredient-catalog-toolbar + inventory-toolbar
  (debounce+URL, три независимых кода без общего хука), admin/ingredients
  (GET-форма), admin/articles (поиска нет). Глобального поиска нет.
- **Добавление сущности — 5 паттернов** без системной причины: модалка (склад),
  drawer (ингредиент в рецепте, внутри те же формы), инлайн по `?mode=create`
  (оборудование), инлайн по `useState` (устройства), страница (каталог/статьи/
  рецепты).
- **Подтверждение удаления — 3 паттерна:** `ConfirmActionDialog` /
  `window.confirm` (статьи) / без подтверждения (`deleteEquipmentProfileAction`
  — голый form-submit).
- **Тосты:** два самописных дубля (`SavedToast`, `ControlToast`), ToastScaffold
  из `@nb/ui` мёртв. Словарь ошибок пайринга устройств продублирован с разными
  текстами (`translatePairError` vs `ERROR_TEXT`).
- **error/loading:** `error.tsx` только у ingredients/recipes-веток; root
  `error.tsx` нет; `loading.tsx` нет у equipment (при готовом
  `EquipmentPageSkeleton`!), devices/*, admin/*, brew-batches; часть
  recipes-loading рисует inline pulse мимо `section-skeletons.tsx`.
- **@nb/ui:** Button с полной cva-системой (default/outline/ghost/primary/
  danger/dangerOutline, size sm/md ≥44px), но пакет импортируют 16 из 233
  tsx-файлов; ~24 файла дублируют классы primary-кнопки руками; нет
  Popover/Sheet/DropdownMenu/Tooltip/Tabs; 4 ручных дропдауна (2 — дословная
  копия друг друга).

## 3. Верификация известных долгов (по коду на ветке)

**Закрыто:** per-fermentable efficiency (`a5be00e`, `appliesBrewhouseEfficiency`);
sticky-шапка метрик в редакторе; пульт W1–W4 подключены (MonitorHero/StatusStrip/
ControlDock/StatusPill/DeviceHeader/deriveDeviceMode → device-console);
терминология чиста (хмелестояние/слоты в UI — 0; «на борту» — 1 строка в
`api/devices/[id]/recipes/route.ts`); весь навигационный аудит подтверждён;
`preferredGravityUnit` настраивается в профиле.

**Открыто:** `recipe-designer.tsx` — 6467 строк, 44 useState в главном
компоненте; `dryHopPlan` отсутствует (stage=fermentation вообще не попадает в
`BrewPlanSnapshot`; `packagingPlan` собирается, но brew-day его не рендерит);
`StockConsumeDialog` — dead code (не рендерится, в редакторе one-click consume);
`scaleRecipeToVolume` не подключён в редакторе; FG-диапазон (fgRangeMin/Max)
посчитан, но не показан; `inputMode` в редакторе — 0 при 25 `type="number"`;
нормализации запятой на вводе нет; confirm при закрытии дровера нет; мёртвый
код: StockCoverageBlock/InteropBlock/BrewModeFoundationBlock/useIsMobile-цепочка.

**W5:** коммит `3acbeed` («варка из каталога») = `startBrewFromRecipeAction`
(виртуальная партия без клона, в т.ч. чужой published) + кнопки на публичной
странице и карточках склада. Device-first push из каталога/пульта — отсутствует.

## 4. Находки для реализации (не переоткрывать)

- `createBrewBatchFromRecipe` и `startBrewOnDevice` уже принимают чужой
  published-рецепт (ownership по партии) — «чужой → устройство» = композиция
  двух готовых функций, домен не трогать.
- `BrewDayGuide` рендерится независимо от статуса партии — «второй клик» из
  боли №2 относится к степперу `BrewLifecycle`.
- `pushRecipeToSlot`/`listPushableRecipes` остаются own-only (панель «Рецепты
  пивоварни» вторична по спеке §8).
- В `packages/ui` уже стоят Radix dialog/toast + транзитивные
  popper/dismissable-layer — добавление popover/dropdown-menu низкорисковое.
- `animate-modal-*` keyframes в `app/globals.css` — готовая база анимаций Dialog.
- Tailwind `content` не сканирует `features/**` — классы там работают случайно;
  перенос тостов в `packages/ui` (сканируется) снижает скрытый риск.
- `parseDecimalInput` (запятая→точка) уже есть в
  `features/forms/numeric-validation.ts` — NumericInput строить на нём;
  реальная мобильная боль в `type="number"` (браузер режет ввод до хендлеров).
- В recipe-designer типы/подкомпоненты = строки 1–4778 (уже top-level функции,
  переносятся в файлы механически), тело RecipeDesigner = 4779–6467.
- Словарей ошибок устройств 4: пайринг ×2 (дедупить в один), config/onboard —
  другой домен (не смешивать).
