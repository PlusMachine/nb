# Тёмная тема — канон миграции классов (source of truth для агентов)

Токен-слой уже введён (`app/globals.css` + `tailwind.config.ts`, `darkMode: "class"`).
Твоя задача — заменить **сырые цветовые Tailwind-утилиты** на **семантические токены**,
сохранив визуальный смысл. Только классы. Ничего кроме цвета не трогать.

## ЖЁСТКИЕ ЗАПРЕТЫ (regressions guard)

1. **Не трогай hex/rgb/hsl-значения** в коде и в `style={{...}}`. SRM-цвет пива,
   цвета стран (флаги), цвета ингредиентов, цвета серий графиков, любые
   вычисляемые inline-цвета — это ДАННЫЕ, не тема. Оставляй как есть.
2. **Не меняй логику, разметку, пропсы, порядок классов, не-цветовые классы**
   (spacing, flex, grid, rounded, shadow, text-sm, font-*, animate-* и т.п.).
3. **Не трогай** файлы графиков/SRM (их делает отдельный этап): `beer-color.ts`,
   `telemetry-chart.tsx`, `ferment-history-chart.tsx`, `*-color-swatch.tsx`,
   `country-flag.tsx`, `recipes-color-scale.tsx`, `style-vitals.ts`,
   `calculators/definitions.ts`, `bjcp-card-stats.ts` — если такой файл попал
   в твой батч, пропусти его и напиши об этом в отчёте.
4. Если смысл класса неоднозначен — выбери ближайший по интенту токен из таблицы
   и отметь место в отчёте. **Не выдумывай новых токенов** — используй только те,
   что перечислены ниже (они реально есть в tailwind.config.ts).

## Таблица соответствий

### Нейтральные поверхности (фон)
- `bg-white` → `bg-card` (карточки/панели/поповеры/поля).
  Исключение: если это подложка-оверлей/затемнение на весь экран — `bg-background`.
- `bg-slate-50`, `bg-zinc-50`, `bg-gray-50` (фон страницы/крупной секции) → `bg-background`;
  если это лёгкая подложка-плашка внутри карточки → `bg-muted`.
- `bg-zinc-100` / `bg-zinc-200` / `bg-slate-100`:
  - как **hover** (`hover:bg-zinc-100`) → `hover:bg-accent`
  - как **статичная подложка/плашка/чип** → `bg-muted`
  - как **разделитель/полоса** → `bg-border`
- `bg-zinc-900` / `bg-zinc-950` / `bg-black` (сильная/инвертированная поверхность:
  тёмная кнопка, активная пилюля навигации, аватар) → `bg-foreground`,
  а текст на ней (`text-white`) → `text-background`.
  hover для такой кнопки (`hover:bg-zinc-800/700`) → `hover:bg-foreground/90`.

### Текст
- `text-zinc-950` / `text-zinc-900` / `text-black` → `text-foreground`
- `text-zinc-800` / `text-zinc-700` → `text-foreground` (основной текст/заголовок).
  Если это явно вторичный/приглушённый текст (подпись, caption) → `text-muted-foreground`.
- `text-zinc-600` / `text-zinc-500` / `text-zinc-400` → `text-muted-foreground`
- `text-white`:
  - на zinc-900/950/black поверхности → `text-background`
  - на цветной кнопке (emerald/red/amber фон) → оставь `text-white`
    (или соответствующий `text-primary-foreground` / `text-destructive-foreground`)

### Рамки / кольца / разделители
- `border-zinc-100/200/300`, `border-slate-200` → `border-border`
- `divide-zinc-200` → `divide-border`
- `ring-zinc-*`, `focus-visible:ring-zinc-*` → `ring-ring`
- Полупрозрачные (`border-zinc-200/70`) → `border-border/70` (сохранить /opacity).

### Бренд-акцент (emerald)
- Кнопка `bg-emerald-600 text-white hover:bg-emerald-700` → `bg-primary text-primary-foreground hover:bg-primary/90`
  (а лучше — использовать `<Button variant="primary">`, если это кнопка из @nb/ui).
- `text-emerald-700/600/800` как акцент-ссылка/ярлык бренда → `text-primary`.
  Как **позитивный статус** (успех/готово/в наличии) → `text-success`.
- Бейдж `bg-emerald-50 text-emerald-700/800` (успех/в наличии) → `bg-success-subtle text-success-subtle-foreground`.
- `border-emerald-200` → `border-success/30`.
- `bg-emerald-500/600` как индикатор-точка статуса → `bg-success`.

### Деструктив (red)
- Кнопка `bg-red-600 text-white hover:bg-red-700` → `bg-destructive text-destructive-foreground hover:bg-destructive/90`.
- `text-red-700/600/500` → `text-destructive`.
- Бейдж/алерт `bg-red-50 text-red-700` → `bg-destructive-subtle text-destructive-subtle-foreground`.
- `border-red-200` → `border-destructive-border`.

### Предупреждение (amber/yellow)
- Текст `text-amber-700/800/900` → `text-warning-subtle-foreground`.
- Бейдж/алерт `bg-amber-50 text-amber-800` → `bg-warning-subtle text-warning-subtle-foreground`.
- `border-amber-200` → `border-warning/30`.
- Индикатор-точка `bg-amber-400/500` → `bg-warning`.
- Сигнальные плашки тревог (насыщенный `bg-amber-400 text-amber-950`) — ОСТАВЬ насыщенными
  (сигнальный цвет), если сомневаешься — не трогай и отметь.

### Ссылки (sky/blue как гиперссылка)
- `text-sky-700`, `text-blue-600/700` (именно ссылка) → `text-link`.

### Тени
- `shadow-sm/shadow/shadow-md/shadow-lg` — НЕ трогай (elevation в тёмной теме даёт
  цвет поверхности, тени остаются как есть).

## Доступные токены (полный список — только эти)
background, foreground,
card / card-foreground, popover / popover-foreground,
muted / muted-foreground, accent / accent-foreground,
border, input, ring,
primary / primary-foreground,
destructive / destructive-foreground / destructive-subtle / destructive-subtle-foreground / destructive-border,
success / success-foreground / success-subtle / success-subtle-foreground,
warning / warning-foreground / warning-subtle / warning-subtle-foreground,
link.

Использование: `bg-<token>`, `text-<token>`, `border-<token>`, `ring-<token>`,
opacity-модификатор работает: `bg-card/80`, `border-border/70`.

## Формат отчёта агента
Верни: список изменённых файлов; список пропущенных файлов (графики/SRM/данные) с причиной;
список мест, где интент был неоднозначен и какой токен выбрал; подтверждение, что hex/логику
не трогал.
