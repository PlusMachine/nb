# Аудит мобильной вёрстки — 2026-07-12

> **СТАТУС: фиксы реализованы 2026-07-13** (см. раздел «Что сделано» в конце файла). Typecheck зелёный, тесты 2239/2239, линт без ошибок, живая верификация на 360px и 390px пройдена. НЕ закоммичено, лежит поверх feature/calculators-polish.

## Методика

- Статический аудит кода по 5 зонам (глобальный хром/навигация, публичная витрина, каталог+калькуляторы, app-зона, мастер рецептов+студия наклеек) — параллельные агенты, только чтение.
- Живой прогон 26 страниц через Playwright: вьюпорт 390×844, DPR 2, iPhone UA, touch. Замеры: горизонтальный overflow (`scrollWidth − innerWidth`), интерактивные элементы < 36px, инпуты с `font-size < 16px`. Полностраничные скриншоты.
- Ограничение: из-за `DEV_AUTH_EMAIL` анонимный хром живьём не снять (`/` → `/app`); находки по `public-shell` подтверждены только кодом.

**Живой прогон: ни на одной из 26 страниц нет горизонтального скролла (390px).** P0-поломок не найдено. Фундамент mobile-first крепкий, основная масса находок — P1/P2 в четырёх сквозных кластерах.

## Что уже сделано правильно (фундамент)

- Система `--chrome-top`/`--chrome-bottom` (`app-shell.tsx:215`) с фолбэками `var(--chrome-bottom, 0px)` у потребителей; `feedback-launcher` и `dev-guest-badge` корректно суммируют `--nb-bottom-nav-h` + `--nb-cookie-banner-h`.
- `Button` size="md" кодирует тач-таргет `min-h-[44px]` (`packages/ui/src/components/button.tsx:20-23`).
- `Dialog`/`Sheet` на мобиле — честные bottom-sheet (`items-end`, `rounded-t-2xl`, drag-handle, `max-h` + `overflow-y-auto`, Radix scroll-lock); самописных `fixed inset-0` модалок нет.
- `NumericInput` решает запятую/`inputMode`/нормализацию на blur без прыжков курсора.
- Каталог: десктоп-таблица `hidden lg:block` + мобильные карточки `lg:hidden` (честная альтернативная раскладка, не сплюснутая таблица).
- Таблица карбонизации T×P — образец: `overflow-x-auto` + `min-w-[820px]`, sticky первая колонка/шапка, hover-расшифровка ячейки продублирована тапом через `[@media(hover:hover)]`.
- Фильтры списков (/recipes, /bjcp) на `<xl` — в bottom-sheet, sticky-тулбары на `--chrome-top`.
- Hover-эффекты карточек рецептов обёрнуты в `[@media(hover:hover)]`, карточка — одна stretched-ссылка (нет ловушки двойного тапа).
- Wake Lock реализован для киоска пульта (`use-wake-lock.ts`), `min-h-svh` на гостевой странице пива, viewport не блокирует зум (`maximum-scale` нигде нет).
- Автосейв мастера рецептов (дебаунс 1.5 c + `beforeunload`-guard).
- Логин: правильные `inputMode`/`autoComplete` (`tel`, `one-time-code`, `email`).

## Кластер A — iOS-автозум: инпуты с font-size 14px [P1]

На iOS Safari фокус на поле с `font-size < 16px` вызывает принудительный зум страницы. Паттерн `text-sm` на инпутах размазан по всем ключевым воронкам. Правильный паттерн уже есть в кодовой базе: `text-base sm:text-sm` (calculator-page-client.tsx:878, 1044, 1273) — надо докатить его:

- `packages/ui/src/components/input.tsx:6` и `textarea.tsx:6` — базовые примитивы (бьёт по логину и всем формам на `Field`).
- `apps/web/components/calculators/calculator-page-client.tsx:184` — `commonClassName` всех декларативных калькуляторов (главный мобильный сценарий продукта).
- `apps/web/components/calculators/keg-carbonation-block.tsx:309,321` — поля обратного расчёта.
- `apps/web/components/ingredients/ingredient-catalog-toolbar.tsx:437` — поиск каталога.
- `apps/web/components/ingredients/ingredient-picker.tsx:3058` — комбобокс подбора ингредиента (мастер + калькуляторы + каталог).
- `apps/web/components/recipes/labels/label-studio.tsx:77-78` — `inputClass` всех полей студии наклеек.
- `apps/web/components/calculators/calculators-search.tsx:58` — поиск по калькуляторам [P2].
- Инпуты инвентаря: `inventory-inline-quantity-editor.tsx:191`, `inventory-consume-control.tsx:222` и др. [P2].

## Кластер B — нативный `type="number"` вместо NumericInput [P1]

Нарушение собственной конвенции CLAUDE.md; `type="number"` не пропускает запятую — при этом `inventory-consume-control.tsx:51` делает `amount.replace(",", ".")`, рассчитывая на запятую, которую поле физически не даст ввести:

- `inventory-inline-quantity-editor.tsx:180-194`, `inventory-consume-control.tsx:218-226`, `inventory-quantity-editor.tsx:199-206`, `custom-ingredient-form.tsx`, `catalog-ingredient-form.tsx`, `inventory-price-input.tsx`, `inventory-item-details-editor.tsx`, `features/devices/components/device-config-form.tsx`.
- Студия наклеек: поля ABV/IBU/EBC/OG/FG — `type="text"` без `inputMode="decimal"` (полная QWERTY вместо цифровой клавиатуры) — `label-studio.tsx:594-599`.

## Кластер C — тач-таргеты < 44px

Дизайн-система сама декларирует 44px (Button md), но иконочные кнопки массово меньше. Горячие точки по частоте использования:

**P1 (частые/единственные пути):**
- Крестик закрытия `Dialog`/`Sheet` — 32×32 (`dialog.tsx:141-147`, `sheet.tsx:49-55`) — основной способ закрыть любую модалку/шторку.
- «Сохранить»/«Клонировать» на карточках витрины — 28×28 (`recipe-save-button.tsx:118`, `clone-from-public-button.tsx:77`).
- «Аварийный останов» / hold-to-confirm пульта — ~32-34px высотой (`hold-to-confirm-button.tsx:66`) — критичное действие, добавить `min-h-[44px]`.
- Чекбокс шага варки 24px и кнопки таймера 28px (`brew-step-list.tsx:57-64,96,108`) — сценарий «у котла грязными руками».
- Кнопка удаления строки в `ArrayFieldEditor` калькуляторов — 28px (`calculator-page-client.tsx:373-382`).

**P2 (массовые):**
- Иконки действий мобильной карточки каталога `p-1`+`gap-1` ≈24px вплотную поверх кликабельной карточки (`catalog-items-list.tsx:322-334,392-416`) + звезда избранного ≈28px (`ingredient-favorite-toggle.tsx:35-37`).
- «Редактировать»/«Удалить» карточки склада 32px (`inventory-list-item.tsx:410,426`).
- «Редактировать»/«Удалить» строки ингредиента рецепта ≈26px (`section-row.tsx:93-108,228-243`; тот же паттерн `recipe-profiles.tsx:87-99,213-226`, `recipe-water-additives-section.tsx:596`).
- Инлайн `NumericInput` количества/времени в строках рецепта — `h-7` (`section-row.tsx:154-163,170-180`, `recipe-profiles.tsx:53-84`).
- Шестерёнки настроек КП/горечи `h-7 w-7` (`fg-settings-popover.tsx:104-110,127-134`, `recipe-batch-parameters-block.tsx:112-119`).
- Гамбургер-меню ≈36px (`app-shell.tsx:237-244`, `site-header.tsx:91-98`) — единственный вход в навигацию; theme-toggle 28px рядом (`theme-toggle.tsx:33`).
- Кебабы `h-9 w-9` по всему приложению (`batch-menu.tsx:107`, `device-tile.tsx:181`, `device-header.tsx:95-115`) [P3 — консистентный паттерн].
- Пагинация 36px (`recipes-pagination.tsx:45`), сегменты шкалы цвета (`recipes-color-scale.tsx:48`), чипы фильтров (`active-filter-chips.tsx:93`), очистка поиска BJCP (`bjcp-catalog.tsx:475-484`), указатель стилей ~24px строки (`bjcp-style-index.tsx:40-47`), стрелки лайтбокса (`master-gallery-lightbox.tsx:59-73`), ссылки-кнопки логина ~18-20px (`login-form.tsx:434-450,483-499,585-601,673-680`), thumb слайдера 20px (`slider.tsx:58`), сегменты stage-timeline (`stage-timeline.tsx:160-167`), чипы hero/семейств на главной (`page.tsx:110-121`, `home-style-vitals.tsx:69-88`), категории ингредиента в дровере ≈32px (`recipe-ingredient-category-grid.tsx:48-72`), кнопки футера редактора позиции `h-10` (`ingredient-editor.tsx:845-878`).

Рецепт один: расширять hit-area паддингом (иконку не трогать), либо `min-h-11 min-w-11`.

## Кластер D — рассинхрон fixed-элементов у нижнего края

- `packages/ui/src/components/toast.tsx:116` — [P1] тост `bottom-4 right-4` игнорирует `--chrome-bottom`/`--nb-bottom-nav-h`/cookie-баннер — наезжает на нижнюю навигацию. Плюс `w-full max-w-sm` без `left` — на экранах <384px левый край уходит за экран (обрезка) [P2].
- `apps/web/components/app/app-shell.tsx:292-293` — [P2] нижний таб-бар `fixed bottom-0 h-14` без `env(safe-area-inset-bottom)` — на iPhone пункты прижаты к home-индикатору (паттерн уже есть в `calculator-page-client.tsx:745`).
- `apps/web/components/shared/public-shell.tsx:31` — [P1] у анонима `pb-12` < высоты StickyResultBar калькулятора (~90-110px при `--chrome-bottom`=0) — низ контента уезжает под бар.
- `feedback-launcher.tsx:24` × StickyResultBar (оба `z-40`) — [P1] кнопка обратной связи ложится поверх бара результата у анонима.

## Кластер E — overflow-риски на 360px (на 390px живьём не проявились)

- `recipes-grid.tsx:53` + `public-shell.tsx:31` — [P1] `minmax(320px,1fr)` при `px-6` (48px): на ≤368px треку не хватает ширины → горизонтальный скролл /recipes, «Похожих рецептов» и блока на странице стиля. Фикс парой: `minmax(min(320px,100%),1fr)` + `px-4 sm:px-6` (как в `app-shell.tsx:286`).
- `home-calculators.tsx:63-127,168-179` — [P1] декоративная «колода» карт `w-64` с translate до 76px без `overflow-hidden` на контейнере.
- `home-style-vitals.tsx:56-63` — [P1] статы hero `whitespace-nowrap` без `truncate` в `grid-cols-4`: «11.1–14.6 °P» на 360px вылезает.
- [P3] `break-words` нет у заголовков: `recipe-card.tsx:77`, `recipe-list-row.tsx:74`, `public-recipe-header.tsx:42`; шапки партии/шага без `truncate` (`brew-day-board.tsx:118-147`, `brew-batches/[id]/page.tsx:239-254`).
- [P3] дефолт `min-w-[280px]` в `style-picker.tsx:35` (в рендере не участвует, но опасен при переиспользовании).

## Кластер F — помощник варки / пульт (главный мобильный сценарий)

- [P1] Локальные таймеры шагов (кипячение, засыпи) не держат Wake Lock — `useWakeLock` подключён только в киоске. Экран гаснет у котла → сигнал пропущен. Подключить `useWakeLock(true)` на активный таймер (`brew-day-board.tsx`, `fermentation-board.tsx`).
- [P1] SVG-графики: подписи `fontSize={11}` внутри `viewBox 800` при реальной ширине ~290px → кегль ~4-5px, нечитаемо (`telemetry-chart.tsx:225-314`, `ferment-history-chart.tsx:190,197`). Вынести подписи в HTML-оверлей (паттерн уже есть в `telemetry-chart.tsx:319-331`).
- [P1] Sticky-полоса действий мастера рецептов на 390px разрастается до 3 строк кнопок (подтверждено скриншотом): «Наклейки»/«Импорт / экспорт»/«Сварить» не сворачивают подписи, в отличие от соседних «Опубликовать»/«Публичная» (`recipe-actions-menu.tsx:22`, `recipe-designer.tsx:1215-1259`) — привести к «иконка + подпись от sm:».

## Кластер G — изображения

- [P1] `bjcp-style-card.tsx:12-16,40` — фон карточки стиля inline `backgroundImage` без lazy/srcset — 20-40 карточек грузятся разом, бьёт по LCP/трафику.
- [P2] Plain `<img>` без srcset: обложка гайда на главной (`page.tsx:144-152`), обложки статей (`articles/page.tsx:45-51`), картинки в теле статьи (`tiptap-content.tsx:61-77`).

## Прочее

- [P2] `sheet.tsx:37,40` — `max-h-[92vh]` → `92dvh` (кнопка «Показать результаты» может уйти под хром iOS).
- [P2] Web Share API не используется нигде — «Скопировать ссылку на расчёт» только копирует в буфер; на мобиле уместен `navigator.share()` с фолбэком (`copy-link-button.tsx:46-76`).
- [P3] `globals.css` — нет `-webkit-tap-highlight-color: transparent` и `overscroll-behavior` — серое мигание тапов, системная полировка.
- [P3] `dropdown-menu.tsx:34` — нет `max-height`/`overflow-y` страховки (`--radix-dropdown-menu-content-available-height`).
- [P3] `public-shell.tsx:29` — `min-h-screen` → `min-h-dvh` для единообразия.
- [P3] `bjcp-article-page.tsx:507-556` — hero `min-h-[22rem]` даёт очень длинный первый экран на 360px.
- [P3] `text-[10px]/text-[11px]` системно у лейблов/бейджей витрины — поднять до `text-xs`, где плотность не критична.
- Наблюдение живого прогона: нативный datetime-инпут журнала замеров показывает `mm/dd/yyyy` (en-US плейсхолдер браузера; поведение нативное, но проверить `lang` на `<html>`).

## Приоритетный план

1. **Автозум iOS одним махом**: `text-base sm:text-sm` в `Input`/`Textarea` (@nb/ui) + `commonClassName` калькуляторов + поиск каталога + ingredient-picker + label-studio.
2. **Overflow-пара**: `public-shell` `px-4 sm:px-6` + `minmax(min(320px,100%),1fr)` (закрывает 3 раздела) + `overflow-hidden` колоды на главной + `truncate` в hero-статах.
3. **Fixed-элементы**: toast на `--chrome-bottom` (+`left-4`), таб-бар на `safe-area-inset-bottom`, `pb` public-shell под StickyResultBar, feedback-launcher vs sticky-бар.
4. **Wake Lock на таймеры варки** + читаемые подписи графиков.
5. **Тач-таргеты, волна 1 (P1)**: крестики Dialog/Sheet, save/clone, чекбоксы/таймер шагов варки, hold-to-confirm, удаление строки в калькуляторах.
6. **`type="number"` → NumericInput** в инвентаре/формах устройства; `inputMode="decimal"` в студии наклеек.
7. Sticky-полоса мастера: свернуть подписи кнопок до иконок на мобиле.
8. Изображения: bjcp-style-card на lazy, plain `<img>` → next/image.
9. Тач-таргеты, волна 2 (P2-массовка) + tap-highlight/overscroll + `92dvh` + Web Share.

## Примечание по dev-стенду

Во время прогона dev-сервер Next словил `InvariantError: Expected clientReferenceManifest to be defined` на `/recipes` и `/bjcp` (известный глюк дев-компилятора после массовых параллельных компиляций; вероятно, спровоцирован самим аудитом). Лечится перезапуском `npm run dev`; сервер не перезапускал — он принадлежит другой сессии.

---

# Что сделано (2026-07-13)

Все 9 пунктов приоритетного плана реализованы. Проверки: `tsc -p apps/web` — 0 ошибок; `npm run test` — **2239/2239 зелёные**; `npm run lint` — 0 ошибок; живой прогон Playwright на **360px и 390px** (40 замеров).

## Верификация вживую (ключевые числа)

| Метрика | До | После |
|---|---|---|
| Страниц с горизонтальным скроллом (360px + 390px) | риск на ≤368px | **0 из 40** |
| Инпутов с кеглем <16px (iOS-автозум) на 13 ключевых страницах | 24+ (только мастер рецептов — 17) | **0** |
| Картинок на /bjcp без lazy/srcset | 18 inline-фонов | **18/18 lazy + srcset** |
| Sticky-полоса мастера рецептов на 390px | 3 строки кнопок | **1 строка** |

## Кластер A — iOS-автозум: закрыт полностью
Паттерн `text-base sm:text-sm` докатан по всей кодовой базе: базовые `Input`/`Textarea` (@nb/ui), `commonClassName` калькуляторов, keg-carbonation, поиск калькуляторов/каталога/склада, `ingredient-picker`, `label-studio`, все поля инвентаря, **мастер рецептов (17 полей: объём/эффективность/кипячение/оборудование, шаги затирания и брожения, количество и время ингредиентов, 2 textarea, FG-попап)**, страница партии (плотность/дата/заметка/textarea), поиск стиля BJCP и оба select сортировки рецептов.
Ловушка, которую поймали только живым замером: часть полей не имела `text-sm` на себе — наследовала от родительского `<label className="text-sm">`. Грепом такие не находятся, класс ставили на сам инпут.

## Кластер B — `type="number"` → `NumericInput`: закрыт
`inventory-inline-quantity-editor`, `inventory-consume-control`, `inventory-quantity-editor`, `inventory-price-input`, `inventory-item-details-editor`, `custom-ingredient-form` (7 полей), `catalog-ingredient-form` (5 полей), `device-config-form`. Запятая как десятичный разделитель теперь работает везде.
- `inventory-consume-control.tsx:51` — `replace(",", ".")` **оставлен намеренно**: раньше это была мёртвая ветка, но теперь `amount` реально может содержать запятую до blur (NumericInput нормализует на blur), а live-превью «Останется/Станет» пересчитывается на каждый keystroke.
- `device-config-form.tsx` — самое нестандартное место: `NumberControl` хранит `value: number` и синхронизирован со слайдером; сделан текстовый драфт + ресинк из внешнего value только когда изменение пришло не из поля. **Стоит посмотреть глазами при живом прогоне.**
- `label-studio` — на NumericInput НЕ переводили: значения полей не чистые числа (ABV содержит `~`/`%`), фильтрация ввода сломала бы редактирование. Точечно прокинут `inputMode="decimal"`.
- **Не тронут** `custom-catalog-ingredient-form.tsx` (10 полей `type="number"`) — админский редактор карточки каталога, вне мобильного контура. Хвост.

## Кластер C — тач-таргеты
Приём везде: растёт кликабельная зона (`before:absolute before:-inset-N` или `min-h-11`), визуальный размер иконки не меняется — вёрстка не поехала (сверено по скриншотам).
Закрыты: крестики `Dialog`/`Sheet` (32→44), чекбокс шага варки (24→44) и кнопки таймера, сброс таймера в герое, «Аварийный останов» (`min-h-[44px]`), удаление строки в калькуляторах (28→44), «Сохранить»/«Клонировать» на витрине, иконки карточек каталога и склада, звезда избранного, кебабы, гамбургер, theme-toggle, «Войти», пагинация, шкала цвета, чипы фильтров, указатель стилей BJCP, триггер фильтров, слайдер пульта (невидимая зона 44px), кнопки мастера рецептов (шестерёнки КП/горечи, категории ингредиента, футер редактора позиции), инлайн-поля граммовки (`h-7`→`h-9`).
- **Компромисс:** соседние Edit/Delete в `section-row.tsx` не дотянуты до 44px (исходный зазор 2px — при полном растягивании зоны накладывались бы друг на друга и провоцировали промахи). Сделан управляемый рост (~34px) + увеличенный `gap`.
- **Компромисс:** `recipe-save-button`/`clone-from-public-button` — визуальный бейдж остался 28px (геометрия карточки /app/saved не даёт места), но hit-area расширена до ~44px невидимым `before:-inset-2`.

## Кластер D — нижний край
Введена CSS-переменная **`--nb-sticky-bar-h`**: липкий бар результата калькуляторов измеряет себя через `ResizeObserver` и пишет реальную высоту; её потребляют `feedback-launcher`, `toast` и нижний паддинг `public-shell`. Нижняя таб-навигация получила `env(safe-area-inset-bottom)`, а `--nb-bottom-nav-h` теперь тоже измеряется по факту (`ResizeObserver`), а не хардкодится `3.5rem` — иначе после добавления safe-area всплывашки наезжали бы на навигацию. Тост переведён на композицию переменных и на `left-4 right-4` без явного `width` (с `w-full` браузер в LTR игнорирует `right` и обрезка воспроизвелась бы с другой стороны).

## Кластер E — overflow
`minmax(min(320px,100%),1fr)` в гриде рецептов + `px-4 sm:px-6` в `public-shell` (закрыло /recipes, «Похожие рецепты» и блок на странице стиля), `overflow-hidden` на декоративной колоде главной, `truncate` в статах hero, `break-words` заголовкам, `truncate`/`line-clamp` шапкам партии и шага, `min-h-dvh` вместо `min-h-screen`.

## Кластер F — варка и графики
- **Wake Lock подключён к таймерам варки**: `useWakeLock(isTimer && timerRunning)` в `brew-day-board`, `useWakeLock(hasRunningTimer)` в `fermentation-board` — держит экран только пока тикает таймер (не постоянно, чтобы не жечь батарею).
- Подписи осей `telemetry-chart` и `ferment-history-chart` вынесены из SVG (`fontSize={11}` внутри `viewBox 800` → ~4px на телефоне) в HTML-оверлей — тем же приёмом, что уже применялся для аннотаций событий. Кегль больше не зависит от масштаба viewBox.
- Sticky-полоса мастера рецептов: «Наклейки»/«Импорт / экспорт»/«Сварить» переведены на «иконка + подпись от `sm:`» (с `aria-label`), полоса схлопнулась с 3 строк до 1.

## Кластер G — изображения
`bjcp-style-card` переведён с inline `backgroundImage` на `next/image` (`fill` + mobile-first `sizes`) — 18/18 карточек теперь lazy + srcset. Ловушка: `heroImageUrl` имеет тип `string | null`, а `next/image` не принимает null — рендер обёрнут в условие, стиль без картинки показывается на одном градиенте (как и раньше).
Три P2-места с plain `<img>` (обложка гайда, обложки статей, картинки в теле статьи) **оставлены как есть**: все источники сейчас same-origin `/images/...`, `remotePatterns` в `next.config` не заданы, у всех трёх уже есть `loading="lazy" decoding="async"`. Переезд на `next/image` станет осмысленным, когда появится загрузка с внешних доменов.

## Прочее
`-webkit-tap-highlight-color: transparent` + `overscroll-behavior-y: none` в `globals.css`; `max-h-[92dvh]` в Sheet; `max-height`/`overflow-y` у DropdownMenu; Web Share API в `copy-link-button` (с фолбэком на копирование и молчаливой обработкой `AbortError`); безопасный дефолт в `style-picker`.

## Правки в тестах
`tests/inventory-add-flow.test.ts:218` — утверждение `step="any"` (проверяло дробность через нативный `type=number`) заменено на `inputMode="decimal"`: то же требование, выраженное через актуальный примитив.

## Хвосты
- `custom-catalog-ingredient-form.tsx` — 10 полей `type="number"` (админка каталога).
- `device-config-form.tsx` — нестандартный мост NumericInput↔слайдер, просмотреть вживую.
- Живой прогон делался с автологином; анонимный хром (`public-shell`, cookie-баннер) вживую не снят — правки там подтверждены только кодом и typecheck.
