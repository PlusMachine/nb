import { z } from "zod";

export const brewBatchStatuses = ["planned", "brewing", "fermenting", "completed", "cancelled"] as const;
export type BrewBatchStatus = (typeof brewBatchStatuses)[number];

export const brewPlanSnapshotSchema = z.object({
  version: z.literal("brew_plan_v1"),
  recipe: z.object({
    id: z.string().uuid(),
    title: z.string(),
    versionNumber: z.number().int(),
    batchSizeL: z.number().nullable()
  }),
  equipmentProfileSnapshot: z.record(z.string(), z.unknown()).nullable(),
  waterPlanMeta: z.record(z.string(), z.unknown()).nullable(),
  mashSteps: z.array(z.record(z.string(), z.unknown())),
  boilPlan: z.object({
    boilTimeMinutes: z.number().int(),
    timedAdditions: z.array(z.record(z.string(), z.unknown()))
  }),
  whirlpoolPlan: z.array(z.record(z.string(), z.unknown())),
  fermentationPlan: z.record(z.string(), z.unknown()).nullable(),
  packagingPlan: z.record(z.string(), z.unknown()).nullable(),
  deviceHints: z.array(z.record(z.string(), z.unknown()))
});

export type BrewPlanSnapshot = z.infer<typeof brewPlanSnapshotSchema>;

export type BrewBatchDto = {
  id: string;
  userId: string;
  recipeId: string;
  status: BrewBatchStatus;
  name: string;
  /** Привязанный контроллер (brew_batches.device_id). NULL — варка без устройства. */
  deviceId: string | null;
  brewPlanSnapshot: BrewPlanSnapshot;
  recipeSnapshot: Record<string, unknown> | null;
  equipmentProfileSnapshot: Record<string, unknown> | null;
  waterPlanSnapshot: Record<string, unknown> | null;
  deviceHints: Record<string, unknown>[];
  notes: string | null;
  plannedFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Слим-проекция для списка варок: только то, что нужно карточке в списке,
// без тяжёлых снапшотов плана/рецепта.
export type BrewBatchListItem = {
  id: string;
  name: string;
  status: BrewBatchStatus;
  recipeId: string;
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
  planned: "bg-slate-100 text-slate-700",
  brewing: "bg-amber-100 text-amber-800",
  fermenting: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-zinc-100 text-zinc-500"
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
};

/** Максимум исторических точек, отдаваемых на график (защита от тяжёлых выборок). */
export const TELEMETRY_HISTORY_LIMIT = 1000;

// --- Журнал замеров плотности -------------------------------------------------

/** Одно показание плотности варки (ареометр/рефрактометр), в SG. */
export type BrewMeasurementDto = {
  id: string;
  brewBatchId: string;
  gravitySg: number;
  takenAt: Date;
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
  note: z.string().trim().max(500, "Заметка не длиннее 500 символов.").nullable().optional()
});

export type AddBrewMeasurementInput = z.infer<typeof addBrewMeasurementSchema>;

/** Сводка по журналу: OG (первый замер), FG (последний), расчётные ABV и
 *  кажущееся сбраживание, плюс цели рецепта для сравнения. */
export type BrewMeasurementSummary = {
  og: number | null;
  fg: number | null;
  abv: number | null;
  apparentAttenuation: number | null;
  target: { og: number | null; fg: number | null; abv: number | null } | null;
};

/** Детальная сборка для страницы партии: партия + журнал + сводка + цели. */
export type BrewBatchDetail = {
  batch: BrewBatchDto;
  measurements: BrewMeasurementDto[];
  summary: BrewMeasurementSummary;
};
