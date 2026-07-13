import { z } from "zod";

export const brewBatchStatuses = ["planned", "brewing", "fermenting", "completed", "cancelled"] as const;
export type BrewBatchStatus = (typeof brewBatchStatuses)[number];

/**
 * Анти-абьюз: щедрый потолок числа партий варки на пользователя. Реальному
 * пивовару за всю жизнь аккаунта не упереться; ловит только массовое засорение
 * ботом. Считаются все пути создания (все проходят через
 * createBrewBatchFromRecipe). Плюс rate limit на частоту создания.
 */
export const BREW_BATCH_MAX_COUNT_PER_USER = 500;
export const BREW_BATCH_CREATE_RATE_LIMIT = 20;
export const BREW_BATCH_CREATE_RATE_WINDOW_SECONDS = 60 * 60;

/**
 * Анти-абьюз замеров: квота считается НА ПАРТИЮ (не на пользователя) — журнал
 * плотности одной варки не бывает длиннее пары десятков строк, 300 с большим
 * запасом. Rate limit — на пользователя (частота добавлений).
 */
export const BREW_MEASUREMENT_MAX_COUNT_PER_BATCH = 300;
export const BREW_MEASUREMENT_RATE_LIMIT = 60;
export const BREW_MEASUREMENT_RATE_WINDOW_SECONDS = 60 * 60;

export const brewPlanSnapshotSchema = z.object({
  version: z.literal("brew_plan_v1"),
  recipe: z.object({
    id: z.string().uuid(),
    title: z.string(),
    versionNumber: z.number().int(),
    batchSizeL: z.number().nullable(),
    // Эффективность, на которой варится ЭТА партия (оборудование варщика), и
    // авторская — на момент старта. По ним списание склада и матч повторяют тот же
    // дожим засыпи, что уже зашит в план (см. features/recipes/scale.ts).
    // Старые партии этих полей не имеют → дожим 1 (прежнее поведение).
    efficiencyPct: z.number().nullable().optional(),
    recipeEfficiencyPct: z.number().nullable().optional()
  }),
  equipmentProfileSnapshot: z.record(z.string(), z.unknown()).nullable(),
  waterPlanMeta: z.record(z.string(), z.unknown()).nullable(),
  mashSteps: z.array(z.record(z.string(), z.unknown())),
  boilPlan: z.object({
    boilTimeMinutes: z.number().int(),
    timedAdditions: z.array(z.record(z.string(), z.unknown()))
  }),
  whirlpoolPlan: z.array(z.record(z.string(), z.unknown())),
  // Внесения на стадии брожения (сухой хмель и прочие fermentation-добавки, кроме
  // дрожжей — те уже покрыты шагом «Поставить на брожение»). default([]) — старые
  // снапшоты без этого поля парсятся как пустой план, без поломки гида.
  dryHopPlan: z.array(z.record(z.string(), z.unknown())).default([]),
  fermentationPlan: z.record(z.string(), z.unknown()).nullable(),
  packagingPlan: z.record(z.string(), z.unknown()).nullable(),
  // Ингредиенты рецепта со stage="packaging" (прайминг-сахар и т.п.) — отдельно от
  // packagingPlan (это настройки метода/карбонизации, не строки состава). default([]) —
  // как и dryHopPlan, старые снапшоты без поля парсятся как пустой список, без поломки гида.
  packagingAdditions: z.array(z.record(z.string(), z.unknown())).default([]),
  // Суммарная засыпь солода, кг — для шага гида «Засыпьте солод». default(null) —
  // как и dryHopPlan/packagingAdditions, старые снапшоты без поля парсятся как
  // null, гид деградирует мягко (шаг рендерится без detail).
  grainBillTotalKg: z.number().nullable().optional().default(null),
  // Прекомпьют водного движка на момент старта варки (соли/кислоты затора и
  // промывки + целевой pH) — считать движок заново на каждый рендер гида дорого
  // и бессмысленно, снапшот и так иммутабелен. default(null) — как и
  // dryHopPlan/grainBillTotalKg: старые снапшоты без поля и рецепты без
  // включённой водоподготовки парсятся как null, гид молча пропускает шаги воды.
  waterSchedule: z.object({
    mashSalts: z.array(z.object({ label: z.string(), grams: z.number() })),
    spargeSalts: z.array(z.object({ label: z.string(), grams: z.number() })),
    mashAcid: z.object({ label: z.string(), ml: z.number() }).nullable(),
    spargeAcid: z.object({ label: z.string(), ml: z.number() }).nullable(),
    targetMashPh: z.number().nullable()
  }).nullable().optional().default(null),
  deviceHints: z.array(z.record(z.string(), z.unknown()))
});

export type BrewPlanSnapshot = z.infer<typeof brewPlanSnapshotSchema>;

export type BrewBatchDto = {
  id: string;
  userId: string;
  /** Исходный рецепт, если он ещё существует. NULL — источник удалён/скрыт; тогда варку ведёт снапшот. */
  recipeId: string | null;
  status: BrewBatchStatus;
  name: string;
  /** Привязанный контроллер (brew_batches.device_id). NULL — варка без устройства. */
  deviceId: string | null;
  brewPlanSnapshot: BrewPlanSnapshot;
  /** Прогресс виртуального гида варочного дня (отметки/таймеры по id шага). */
  brewDayProgress: BrewDayProgress;
  recipeSnapshot: Record<string, unknown> | null;
  equipmentProfileSnapshot: Record<string, unknown> | null;
  waterPlanSnapshot: Record<string, unknown> | null;
  deviceHints: Record<string, unknown>[];
  /** Заметки о варке — ведутся с подготовки, видны на всех этапах, включая итог. */
  notes: string | null;
  /** Дегустация — пишется на завершённой партии. Отдельное поле, notes не затирает. */
  tastingNotes: string | null;
  plannedFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Снапшот рецепта в партии — самодостаточный слепок на старте варки: переживает
 * удаление/правку/анпаблиш исходного рецепта (в т.ч. чужого при варке без клона).
 * Помимо состава несёт таргеты (og/fg/abv) для сравнения план↔факт, когда живого
 * рецепта уже нет, и атрибуцию автора для «по рецепту X от Y».
 */
export type BrewRecipeSnapshotLine = {
  persistentKey: string;
  displayName: string | null;
  amount: number | null;
  unit: string | null;
  stage: string | null;
  timeOffset: number | null;
};

export type BrewRecipeSnapshot = {
  id: string;
  title: string;
  versionNumber: number;
  og: number | null;
  fg: number | null;
  abv: number | null;
  authorId: string | null;
  authorName: string | null;
  ingredients: BrewRecipeSnapshotLine[];
};

// Слим-проекция для списка варок: только то, что нужно карточке в списке,
// без тяжёлых снапшотов плана/рецепта.
export type BrewBatchListItem = {
  id: string;
  name: string;
  status: BrewBatchStatus;
  recipeId: string | null;
  recipeTitle: string;
  hasDevice: boolean;
  plannedFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const brewBatchStatusLabels: Record<BrewBatchStatus, string> = {
  planned: "Запланирована",
  brewing: "Варится",
  fermenting: "Брожение",
  completed: "Завершена",
  cancelled: "Отменена"
};

// Статусы «в работе» — варки, которые ведём (для дашборда/сортировки активных).
export const activeBrewBatchStatuses: BrewBatchStatus[] = ["planned", "brewing", "fermenting"];

// Единый цвет статус-бейджа варки (список варок + дашборд), чтобы не расходился.
export const brewBatchStatusBadgeClass: Record<BrewBatchStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  brewing: "bg-warning-subtle text-warning-subtle-foreground",
  fermenting: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
  completed: "bg-success-subtle text-success-subtle-foreground",
  cancelled: "bg-muted text-muted-foreground"
};

// Активная варка для дашборда: слим-проекция списка + агрегаты журнала замеров
// (последний замер и их число), нужные чистому резолверу «следующего шага».
export type ActiveBrewProgressItem = BrewBatchListItem & {
  lastMeasurementAt: Date | null;
  measurementCount: number;
};

// Одна точка исторической телеметрии для графиков. Узкая проекция строки
// brew_telemetry: ts в epoch-мс (сериализуемо в client-компонент/JSON), плюс
// «горячие» поля контура. Полный снимок (payload) для графиков не нужен.
export type TelemetryHistoryPoint = {
  ts: number; // epoch-миллисекунды
  primaryC: number | null;
  setpointC: number | null;
  heatDutyPct: number | null;
  stage: number | null;
  // Режим прибора в этом кадре (bf_app_mode_t), извлечён из payload JSON.
  // Опционален: заполняется getDeviceTelemetryHistory (зона A, §8.4 — нужен
  // для «прибор сейчас в режиме ферментации?», isFermenterModeRow); соседний
  // getDeviceHistory (зона B, features/devices/service.ts) его не выбирает —
  // пульту appMode для истории не нужен, там режим смотрят по живой телеметрии.
  appMode?: number | null;
};

/** Максимум исторических точек, отдаваемых на график (защита от тяжёлых выборок). */
export const TELEMETRY_HISTORY_LIMIT = 1000;

/**
 * Ферментация (§14 docs/brewforge-web-hmi.md): недельный процесс, мост персистит
 * FERMENT раз в 300 с (persist-gate.ts) — TELEMETRY_HISTORY_LIMIT точек хватает
 * лишь на ~3.5 суток. Окно по умолчанию покрывает типичное брожение + холодную
 * выдержку с запасом; потолок точек — 60 дней при 5-минутном шаге (с запасом на
 * периоды до режимного даунсэмпла), защита от тяжёлой выборки на аномально долгом брожении.
 */
export const FERMENT_HISTORY_WINDOW_DAYS = 60;
export const FERMENT_HISTORY_LIMIT = 20_000;

// --- Журнал замеров плотности -------------------------------------------------

/** Одно показание плотности варки (ареометр/рефрактометр), в SG. */
export type BrewMeasurementDto = {
  id: string;
  brewBatchId: string;
  gravitySg: number;
  takenAt: Date;
  /** Явная отметка «это итоговая FG». Один финальный замер на партию (держит сервис). */
  isFinal: boolean;
  note: string | null;
  createdAt: Date;
};

// Правдоподобный диапазон плотности: FG до ~0.99, OG до ~1.2.
export const GRAVITY_SG_MIN = 0.99;
export const GRAVITY_SG_MAX = 1.2;

export const addBrewMeasurementSchema = z.object({
  gravitySg: z.coerce
    .number({ invalid_type_error: "Введите плотность." })
    .min(GRAVITY_SG_MIN, `Плотность не меньше ${GRAVITY_SG_MIN}.`)
    .max(GRAVITY_SG_MAX, `Плотность не больше ${GRAVITY_SG_MAX}.`),
  // Замер не может быть в будущем (с допуском на рассинхрон часов ~1 мин), иначе
  // будущая дата ошибочно станет FG и исказит сводку.
  takenAt: z.coerce
    .date()
    .refine((value) => value.getTime() <= Date.now() + 60_000, "Дата замера не может быть в будущем.")
    .optional(),
  note: z.string().trim().max(500, "Заметка не длиннее 500 символов.").nullable().optional(),
  isFinal: z.boolean().optional()
});

export type AddBrewMeasurementInput = z.infer<typeof addBrewMeasurementSchema>;

/** Сводка по журналу: OG (первый замер), FG (замер с отметкой isFinal), расчётные
 *  ABV и кажущееся сбраживание, плюс цели рецепта для сравнения. */
export type BrewMeasurementSummary = {
  og: number | null;
  fg: number | null;
  abv: number | null;
  apparentAttenuation: number | null;
  target: { og: number | null; fg: number | null; abv: number | null } | null;
};

/**
 * Какой замер ждёт журнал в этом акте: начальную плотность (варочный день),
 * финальную (брожение) или любой (итог/архив/устройство — журнал там ведут
 * задним числом, подсказывать нечего). Определяет подсказку в поле плотности:
 * раньше во всех четырёх контекстах, включая блок OG, была зашита 1.012 SG —
 * типичная FG.
 */
export const brewMeasurementKinds = ["og", "fg", "any"] as const;
export type BrewMeasurementKind = (typeof brewMeasurementKinds)[number];

/** Детальная сборка для страницы партии: партия + журнал + сводка + цели. */
export type BrewBatchDetail = {
  batch: BrewBatchDto;
  measurements: BrewMeasurementDto[];
  summary: BrewMeasurementSummary;
};

// --- Виртуальный гид варочного дня -------------------------------------------
// Рендер brew_plan_snapshot живым чек-листом для варки без устройства
// (device_id = NULL): пошаговый «варочный день» с таймерами пауз/кипячения,
// напоминаниями о засыпях и отметками «шаг выполнен». Виртуальный аналог
// device-дашборда. Прогресс хранится в brew_batches.brew_day_progress.

export const brewDayStages = ["mash", "boil", "whirlpool", "chill", "fermentation", "packaging"] as const;
export type BrewDayStage = (typeof brewDayStages)[number];

export const brewDayStageLabels: Record<BrewDayStage, string> = {
  mash: "Затор",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  chill: "Охлаждение",
  fermentation: "Брожение",
  packaging: "Розлив"
};

// «Акт» страницы партии = машина состояний по статусу варки. Раскладка страницы
// ветвится по акту: показываем релевантный акт целиком, остальное свёрнуто/скрыто.
// prep — подготовка (planned), brewday — варочный день (brewing), fermentation —
// брожение+розлив (fermenting), done — итог (completed), archived — отмена (cancelled).
export const brewDayActs = ["prep", "brewday", "fermentation", "done", "archived"] as const;
export type BrewDayAct = (typeof brewDayActs)[number];

// Курсор гида: «текущий» и «следующий» шаг акта (первый/второй не-done), плюс
// признак завершённости акта (для показа CTA перехода в следующий статус).
export type BrewDayCursor = {
  current: BrewDayStep | null;
  next: BrewDayStep | null;
  actComplete: boolean;
  doneCount: number;
  total: number;
};

// Сводка плана варочного дня для акта «Подготовка»: этапы с числом шагов и суммой
// таймеров + общие итоги. Чистая проекция построенных групп, без прогресса.
export type BrewDayStagePlan = {
  stage: BrewDayStage;
  label: string;
  stepCount: number;
  timerSeconds: number;
};

export type BrewDayPlanSummary = {
  stages: BrewDayStagePlan[];
  totalSteps: number;
  totalTimerSeconds: number;
};

// timer — шаг с обратным отсчётом (пауза затора, кипячение); addition — засыпь
// хмеля/ингредиента в конкретный момент; task — отметка без таймера.
export type BrewDayStepKind = "timer" | "addition" | "task";

export type BrewDayStep = {
  /** Стабильный id из плана (mash:<id>, boil:add:<key> и т.п.), ключ прогресса. */
  id: string;
  stage: BrewDayStage;
  kind: BrewDayStepKind;
  title: string;
  detail: string | null;
  /** Длительность для timer-шагов (сек); null — нет таймера. */
  durationSeconds: number | null;
  temperatureC: number | null;
  /** Для засыпей кипячения: за сколько секунд до конца вносить (для живого
   *  обратного отсчёта от таймера кипячения). null — не привязано к кипячению. */
  boilSecondsBeforeEnd?: number | null;
};

export type BrewDayStageGroup = {
  stage: BrewDayStage;
  label: string;
  steps: BrewDayStep[];
};

export type BrewDayStepState = {
  done: boolean;
  /** ISO-момент старта таймера (для kind === "timer"); null — не запущен. */
  timerStartedAt: string | null;
};

export type BrewDayProgress = {
  steps: Record<string, BrewDayStepState>;
  updatedAt: string | null;
};

export const emptyBrewDayProgress: BrewDayProgress = { steps: {}, updatedAt: null };

// Патч состояния одного шага (отметка done и/или старт/сброс таймера).
export const brewDayStepStatePatchSchema = z.object({
  done: z.boolean().optional(),
  timerStartedAt: z.string().datetime({ offset: true }).nullable().optional()
}).refine((value) => value.done !== undefined || value.timerStartedAt !== undefined, {
  message: "Пустой патч шага."
});
export type BrewDayStepStatePatch = z.infer<typeof brewDayStepStatePatchSchema>;

// --- Списание склада на варку ------------------------------------------------
// Партия — точка, где списание ингредиентов становится частью жизненного цикла
// варки. Движок аллокаций/транзакций (features/recipes/inventory-service.ts)
// переиспользуется; здесь — обёртки, привязывающие транзакции к brew_batch_id и
// дающие откат (release) при отмене варки.

export type BrewBatchInventoryConsumedLine = {
  inventoryItemId: string;
  ingredientDisplayName: string | null;
  /** Нетто списано (положительное), ещё не возвращённое на склад. */
  quantityNormalized: number;
  normalizedUnit: string;
  /**
   * Сколько требовал рецепт — ТОЛЬКО когда списали меньше (дрожжей на складе не
   * хватило, списание ужалось до остатка). null — списали ровно сколько нужно.
   * Без этого поля кламп был немым: пользователь видел «Списано» и не узнавал,
   * что дрожжей ушло меньше, чем требует рецепт.
   */
  requiredQuantityNormalized: number | null;
};

export type BrewBatchInventoryLogEntry = {
  id: string;
  inventoryItemId: string;
  ingredientDisplayName: string | null;
  type: "consume" | "reserve" | "release" | "adjustment";
  quantityDeltaNormalized: number;
  normalizedUnit: string;
  createdAt: Date;
};

export type BrewBatchInventoryView = {
  brewBatchId: string;
  recipeId: string | null;
  /** Есть незавершённое (не возвращённое) списание этой партии. */
  hasConsumed: boolean;
  /** Можно вернуть списанное на склад (есть нетто-списание). */
  canRestore: boolean;
  /**
   * ЭТА партия уже списала ингредиенты и не вернула их — повторное списание не
   * нужно. Про другие партии того же рецепта флаг ничего не говорит: они варятся
   * из своего остатка склада.
   */
  batchAlreadyConsumed: boolean;
  consumed: BrewBatchInventoryConsumedLine[];
  log: BrewBatchInventoryLogEntry[];
};
