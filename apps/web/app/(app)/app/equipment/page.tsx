import React from "react";
import Link from "next/link";
import { Copy, Pencil, Plus, Star, X } from "lucide-react";

import { Button } from "@nb/ui";
import {
  type EquipmentProfileDto,
  type EquipmentProfilePayload
} from "@/features/equipment-profiles/contracts";
import { EquipmentProfileFormFields } from "@/components/equipment/equipment-profile-form-basic";
import { buildNextEquipmentProfileName, buildStarterEquipmentProfileDefaults } from "@/features/equipment/defaults";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { requireUser } from "@/lib/auth";

import { DeleteEquipmentProfileButton } from "./delete-equipment-profile-button";
import {
  createEquipmentProfileAction,
  duplicateEquipmentProfileAction,
  setDefaultEquipmentProfileAction,
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
    <form action={action} className="space-y-4">
      <EquipmentProfileFormFields profile={profile} />
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" size="sm">
          {mode === "create" ? "Создать профиль" : "Сохранить профиль"}
        </Button>
        <Link href="/app/equipment" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Отменить
        </Link>
      </div>
    </form>
  );
}

const toProfileFormValue = (profile: EquipmentProfileDto): ProfileFormValue => ({
  id: profile.id,
  name: profile.name,
  targetBatchVolumeL: profile.targetBatchVolumeL,
  brewhouseEfficiencyPct: profile.brewhouseEfficiencyPct,
  evaporationRateLPerHr: profile.evaporationRateLPerHr,
  trubChillerLossL: profile.trubChillerLossL,
  fermenterLossL: profile.fermenterLossL,
  grainAbsorptionLPerKg: profile.grainAbsorptionLPerKg,
  coolingShrinkagePct: profile.coolingShrinkagePct,
  mashThicknessLPerKg: profile.mashThicknessLPerKg,
  maxMashVolumeL: profile.maxMashVolumeL,
  maxKettleVolumeL: profile.maxKettleVolumeL,
  hopUtilizationFactor: profile.hopUtilizationFactor,
  altitudeM: profile.altitudeM,
  notes: profile.notes
});

const formatLiters = (value: number | null | undefined) => value == null ? "не задан" : `${value.toFixed(1)} л`;
const formatRate = (value: number) => `${value.toFixed(1)} л/ч`;
const formatPct = (value: number) => `${value.toFixed(0)}%`;

const formatProfilesCount = (count: number) => {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${count} профиль`;
  }

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} профиля`;
  }

  return `${count} профилей`;
};

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <span className="block text-[11px] uppercase text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function EquipmentProfileCard({
  profile,
  isDefault,
  isEditing
}: {
  profile: EquipmentProfileDto;
  isDefault: boolean;
  isEditing: boolean;
}) {
  return (
    <article className={isDefault
      ? "rounded-lg border border-border bg-card p-4 shadow-sm"
      : "rounded-lg border border-border bg-card p-4 shadow-sm"
    }>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-foreground">{profile.name}</h3>
            {isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                <Star className="h-3 w-3" aria-hidden="true" />
                Основной
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href={`/app/equipment?edit=${profile.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Редактировать
          </Link>
          <form action={duplicateEquipmentProfileAction.bind(null, profile.id)}>
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Дублировать
            </button>
          </form>
          {!isDefault ? (
            <form action={setDefaultEquipmentProfileAction.bind(null, profile.id)}>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent">
                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                Сделать основным
              </button>
            </form>
          ) : null}
          <DeleteEquipmentProfileButton profileId={profile.id} profileName={profile.name} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <ProfileMetric label="Типичный объем партии" value={formatLiters(profile.targetBatchVolumeL)} />
        <ProfileMetric label="Эффективность" value={formatPct(profile.brewhouseEfficiencyPct)} />
        <ProfileMetric label="Испарение" value={formatRate(profile.evaporationRateLPerHr)} />
      </div>

      {isEditing ? (
        <div className="mt-4 border-t border-border pt-4">
          <EquipmentProfileForm key={profile.id} profile={toProfileFormValue(profile)} mode="edit" />
        </div>
      ) : null}
    </article>
  );
}

export default async function EquipmentProfilesPage({
  searchParams
}: {
  searchParams?: Promise<{ edit?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const profiles = await listEquipmentProfiles(user.id);
  const starterProfile = buildStarterEquipmentProfileDefaults(
    buildNextEquipmentProfileName(profiles)
  );
  const defaultProfileId = profiles.find((profile) => profile.isDefault)?.id ?? profiles[0]?.id ?? null;
  const editingProfileId = resolvedSearchParams?.edit?.trim();
  const isCreating = resolvedSearchParams?.mode === "create";
  const editingProfile = profiles.find((profile) => profile.id === editingProfileId) ?? null;

  return (
    <main className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Профили оборудования</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatProfilesCount(profiles.length)}
              {defaultProfileId ? ` · основной: ${profiles.find((profile) => profile.id === defaultProfileId)?.name ?? "выбран"}` : ""}
            </p>
          </div>
          {!isCreating ? (
            <Link href="/app/equipment?mode=create" className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Создать профиль
            </Link>
          ) : null}
        </div>
      </section>

      {isCreating ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Новый профиль</h2>
            </div>
          </div>
          <EquipmentProfileForm key="create" profile={starterProfile} mode="create" />
        </section>
      ) : null}

      <section className="space-y-3">
        {profiles.length ? (
          <div className="space-y-4">
            {profiles.map((profile) => (
              <EquipmentProfileCard
                key={profile.id}
                profile={profile}
                isDefault={profile.id === defaultProfileId}
                isEditing={editingProfile?.id === profile.id}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
            Профилей пока нет.
          </p>
        )}
      </section>
    </main>
  );
}
