# ТЗ: тёмная тема

Дата: 2026-07-06. Статус: **не начато**.

## Контекст (что есть сейчас)

Инфраструктуры темизации нет совсем:

- Tailwind **v3.4** (`apps/web/tailwind.config.ts`), `darkMode` не задан, `theme.extend` пустой.
- CSS-переменных цвета нет. `globals.css` жёстко задаёт `color-scheme: light` (строка 63)
  и `body { background: #f4f4f6 }`; в `app/layout.tsx:37` на `<body>` захардкожено
  `bg-slate-50 text-zinc-950`.
- Все цвета — сырые утилиты: доминирующая нейтраль `zinc-*` (210 файлов), `bg-white`
  (152 файла), акцент — `emerald`, деструктив — `red`. Плюс ~180 hex прямо в `.tsx`.
  Всего ~4,5 тыс. вхождений нейтральной палитры в `apps/web`.
- `packages/ui` (button/card/dialog/…) тоже на сырых `zinc/white/emerald`.
- Чарты — рукописный inline-SVG с hex (`telemetry-chart.tsx`, `ferment-history-chart.tsx`).
- Готовый паттерн cookie-предпочтения для копирования: `nb_recipes_view`
  (`features/recipes/recipes-url.ts:28` + запись в `recipes-toolbar.tsx:41`, чтение на сервере).
- Email-шаблонов и динамических OG-картинок нет — от темы ничего не зависит.

Итого: задача = **ввести семантический токен-слой с нуля** и мигрировать на него код,
тёмная тема — следствие.

## Принципы

1. **Семантические токены, а не `dark:`-дубли.** Компоненты пишут `bg-card text-foreground`,
   а не `bg-white dark:bg-zinc-900`. Пары `dark:` допустимы только точечно, где семантика
   не ложится на токен (редкие декоративные места).
2. **Цвет пива — не тема.** SRM-палитра (`features/recipes/beer-color.ts`) — физический цвет
   продукта, при смене темы не меняется. Меняется только окружение: рамки/кольца свотчей,
   контраст подписей (там уже есть `pickTextColorForSrm`).
3. **Три режима:** «Светлая», «Тёмная», «Как в системе». Дефолт — «Как в системе».
4. **Без FOUC.** Тема известна серверу (cookie), разметка приходит уже в нужной теме.
5. Тёмная тема — не инверсия: тёмно-нейтральные поверхности (zinc-подобные), приглушённый
   emerald-акцент, пониженная насыщенность статусных цветов, тени → рамки/elevation слоями.

## Архитектура

### Токен-слой (globals.css + tailwind.config.ts)

Shadcn-подход: HSL-каналы в CSS-переменных, маппинг в `theme.extend.colors`.

```css
:root { --background: …; --foreground: …; /* light */ color-scheme: light; }
.dark { --background: …; --foreground: …; color-scheme: dark; }
```

```ts
// tailwind.config.ts
darkMode: "class",
theme: { extend: { colors: { background: "hsl(var(--background))", … } } }
```

Набор токенов (стандартный shadcn + проектные):

| Токен | Light (ориентир из текущего кода) | Назначение |
|---|---|---|
| `background` / `foreground` | `#f4f4f6` / `zinc-950` | страница |
| `card` / `card-foreground` | white / zinc-950 | карточки, панели |
| `popover` / `popover-foreground` | white / zinc-950 | поповеры, меню, диалоги |
| `muted` / `muted-foreground` | zinc-100 / zinc-500 | подложки, вторичный текст |
| `border`, `input`, `ring` | zinc-200 / zinc-200 / zinc-400 | рамки, поля, фокус |
| `primary` / `primary-foreground` | emerald-600 / white | primary-действия |
| `destructive` / `destructive-foreground` | red-600 / white | деструктив, аварии |
| `accent` / `accent-foreground` | zinc-100 / zinc-900 | hover-подложки |
| `success`, `warning` (+foreground) | emerald-50/700, amber-50/800 | статусы, бейджи (сейчас размазаны по коду) |
| `chart-grid`, `chart-label`, `chart-zebra`, `chart-1..4` | из telemetry-chart.tsx | рукописные SVG-чарты |

Точные значения тёмной палитры — на этапе Т0 подобрать на живых экранах
(старт: background ≈ zinc-950, card ≈ zinc-900, border ≈ zinc-800,
primary ≈ emerald-500, контраст текста ≥ WCAG AA 4.5:1).

### Переключение и хранение

- Cookie **`nb_theme`** = `light | dark | system` (нет cookie = `system`),
  по образцу `nb_recipes_view`: `path=/; max-age=31536000; samesite=lax`.
- `app/layout.tsx` читает cookie на сервере:
  - `light`/`dark` → класс сразу на `<html>` — FOUC нет по построению;
  - `system` → крошечный инлайн-скрипт до пейнта ставит `.dark` по
    `matchMedia("(prefers-color-scheme: dark)")`; на `<html>` — `suppressHydrationWarning`.
- Клиентский `ThemeProvider` в `components/providers.tsx`: контекст `{theme, setTheme}`,
  подписка на смену системной темы (для режима `system`), запись cookie,
  динамическое обновление `<meta name="theme-color">`.
- Без next-themes: своя реализация ~50–70 строк, зато cookie-SSR и единый паттерн
  с остальными prefs проекта. (next-themes — localStorage-first, SSR-разметку темы не знает.)
- UI переключателя: пункт в меню пользователя в `SiteHeader` (и в шапке зоны `(app)`),
  через `DropdownMenu` из `@nb/ui`: «Светлая / Тёмная / Как в системе», иконки sun/moon/monitor.
- Cookie внести в реестр `app/(public)/legal/cookies/page.tsx` (технические, без согласия).

## Этапы

### Т0 — токен-слой и корень (фундамент)

- `globals.css`: `:root` / `.dark` переменные; `color-scheme` из захардкоженного →
  по теме; `::selection` и `.nb-legal` (строки 10–60, hex легальных страниц) → токены.
- `tailwind.config.ts`: `darkMode: "class"` + маппинг цветов.
- `app/layout.tsx`: тема на `<html>` из cookie; с `<body>` убрать `bg-slate-50 text-zinc-950`
  → `bg-background text-foreground`; убрать дубль `body{background}` из CSS.
- `ThemeProvider` + переключатель в шапке.
- `<meta name="theme-color">` (сейчас отсутствует) — динамически из провайдера.

**Приёмка Т0:** переключатель меняет фон/текст страницы и нативные контролы
(скроллбары, select, автозаполнение) без FOUC при перезагрузке; остальной UI
пока остаётся светлым островами — это ожидаемо до Т1–Т2.

### Т1 — packages/ui

Перевести все примитивы (`button, card, dialog, dropdown-menu, input, popover,
select, sheet, slider, table, textarea, toast`) с `zinc/white/black/emerald` на токены:
`bg-card`, `border-border`, `bg-primary`, `ring-ring` и т.д. Варианты кнопок:
`default` → `bg-foreground text-background` либо отдельный токен `secondary` — решить по месту.

### Т2 — хром и общие поверхности

Шапки/навигация/футер (`SiteHeader`, layout-группы `(public)/(app)/(admin)`),
тосты, `ConfirmActionDialog`, `NumericInput`, скелетоны (`section-skeletons.tsx`),
cookie-баннер, формы логина.

### Т3 — массовая миграция зон

По таблице соответствий (`bg-white→bg-card`, `border-zinc-200→border-border`,
`text-zinc-500→text-muted-foreground`, `bg-zinc-50/100→bg-muted`,
`text-zinc-900/950→text-foreground`, emerald-статусы → `success`, …).
Механический codemod (sed/скрипт) по зоне + обязательный ручной проход глазами
в обеих темах. Порядок зон (от трафика):

1. Главная + витрина `/recipes` + карточки (внимание: SRM-градиенты hero,
   `NEUTRAL_SOFT_GRADIENT` в `beer-color.ts:93` — дать тёмный вариант).
2. Каталог ингредиентов + BJCP + guides (проверить `2MB`-кеши не трогаем, только классы).
3. Мастер рецептов (`recipe-designer/*`, топ-нарушитель) + калькуляторы
   (`calculator-page-client.tsx`, 172 вхождения; `water-setup-wizard.tsx`).
4. Зона `(app)`: дашборд, склад, варки, устройства.
5. Зона `(admin)`.

После миграции зоны — **гейт от регрессии**: grep-чек в CI/тесте на запрещённые
классы (`bg-white`, `zinc-`, `slate-`) в мигрированных каталогах, чтобы новый код
не возвращал сырые цвета.

### Т4 — спец-поверхности

- **Чарты** (`telemetry-chart.tsx:197–386`, `ferment-history-chart.tsx`,
  `telemetry-annotations.ts`): hex серий/сетки/зебры/fault → `var(--chart-*)`
  (inline-SVG умеет `var()` и `currentColor`). Серии подобрать так, чтобы читались
  на обоих фонах.
- **Веб-HMI/киоск BrewForge** (`kiosk-shell.tsx` — `bg-white` на строках 115–116,
  дашборды live/ferment/distill): следует общей теме; аварийные баннеры
  (`bg-red-600`, `bg-amber-400`) оставить насыщенными в обеих темах — это сигнальные
  цвета, но проверить контраст текста. Киоску тёмная тема особенно нужна
  (прибор в помещении варки) — прогнать в первую очередь.
- **SRM-свотчи/бокал**: `beer-glass-icon.tsx`, свотчи в карточках/фильтрах —
  заливка не меняется, рамки/кольца → `border-border`/`ring-ring`, светлое пиво
  (SRM 2–4) не должно сливаться с тёмным фоном (тонкая рамка обязательна).
- **PWA-манифест** (`app/manifest.ts`): статичен, тему не знает. Принять нейтральные
  значения: `background_color`/`theme_color` — тёмно-нейтральный (сплэш киоска),
  т.к. основной PWA-сценарий — киоск у прибора.

### Т5 — добивка и приёмка

- Grep-развёртка остатков: `dark:`-исключения, hex в `.tsx`, `slate-*` (8 файлов).
- Легальные страницы, страница cookie (внести `nb_theme` в реестр).
- Прогон обеих тем по чеклисту приёмки.

## Приёмка (финальная)

- [ ] Переключатель: три режима, «Как в системе» реагирует на смену системной темы на лету.
- [ ] Перезагрузка/первый вход — без вспышки светлого (FOUC) в обоих режимах.
- [ ] Живой проход в тёмной теме: главная, /recipes, карточка рецепта, каталог, BJCP-стиль,
      калькулятор, мастер рецептов, дашборд /app, склад, варка (журнал+телеметрия),
      пульт устройства + киоск `?kiosk=1`, админка, логин, легальные страницы.
- [ ] Модалки/шиты/меню/тосты/поповеры — тёмные (портятся чаще всего, рендер в portal).
- [ ] Нативные контролы: select, date/number, автозаполнение, скроллбары — тёмные.
- [ ] SRM: светлое пиво видно на тёмном фоне, подписи на свотчах контрастны.
- [ ] Чарты телеметрии читаемы в обеих темах, fault-состояние различимо.
- [ ] Контраст основного текста ≥ 4.5:1, вторичного ≥ 3:1 (выборочно проверить).
- [ ] `npm run typecheck` + suite зелёные; grep-гейт на сырые классы включён.
- [ ] Печать (если где-то есть print-стили) — принудительно светлая (`@media print`).

## Риски и ловушки

- **Tailwind content-глобы**: классы токенов генерируются только из файлов в `content`
  (`features/**` уже добавлен после инцидента — см. память `tailwind-features-glob-gap`).
  Чек при «класс не работает» — computed style → глобы.
- **Opacity-модификаторы**: `bg-card/50` работает только при HSL-каналах в переменных
  (`--card: 240 5% 10%`, не готовый `hsl(...)`).
- **Полупрозрачные оверлеи/тени**: `shadow-sm` на тёмном фоне невидим — elevation
  в тёмной теме делать цветом поверхности (card чуть светлее background), не тенью.
- **Codemod вслепую опасен**: `zinc-100` в одном месте — подложка (`muted`),
  в другом — hover (`accent`), в третьем — рамка. Таблица соответствий — старт,
  ручной проход по каждой зоне обязателен.
- **Параллельные ветки**: массовая замена классов конфликтует со всем незакоммиченным
  (сейчас на `feature/home-redesign` большой diff). Т3 начинать только после
  коммита/мержа текущих хвостов, иначе merge-ад.
- `yet-another-react-lightbox` тянет свой `prefers-color-scheme` CSS — проверить
  галерею в тёмной теме отдельно.

## Открытые вопросы владельцу

1. Тёмная палитра: чистый zinc-нейтрал или тёплый оттенок (stone) под «пивную» айдентику
   главной? (Предложение: zinc, теплоту даёт SRM-контент.)
2. Манифест PWA: тёмный сплэш киоска ок? (Предложение: да.)
3. Т3 — большой механический diff. Делать одной веткой после мержа текущих, или
   зонами в несколько PR? (Предложение: зонами.)
