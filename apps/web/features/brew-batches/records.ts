import { z } from "zod";

import { equipmentProfileSnapshotSchema } from "../equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "../equipment-profiles/volume-plan";
import type { BrewPlanSnapshot } from "./contracts";

const volume = z.number({ invalid_type_error: "Введите объём числом." }).finite("Введите объём числом.").positive("Объём должен быть больше нуля.").max(10000, "Максимальный объём — 10 000 л.").nullable();
export const volumeMeasurementsSchema = z.object({
  preBoilL: volume.optional(),
  postBoilL: volume.optional(),
  fermenterL: volume.optional(),
  bottledL: volume.optional()
}).strict();
export type VolumeMeasurements = z.infer<typeof volumeMeasurementsSchema>;
export const volumeLabels = {
  preBoilL: "До кипячения",
  postBoilL: "После кипячения",
  fermenterL: "В ферментере",
  bottledL: "Разлито"
} as const;

export const readVolumeMeasurements = (value: unknown): VolumeMeasurements => {
  const parsed = volumeMeasurementsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

// Все записанные объёмы приведены к 20 °C. Движок оборудования считает котёл
// горячим: приводим только его результаты к той же температуре для сравнения.
export const batchVolumeTargets = (plan: BrewPlanSnapshot): VolumeMeasurements => {
  const parsed = equipmentProfileSnapshotSchema.safeParse(plan.equipmentProfileSnapshot);
  const target = plan.recipe.batchSizeL;
  if (!parsed.success || target == null) return { fermenterL: target };
  const profile = { ...parsed.data, targetBatchVolumeL: target };
  const calculated = calculateEquipmentVolumePlan(profile, plan.grainBillTotalKg ?? 0, plan.boilPlan.boilTimeMinutes);
  const cold = 1 - profile.coolingShrinkagePct / 100;
  return {
    preBoilL: calculated.preBoilHotL * cold,
    postBoilL: calculated.postBoilColdBeforeKettleLossL,
    fermenterL: target,
    bottledL: Math.max(0, target - profile.fermenterLossL)
  };
};

export const calibrationSchema = z.object({
  boilMinutes: z.number().finite().min(1, "Укажите время кипячения.").max(1440, "Время кипячения — не больше 1440 минут."),
  sameTemperature: z.literal(true, { errorMap: () => ({ message: "Подтвердите, что объёмы приведены к 20 °C." }) })
});
export const calculateBatchCalibration = (volumes: VolumeMeasurements, boilMinutes: number, coolingShrinkagePct: number) => {
  const { preBoilL: pre, postBoilL: post, fermenterL: fermenter } = volumes;
  if (pre == null || post == null || fermenter == null || pre <= post || post < fermenter || !Number.isFinite(boilMinutes) || boilMinutes <= 0 || coolingShrinkagePct < 0 || coolingShrinkagePct >= 100) return null;
  return {
    evaporationRateLPerHr: Math.round((pre - post) / (1 - coolingShrinkagePct / 100) / (boilMinutes / 60) * 100) / 100,
    trubChillerLossL: Math.round((post - fermenter) * 100) / 100
  };
};

export const batchTaskInputSchema = z.object({
  title: z.string().trim().min(1, "Напишите, что нужно сделать.").max(160, "Сократите название до 160 символов."),
  dueDate: z.string().date("Выберите дату."),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Проверьте время.").nullable()
}).strict();
export type BatchTaskInput = z.infer<typeof batchTaskInputSchema>;
export type BatchTaskDto = BatchTaskInput & {
  id: string;
  brewBatchId: string;
  completedAt: Date | null;
};
export type OverviewTaskDto = BatchTaskDto & { batchTitle: string };

export const localDateKey = (value: Date): string => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
export const signedDifference = (actual: number | null | undefined, expected: number | null | undefined, digits = 1): string => {
  if (actual == null || expected == null) return "—";
  const delta = Number((actual - expected).toFixed(digits));
  return `${delta > 0 ? "+" : ""}${delta.toFixed(digits).replace(".", ",")}`;
};
