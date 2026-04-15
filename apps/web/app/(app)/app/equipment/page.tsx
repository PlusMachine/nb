import React from "react";
import Link from "next/link";

import {
  type EquipmentProfileDto,
  type EquipmentProfilePayload
} from "@/features/equipment-profiles/contracts";
import { EquipmentProfileFormAdvanced } from "@/components/equipment/equipment-profile-form-advanced";
import { EquipmentProfileFormBasic } from "@/components/equipment/equipment-profile-form-basic";
import { EquipmentProfileSummary } from "@/components/equipment/equipment-profile-summary";
import { buildStarterEquipmentProfileDefaults } from "@/features/equipment/defaults";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { requireUser } from "@/lib/auth";

import {
  createEquipmentProfileAction,
  deleteEquipmentProfileAction,
  updateEquipmentProfileAction
} from "./actions";

type ProfileFormValue = EquipmentProfilePayload & { id?: string };

function EquipmentProfileForm({
  profile,
  mode
}: {
  profile: ProfileFormValue;
  mode: "create" | "edit";
}) {
  const action = mode === "create"
    ? createEquipmentProfileAction
    : updateEquipmentProfileAction.bind(null, profile.id!);

  return (
    <form action={action} className="space-y-4 rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
      <EquipmentProfileFormBasic profile={profile} />
      <EquipmentProfileSummary profile={profile} />
      <EquipmentProfileFormAdvanced profile={profile} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
          {mode === "create" ? "Создать профиль" : "Сохранить профиль"}
        </button>
        {mode === "edit" ? (
          <button
            formAction={deleteEquipmentProfileAction.bind(null, profile.id!)}
            className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700"
          >
            Удалить
          </button>
        ) : null}
      </div>
    </form>
  );
}

const toProfileFormValue = (profile: EquipmentProfileDto): ProfileFormValue => ({
  id: profile.id,
  name: profile.name,
  brewMethod: profile.brewMethod,
  batchTargetType: profile.batchTargetType,
  targetBatchVolumeL: profile.targetBatchVolumeL,
  boilTimeMin: profile.boilTimeMin,
  brewhouseEfficiencyPct: profile.brewhouseEfficiencyPct,
  mashEfficiencyPct: profile.mashEfficiencyPct,
  evaporationRateLPerHr: profile.evaporationRateLPerHr,
  trubChillerLossL: profile.trubChillerLossL,
  fermenterLossL: profile.fermenterLossL,
  mashTunDeadspaceL: profile.mashTunDeadspaceL,
  spargeVesselDeadspaceL: profile.spargeVesselDeadspaceL,
  grainAbsorptionLPerKg: profile.grainAbsorptionLPerKg,
  coolingShrinkagePct: profile.coolingShrinkagePct,
  topUpWaterL: profile.topUpWaterL,
  mashThicknessLPerKg: profile.mashThicknessLPerKg,
  maxMashVolumeL: profile.maxMashVolumeL,
  maxKettleVolumeL: profile.maxKettleVolumeL,
  hopUtilizationFactor: profile.hopUtilizationFactor,
  altitudeM: profile.altitudeM,
  notes: profile.notes
});

export default async function EquipmentProfilesPage() {
  const user = await requireUser();
  const profiles = await listEquipmentProfiles(user.id);
  const starterProfile = buildStarterEquipmentProfileDefaults("biab_single_vessel");

  return (
    <main className="space-y-5">
      <section className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-950">Профили оборудования</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              Задайте объемы, потери, промывку и базовую калибровку варки. В обычном режиме достаточно заполнить верхние поля, а редкие параметры спрятаны ниже.
            </p>
          </div>
          <Link href="/app/recipes/new" className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700">
            В мастер рецептов
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Новый профиль</h2>
        <EquipmentProfileForm profile={starterProfile} mode="create" />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Мои профили</h2>
        {profiles.length ? (
          <div className="space-y-4">
            {profiles.map((profile) => (
              <EquipmentProfileForm key={profile.id} profile={toProfileFormValue(profile)} mode="edit" />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-500">
            Пока нет сохраненных профилей. Создайте первый профиль из готовых значений для BIAB.
          </p>
        )}
      </section>
    </main>
  );
}
