"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getBrewBatchDetail, listBrewBatchesForUser } from "@/features/brew-batches/service";
import { buildBatchComparison } from "@/features/brew-batches/comparison";

export const listComparisonCandidatesAction = async () => {
  const user = await requireUser();
  return (await listBrewBatchesForUser(user.id)).map(b => ({ id: b.id, name: b.name, brewNumber: b.brewNumber }));
};
export const compareBatchesAction = async (ids: string[]) => {
  try {
    const user = await requireUser();
    const [leftId, rightId] = z.tuple([z.string().uuid(), z.string().uuid()]).refine(([a, b]) => a !== b).parse(ids);
    const [left, right] = await Promise.all([getBrewBatchDetail(user.id, leftId), getBrewBatchDetail(user.id, rightId)]);
    if (!left || !right) return { ok: false as const, message: "Одна из партий не найдена." };
    return { ok: true as const, comparison: buildBatchComparison(left, right, user.preferredGravityUnit) };
  } catch { return { ok: false as const, message: "Не удалось сравнить партии. Попробуйте ещё раз." }; }
};
