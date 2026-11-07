import { z } from "zod";

import type { PreferredGravityUnit } from "@/features/system/gravity-units";
import { applyBrewDayStepPatch, groupsForAct, normalizeBrewDayProgress } from "../brew-day";
import {
  addBrewMeasurementSchema,
  brewDayStepStatePatchSchema,
  formatBrewBatchDisplayTitle,
  type BrewBatchDetail,
  type BrewBatchDto,
  type BrewMeasurementDto,
  type BrewPlanSnapshot
} from "../contracts";
import { buildManualBrewSteps } from "../manual-brew";
import { manualTransferInputSchema } from "../manual-transfer";
import { volumeMeasurementsSchema } from "../records";

export const OFFLINE_BREW_VERSION = 1;
const uuid = z.string().uuid();
const time = z.string().datetime({ offset: true });
const measurementTime = time.refine(value => Date.parse(value) <= Date.now() + 60_000, "Дата замера не может быть в будущем.");

export const offlineBrewCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("step"), stepId: z.string().min(1).max(240), patch: brewDayStepStatePatchSchema }),
  z.object({ kind: z.literal("transfer"), input: manualTransferInputSchema }),
  z.object({ kind: z.literal("volumes"), patch: volumeMeasurementsSchema }),
  z.object({ kind: z.literal("notes"), notes: z.string().trim().max(20_000).nullable() }),
  z.object({ kind: z.literal("add-measurement"), id: uuid, input: addBrewMeasurementSchema.extend({ takenAt: measurementTime, isFinal: z.undefined() }) }),
  z.object({ kind: z.literal("delete-measurement"), id: uuid }),
  z.object({ kind: z.literal("final-measurement"), id: uuid.nullable() }),
  z.object({ kind: z.literal("transition"), to: z.enum(["brewing", "fermenting"]) })
]);

export const offlineBrewOperationSchema = z.object({
  id: uuid,
  at: time,
  before: z.string().max(128_000),
  command: offlineBrewCommandSchema
});

export const offlineBrewRequestSchema = z.object({
  version: z.literal(OFFLINE_BREW_VERSION),
  ownerId: uuid,
  operation: offlineBrewOperationSchema
});

export type OfflineBrewCommand = z.infer<typeof offlineBrewCommandSchema>;
export type OfflineBrewOperation = z.infer<typeof offlineBrewOperationSchema>;
type OfflineMeasurement = Omit<BrewMeasurementDto, "takenAt" | "createdAt"> & { takenAt: string; createdAt: string };

export type OfflineBrewSnapshot = {
  version: typeof OFFLINE_BREW_VERSION;
  ownerId: string;
  batchId: string;
  title: string;
  status: BrewBatchDto["status"];
  deviceId: string | null;
  startedAt: string | null;
  plannedFor: string | null;
  plan: BrewPlanSnapshot;
  progress: BrewBatchDto["brewDayProgress"];
  volumes: NonNullable<BrewBatchDto["volumeMeasurements"]>;
  notes: string | null;
  measurements: OfflineMeasurement[];
  target: BrewBatchDetail["summary"]["target"];
  unit: PreferredGravityUnit;
};

export const supportsOfflineBrew = (batch: Pick<OfflineBrewSnapshot, "deviceId" | "status">) => (
  !batch.deviceId && (batch.status === "planned" || batch.status === "brewing" || batch.status === "fermenting")
);

export function makeOfflineBrewSnapshot({ batch, measurements, summary }: BrewBatchDetail, unit: PreferredGravityUnit): OfflineBrewSnapshot {
  return {
    version: OFFLINE_BREW_VERSION,
    ownerId: batch.userId,
    batchId: batch.id,
    title: formatBrewBatchDisplayTitle(batch.name, batch.brewNumber),
    status: batch.status,
    deviceId: batch.deviceId,
    startedAt: batch.startedAt?.toISOString() ?? null,
    plannedFor: batch.plannedFor?.toISOString() ?? null,
    plan: batch.brewPlanSnapshot,
    progress: batch.brewDayProgress,
    volumes: batch.volumeMeasurements ?? {},
    notes: batch.notes,
    measurements: measurements.map(measurement => ({
      ...measurement,
      takenAt: measurement.takenAt.toISOString(),
      createdAt: measurement.createdAt.toISOString()
    })),
    target: summary.target,
    unit
  };
}

export const readOfflineMeasurements = (snapshot: OfflineBrewSnapshot): BrewMeasurementDto[] => snapshot.measurements.map(measurement => ({
  ...measurement,
  takenAt: new Date(measurement.takenAt),
  createdAt: new Date(measurement.createdAt)
}));

// Stable across JSONB serialization and different property insertion orders.
export function stableOfflineJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
  });
}

function availableSteps(snapshot: OfflineBrewSnapshot) {
  const groups = buildManualBrewSteps(snapshot.plan);
  if (snapshot.status === "brewing") return groupsForAct(groups, "brewday").flatMap(group => group.steps);
  if (snapshot.status === "fermenting") return groupsForAct(groups, "fermentation").flatMap(group => group.steps);
  return [];
}

export function canApplyOfflineBrew(snapshot: OfflineBrewSnapshot, command: OfflineBrewCommand): boolean {
  if (!supportsOfflineBrew(snapshot)) return false;
  switch (command.kind) {
    case "step": return availableSteps(snapshot).some(step => step.id === command.stepId);
    case "transfer": return snapshot.status === "brewing";
    case "transition": return snapshot.status === (command.to === "brewing" ? "planned" : "brewing");
    case "final-measurement": return command.id === null || snapshot.measurements.some(row => row.id === command.id);
    default: return true;
  }
}

// Compare the affected values under the batch lock. Existing writers (including
// online screens and sensor corrections) are visible without a separate clock.
export function offlineBrewValues(snapshot: OfflineBrewSnapshot, command: OfflineBrewCommand): unknown {
  switch (command.kind) {
    case "step": {
      const step = availableSteps(snapshot).find(item => item.id === command.stepId);
      return {
        progress: snapshot.progress.steps[command.stepId] ?? null,
        plan: step ? [step.stage, step.kind, step.durationSeconds, step.boilSecondsBeforeEnd ?? null] : null
      };
    }
    case "transfer": return {
      step: snapshot.progress.steps["brew:transfer"] ?? null,
      ...(command.input.fermenterL !== null ? { fermenterL: snapshot.volumes.fermenterL ?? null } : {})
    };
    case "volumes": return Object.fromEntries(Object.keys(command.patch).map(key => [key, snapshot.volumes[key as keyof typeof snapshot.volumes] ?? null]));
    case "notes": return snapshot.notes;
    case "final-measurement": return snapshot.measurements.find(row => row.isFinal)?.id ?? null;
    case "delete-measurement": return snapshot.measurements.find(row => row.id === command.id)?.isFinal ?? false;
    case "transition": return { status: snapshot.status, startedAt: snapshot.startedAt };
    case "add-measurement": return null;
  }
}

function insertMeasurement(snapshot: OfflineBrewSnapshot, row: OfflineMeasurement): OfflineMeasurement[] {
  if (snapshot.measurements.some(existing => existing.id === row.id)) return snapshot.measurements;
  return [...snapshot.measurements, row].sort((a, b) => (
    Date.parse(a.takenAt) - Date.parse(b.takenAt) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)
  ));
}

export function applyOfflineBrew(snapshot: OfflineBrewSnapshot, { command, at }: OfflineBrewOperation): OfflineBrewSnapshot {
  switch (command.kind) {
    case "step": return {
      ...snapshot,
      progress: normalizeBrewDayProgress(applyBrewDayStepPatch(snapshot.progress, command.stepId, command.patch, at))
    };
    case "transfer": {
      const { operationId, takenAt, gravitySg, fermenterL } = command.input;
      return {
        ...snapshot,
        progress: applyBrewDayStepPatch(snapshot.progress, "brew:transfer", {
          done: true, skipped: false, completedAt: takenAt, measurementOperationId: operationId,
          ...(gravitySg !== null ? { gravitySg } : {})
        }, at),
        volumes: fermenterL === null ? snapshot.volumes : { ...snapshot.volumes, fermenterL },
        measurements: gravitySg === null ? snapshot.measurements : insertMeasurement(snapshot, {
          id: operationId, brewBatchId: snapshot.batchId, gravitySg, takenAt, createdAt: at, isFinal: false, note: null
        })
      };
    }
    case "volumes": return { ...snapshot, volumes: { ...snapshot.volumes, ...command.patch } };
    case "notes": return { ...snapshot, notes: command.notes || null };
    case "add-measurement": return { ...snapshot, measurements: insertMeasurement(snapshot, {
      id: command.id, brewBatchId: snapshot.batchId, gravitySg: command.input.gravitySg,
      takenAt: command.input.takenAt, createdAt: at, isFinal: false, note: command.input.note || null
    }) };
    case "delete-measurement": return { ...snapshot, measurements: snapshot.measurements.filter(row => row.id !== command.id) };
    case "final-measurement": return { ...snapshot, measurements: snapshot.measurements.map(row => ({ ...row, isFinal: row.id === command.id })) };
    case "transition": return {
      ...snapshot,
      status: command.to,
      startedAt: command.to === "brewing" ? at : snapshot.startedAt,
      progress: command.to === "fermenting"
        ? applyBrewDayStepPatch(snapshot.progress, "brew:pitch", { done: true, completedAt: at }, at)
        : snapshot.progress
    };
  }
}
