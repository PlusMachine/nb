"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button, useToast } from "@nb/ui";
import {
  MASTER_IMAGE_MAX_COUNT,
  MASTER_PUBLISHED_LABEL,
  masterReviewStatusLabels
} from "@/features/masters/contracts";
import type { MasterItemDto, MasterProfileDto } from "@/features/masters/service";
import type { MasterImageDto } from "@/features/masters/images";

import {
  setOwnMasterListedAction,
  submitMasterForReviewAction,
  updateMasterProfileAction,
  withdrawMasterSubmissionAction
} from "./actions";
import {
  buildMasterProfileFormPayload,
  MasterProfileFormFields,
  type MasterProfileFormValues
} from "./master-profile-fields";
import { MasterImageManager, type MasterImageCardItem } from "./master-image-manager";
import { MasterItemsSection } from "./master-items-section";

const profileToFormValues = (profile: MasterProfileDto): MasterProfileFormValues => ({
  displayName: profile.displayName,
  city: profile.city,
  specializations: profile.specializations as MasterProfileFormValues["specializations"],
  summary: profile.summary,
  about: profile.about,
  contactTelegram: profile.contactTelegram ?? "",
  contactPhone: profile.contactPhone ?? "",
  contactEmail: profile.contactEmail ?? "",
  contactWebsite: profile.contactWebsite ?? "",
  craftSince: profile.craftSince ? String(profile.craftSince) : ""
});

function StatusPanel({
  profile,
  busy,
  onSubmit,
  onWithdraw,
  onToggleListed
}: {
  profile: MasterProfileDto;
  busy: boolean;
  onSubmit: () => void;
  onWithdraw: () => void;
  onToggleListed: (next: boolean) => void;
}) {
  const isPending = profile.reviewStatus === "pending";
  const isRejected = profile.reviewStatus === "rejected";

  const badgeLabel = isPending
    ? masterReviewStatusLabels.pending
    : profile.hasPublished
      ? MASTER_PUBLISHED_LABEL
      : masterReviewStatusLabels[profile.reviewStatus];

  const badgeClassName = isPending
    ? "bg-warning-subtle text-warning-subtle-foreground"
    : isRejected
      ? "bg-destructive-subtle text-destructive-subtle-foreground"
      : profile.hasPublished
        ? "bg-success-subtle text-success-subtle-foreground"
        : "bg-muted text-muted-foreground";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeClassName}`}>
            {badgeLabel}
          </span>
          {profile.slug && profile.hasPublished ? (
            <Link
              href={`/masters/${profile.slug}`}
              className="text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
              Открыть мою страницу
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {profile.hasPublished ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onToggleListed(!profile.isListed)}>
              {profile.isListed ? "Скрыть с витрины" : "Показывать на витрине"}
            </Button>
          ) : null}

          {isPending ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onWithdraw}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Отозвать
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={onSubmit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {profile.hasPublished ? "Опубликовать изменения" : "Отправить на модерацию"}
            </Button>
          )}
        </div>
      </div>

      {isRejected && profile.moderationNote ? (
        <p className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
          Модератор отклонил заявку: {profile.moderationNote}
        </p>
      ) : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">
          Заявка на модерации, редактирование недоступно.
          {profile.hasPublished ? " Пока идёт проверка, на витрине видна прежняя опубликованная версия." : ""}
        </p>
      ) : null}
    </section>
  );
}

export function MasterCabinet({
  initialProfile,
  initialItems,
  initialImages
}: {
  initialProfile: MasterProfileDto;
  initialItems: MasterItemDto[];
  initialImages: MasterImageDto[];
}) {
  const toast = useToast();
  const [profile, setProfile] = useState(initialProfile);
  const [items, setItems] = useState(initialItems);
  const [images, setImages] = useState<MasterImageCardItem[]>(initialImages);
  const [profileFormValues, setProfileFormValues] = useState<MasterProfileFormValues>(() => profileToFormValues(initialProfile));
  const [statusBusy, setStatusBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const isLocked = profile.reviewStatus === "pending";

  const activeImageCount = useMemo(() => images.filter((image) => !image.isLocalOnly).length, [images]);
  const atProfileLimit = activeImageCount >= MASTER_IMAGE_MAX_COUNT;
  const galleryImages = useMemo(() => images.filter((image) => image.itemId === null), [images]);

  const handleProfileSave = async () => {
    setProfileBusy(true);
    setProfileError(null);
    const result = await updateMasterProfileAction(buildMasterProfileFormPayload(profileFormValues));
    setProfileBusy(false);

    if (!result.ok) {
      setProfileError(result.error);
      return;
    }

    setProfile(result.profile);
    toast.show({ title: "Профиль сохранён", tone: "success" });
  };

  const handleSubmit = async () => {
    setStatusBusy(true);
    const result = await submitMasterForReviewAction();
    setStatusBusy(false);

    if (!result.ok) {
      toast.show({ title: "Не удалось отправить на модерацию", description: result.error, tone: "danger" });
      return;
    }

    setProfile(result.profile);
    toast.show({ title: "Отправлено на модерацию", tone: "success" });
  };

  const handleWithdraw = async () => {
    setStatusBusy(true);
    const result = await withdrawMasterSubmissionAction();
    setStatusBusy(false);

    if (!result.ok) {
      toast.show({ title: "Не удалось отозвать заявку", description: result.error, tone: "danger" });
      return;
    }

    setProfile(result.profile);
    toast.show({ title: "Заявка отозвана", tone: "success" });
  };

  const handleToggleListed = async (next: boolean) => {
    setStatusBusy(true);
    const result = await setOwnMasterListedAction(next);
    setStatusBusy(false);

    if (!result.ok) {
      toast.show({ title: "Не удалось изменить видимость", description: result.error, tone: "danger" });
      return;
    }

    setProfile(result.profile);
    toast.show({ title: next ? "Витрина снова видна" : "Витрина скрыта", tone: "success" });
  };

  return (
    <main className="space-y-6">
      <StatusPanel
        profile={profile}
        busy={statusBusy}
        onSubmit={() => void handleSubmit()}
        onWithdraw={() => void handleWithdraw()}
        onToggleListed={(next) => void handleToggleListed(next)}
      />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Профиль</h2>
        <MasterProfileFormFields values={profileFormValues} onChange={setProfileFormValues} disabled={isLocked || profileBusy} />
        {profileError ? <p role="alert" className="text-sm text-destructive">{profileError}</p> : null}
        {!isLocked ? (
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button type="button" size="sm" disabled={profileBusy} onClick={() => void handleProfileSave()}>
              {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Сохранить профиль
            </Button>
          </div>
        ) : null}
      </section>

      <MasterItemsSection
        items={items}
        images={images}
        disabled={isLocked}
        atProfileLimit={atProfileLimit}
        onItemsChange={setItems}
        onImagesChange={setImages}
      />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Галерея работ ({activeImageCount}/{MASTER_IMAGE_MAX_COUNT})</h2>
        <MasterImageManager
          itemId={null}
          images={galleryImages}
          onChange={(nextGallery) => setImages([...images.filter((image) => image.itemId !== null), ...nextGallery])}
          disabled={isLocked}
          atProfileLimit={atProfileLimit}
          emptyLabel="Фото в общей галерее ещё нет."
        />
      </section>
    </main>
  );
}
