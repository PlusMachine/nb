"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Dialog,
  DialogCloseButton,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  useToast,
  type BadgeTone
} from "@nb/ui";

import { yankFirmwareReleaseAction } from "@/app/(admin)/admin/firmware/actions";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { NumericInput } from "@/components/shared/numeric-input";
import {
  FIRMWARE_UPLOAD_ACCEPT,
  formatFirmwareSize,
  type AdminFirmwareRelease,
  type FirmwareReleaseStatus
} from "@/features/firmware/contracts";

const statusTone: Record<FirmwareReleaseStatus, BadgeTone> = {
  latest: "success",
  published: "neutral",
  yanked: "danger",
  draft: "warning"
};

const formatDate = (value: Date | null) =>
  value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function FirmwareReleasesPanel({ releases }: { releases: AdminFirmwareRelease[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [channel, setChannel] = useState("stable");
  const [protocolSchema, setProtocolSchema] = useState("1");
  const fileRef = useRef<HTMLInputElement>(null);

  const [yankTarget, setYankTarget] = useState<AdminFirmwareRelease | null>(null);
  const [yankReason, setYankReason] = useState("");
  const [yankError, setYankError] = useState<string | null>(null);

  const resetUpload = () => {
    setVersion("");
    setNotes("");
    setChannel("stable");
    setProtocolSchema("1");
    setUploadError(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Выберите файл прошивки.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    body.set("version", version.trim());
    body.set("notes", notes.trim());
    body.set("channel", channel);
    body.set("protocolSchema", protocolSchema.trim() || "1");

    setUploading(true);
    setUploadError(null);
    try {
      // Образ ~2 МБ не проходит через server action (лимит тела 1 МБ) — грузим роутом.
      const response = await fetch("/api/admin/firmware/upload", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as
        | { ok: true; version: string }
        | { ok: false; message: string }
        | null;

      if (!response.ok || !result?.ok) {
        const message = result && !result.ok ? result.message : "Не удалось опубликовать прошивку.";
        setUploadError(message);
        show({ title: "Не удалось опубликовать", description: message, tone: "danger" });
        return;
      }

      show({ title: `Прошивка ${result.version} опубликована`, tone: "success" });
      setUploadOpen(false);
      resetUpload();
      router.refresh();
    } catch {
      const message = "Файл не удалось отправить — проверьте соединение.";
      setUploadError(message);
      show({ title: "Не удалось опубликовать", description: message, tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const handleYank = () => {
    const target = yankTarget;
    const reason = yankReason.trim();
    if (!target || !reason) {
      return;
    }

    startTransition(async () => {
      const result = await yankFirmwareReleaseAction(target.version, reason);
      if (!result.ok) {
        setYankError(result.error);
        show({ title: "Не удалось отозвать", description: result.error, tone: "danger" });
        return;
      }

      show({ title: `Релиз ${target.version} отозван`, tone: "success" });
      setYankTarget(null);
      setYankReason("");
      setYankError(null);
      router.refresh();
    });
  };

  const columns: AdminDataTableColumn<AdminFirmwareRelease>[] = [
    {
      key: "version",
      header: "Версия",
      headerClassName: "w-40",
      cell: (release) => (
        <div className="space-y-1">
          <span className="font-medium text-foreground">{release.version}</span>
          <Badge tone={statusTone[release.status]} size="sm">
            {release.statusLabel}
          </Badge>
        </div>
      )
    },
    {
      key: "channel",
      header: "Канал",
      headerClassName: "w-28",
      cell: (release) => <span className="text-muted-foreground">{release.channel}</span>
    },
    {
      key: "published",
      header: "Опубликован",
      headerClassName: "w-48",
      cell: (release) => (
        <div className="space-y-0.5">
          <div>{formatDate(release.publishedAt)}</div>
          {release.publishedByName ? (
            <div className="text-xs text-muted-foreground">{release.publishedByName}</div>
          ) : null}
          {release.yankedAt ? (
            <div className="text-xs text-destructive">Отозван: {formatDate(release.yankedAt)}</div>
          ) : null}
        </div>
      )
    },
    {
      key: "size",
      header: "Размер",
      headerClassName: "w-28",
      cell: (release) => <span className="tabular-nums">{formatFirmwareSize(release.fileSize)}</span>
    },
    {
      key: "notes",
      header: "Заметки",
      cell: (release) => (
        <div className="space-y-1">
          <p className="whitespace-pre-line text-sm text-muted-foreground">{release.notes}</p>
          <p className="font-mono text-xs text-muted-foreground/70">sha256: {release.fileSha256.slice(0, 12)}…</p>
        </div>
      )
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-32",
      cardLabel: "Действия",
      cell: (release) =>
        release.yankedAt === null ? (
          <Button
            type="button"
            variant="dangerOutline"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setYankTarget(release);
              setYankReason("");
              setYankError(null);
            }}
          >
            Отозвать
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
          Загрузить прошивку
        </Button>
      </div>

      <AdminDataTable
        items={releases}
        columns={columns}
        getRowId={(release) => release.id}
        getRowLabel={(release) => release.version}
        empty={
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Ни одной прошивки не опубликовано.
          </p>
        }
      />

      <Dialog
        open={uploadOpen}
        onOpenChange={(next) => {
          if (!next && !uploading) {
            setUploadOpen(false);
            resetUpload();
          }
        }}
        title="Загрузить прошивку"
        hideTitle
      >
        <DialogHeader>
          <h3 className="text-base font-semibold text-foreground">Загрузить прошивку</h3>
          <DialogCloseButton />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label htmlFor="firmware-file" className="text-sm font-medium text-foreground">
              Файл образа
            </label>
            <input
              id="firmware-file"
              ref={fileRef}
              type="file"
              accept={FIRMWARE_UPLOAD_ACCEPT}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="firmware-version" className="text-sm font-medium text-foreground">
              Версия
            </label>
            <Input
              id="firmware-version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="2.1.0"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Канал" value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="stable">stable</option>
              <option value="beta">beta</option>
            </Select>

            <div className="grid gap-1.5">
              <label htmlFor="firmware-schema" className="text-sm font-medium text-foreground">
                Схема протокола
              </label>
              <NumericInput
                id="firmware-schema"
                integer
                min={1}
                value={protocolSchema}
                onChange={(event) => setProtocolSchema(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="firmware-notes" className="text-sm font-medium text-foreground">
              Заметки
            </label>
            <textarea
              id="firmware-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Что изменилось в этой версии"
              className="h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => {
              setUploadOpen(false);
              resetUpload();
            }}
          >
            Отмена
          </Button>
          <Button type="button" variant="primary" disabled={uploading} onClick={handleUpload}>
            {uploading ? "Загружаем…" : "Опубликовать"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={yankTarget !== null}
        onOpenChange={(next) => {
          if (!next && !isPending) {
            setYankTarget(null);
            setYankReason("");
            setYankError(null);
          }
        }}
        title={yankTarget ? `Отозвать релиз ${yankTarget.version}?` : "Отозвать релиз?"}
        hideTitle
      >
        <DialogHeader>
          <h3 className="text-base font-semibold text-foreground">
            {yankTarget ? `Отозвать релиз ${yankTarget.version}?` : "Отозвать релиз?"}
          </h3>
          <DialogCloseButton />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Устройства перестанут получать эту версию. Запись и файл останутся — вернуть релиз обратно нельзя, нужно
            выпустить новую версию.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="firmware-yank-reason" className="text-sm font-medium text-foreground">
              Причина отзыва
            </label>
            <textarea
              id="firmware-yank-reason"
              value={yankReason}
              onChange={(event) => setYankReason(event.target.value)}
              placeholder="Например: кирпичит плату при OTA с 2.0.x"
              className="h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {yankError ? <p className="text-sm text-destructive">{yankError}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setYankTarget(null);
              setYankReason("");
              setYankError(null);
            }}
          >
            Отмена
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={isPending || yankReason.trim().length === 0}
            onClick={handleYank}
          >
            {isPending ? "Отзываем…" : "Отозвать"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
