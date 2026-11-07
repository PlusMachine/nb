import { createHash } from "node:crypto";
import { and, brewOfflineOperations, db, eq } from "@nb/db";

import type { PreferredGravityUnit } from "@/features/system/gravity-units";
import { saveBatchVolumes } from "../records-service";
import {
  addBrewMeasurement, deleteBrewMeasurement, getBrewBatchDetail, lockOwnedBrewBatch,
  saveManualBrewTransfer, setBrewDayStepState, setBrewMeasurementFinal, updateBrewBatchNotes,
  updateBrewBatchStatus, type BrewBatchTransaction
} from "../service";
import {
  applyOfflineBrew, canApplyOfflineBrew, makeOfflineBrewSnapshot, offlineBrewValues,
  stableOfflineJson, type OfflineBrewOperation, type OfflineBrewSnapshot
} from "./model";

async function readSnapshot(tx: BrewBatchTransaction, ownerId: string, batchId: string, unit: PreferredGravityUnit) {
  const detail = await getBrewBatchDetail(ownerId, batchId, tx);
  if (!detail) throw new Error("NOT_FOUND");
  return makeOfflineBrewSnapshot(detail, unit);
}

export function getOfflineBrewSnapshot(ownerId: string, batchId: string, unit: PreferredGravityUnit) {
  return db.transaction(tx => readSnapshot(tx, ownerId, batchId, unit), { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function writeOperation(tx: BrewBatchTransaction, snapshot: OfflineBrewSnapshot, operation: OfflineBrewOperation) {
  const { ownerId, batchId } = snapshot;
  const { command } = operation;
  switch (command.kind) {
    case "step":
      await setBrewDayStepState(ownerId, batchId, command.stepId, command.patch, tx);
      return;
    case "transfer":
      await saveManualBrewTransfer(ownerId, batchId, command.input, tx);
      return;
    case "volumes":
      await saveBatchVolumes(ownerId, batchId, command.patch, tx);
      return;
    case "notes":
      await updateBrewBatchNotes(ownerId, batchId, command.notes, tx);
      return;
    case "transition":
      await updateBrewBatchStatus(ownerId, batchId, command.to, { transaction: tx, occurredAt: new Date(operation.at) });
      return;
    case "add-measurement":
      await addBrewMeasurement(ownerId, batchId, {
        id: command.id,
        gravitySg: command.input.gravitySg,
        takenAt: new Date(command.input.takenAt),
        createdAt: new Date(operation.at),
        note: command.input.note
      }, tx);
      return;
    case "delete-measurement":
      if (snapshot.measurements.some(row => row.id === command.id)) {
        await deleteBrewMeasurement(ownerId, batchId, command.id, tx);
      }
      return;
    case "final-measurement": {
      const id = command.id ?? snapshot.measurements.find(row => row.isFinal)?.id;
      if (id) await setBrewMeasurementFinal(ownerId, batchId, id, command.id !== null, tx);
    }
  }
}

export function syncOfflineBrewOperation(ownerId: string, batchId: string, unit: PreferredGravityUnit, operation: OfflineBrewOperation) {
  const payloadHash = createHash("sha256").update(stableOfflineJson(operation)).digest("hex");
  return db.transaction(async tx => {
    await lockOwnedBrewBatch(tx, ownerId, batchId);
    const current = await readSnapshot(tx, ownerId, batchId, unit);
    const [receipt] = await tx.select().from(brewOfflineOperations).where(and(
      eq(brewOfflineOperations.userId, ownerId), eq(brewOfflineOperations.operationId, operation.id)
    ));
    if (receipt) {
      if (receipt.batchId !== batchId || receipt.payloadHash !== payloadHash) throw new Error("OPERATION_ID_REUSED");
      return { status: "applied" as const, snapshot: current };
    }

    const { command } = operation;
    const currentValues = stableOfflineJson(offlineBrewValues(current, command));
    // A migrated legacy queue can include a step already saved before its
    // response was lost. Recording the receipt in that case is safe.
    const alreadyApplied = command.kind === "transfer"
      ? current.progress.steps["brew:transfer"]?.measurementOperationId === command.input.operationId
      : command.kind === "step" && currentValues === stableOfflineJson(offlineBrewValues(applyOfflineBrew(current, operation), command));
    if (!alreadyApplied && (!canApplyOfflineBrew(current, command) || currentValues !== operation.before)) {
      return { status: "conflict" as const, snapshot: current };
    }

    const [inserted] = await tx.insert(brewOfflineOperations).values({ userId: ownerId, batchId, operationId: operation.id, payloadHash })
      .onConflictDoNothing().returning({ id: brewOfflineOperations.operationId });
    if (!inserted) throw new Error("OPERATION_ID_REUSED");
    if (!alreadyApplied) await writeOperation(tx, current, operation);
    return { status: "applied" as const, snapshot: alreadyApplied ? current : await readSnapshot(tx, ownerId, batchId, unit) };
  });
}
