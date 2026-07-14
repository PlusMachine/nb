"use client";

// =============================================================================
//  features/device-streams/components/rapt-integration-card.tsx
//  Компактная карточка «RAPT Cloud подключение» на /app/devices (§5 F8, M4-B):
//  показывает URL вебхука (или предлагает перевыпустить, если ключ шифрования
//  не позволил показать его повторно — Д1), «Перевыпустить URL» и «Удалить
//  подключение». Рендерится ТОЛЬКО когда подключение уже существует (интеграция
//  создаётся визардом RaptConnectScreen) — это не часть визарда, а его «долгая
//  память»: пользователь видит и правит подключение, не открывая визард заново.
// =============================================================================
import { useState } from "react";

import { Button, Card, useToast } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { deleteRaptIntegrationAction, rotateRaptWebhookTokenAction } from "@/features/device-streams/actions";
import type { RaptIntegrationDto } from "@/features/device-streams/contracts";
import { pluralize } from "@/lib/pluralize";

type Props = {
  integration: RaptIntegrationDto;
  /** Число RAPT-устройств пользователя — для текста подтверждения удаления (посчитано на клиенте из уже загруженных плиток, без доп. запроса). */
  deviceCount: number;
  onIntegrationChange: (integration: RaptIntegrationDto) => void;
  onDeleted: () => void;
};

export function RaptIntegrationCard({ integration, deviceCount, onIntegrationChange, onDeleted }: Props) {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotatePending, setRotatePending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const copyUrl = async () => {
    if (!integration.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(integration.webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер обмена недоступен — URL уже показан текстом
    }
  };

  const submitRotate = async () => {
    setRotatePending(true);
    try {
      const result = await rotateRaptWebhookTokenAction();
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      onIntegrationChange(result.integration);
      setCopied(false);
      setRotateOpen(false);
      show({ title: "URL перевыпущен. Старый больше не работает", tone: "success" });
    } finally {
      setRotatePending(false);
    }
  };

  const submitDelete = async () => {
    setDeletePending(true);
    try {
      const result = await deleteRaptIntegrationAction();
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      setDeleteOpen(false);
      show({ title: "Подключение RAPT удалено", tone: "success" });
      onDeleted();
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">RAPT Cloud подключение</p>
        {integration.webhookUrl ? (
          <p className="truncate font-mono text-xs text-muted-foreground">{integration.webhookUrl}</p>
        ) : (
          <p className="text-xs text-muted-foreground">URL показывается один раз. Перевыпустите, чтобы получить новый.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {integration.webhookUrl ? (
          <Button variant="outline" size="sm" onClick={() => void copyUrl()}>
            {copied ? "Скопировано" : "Скопировать URL"}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setRotateOpen(true)}>
          Перевыпустить URL
        </Button>
        <Button variant="dangerOutline" size="sm" onClick={() => setDeleteOpen(true)}>
          Удалить подключение
        </Button>
      </div>

      <ConfirmActionDialog
        open={rotateOpen}
        title="Перевыпустить URL?"
        description="Старый URL перестанет работать сразу — вебхук на RAPT-портале, использующий его, перестанет присылать данные, пока вы не пропишете новый."
        confirmLabel="Перевыпустить"
        pendingLabel="Перевыпускаем…"
        tone="danger"
        pending={rotatePending}
        onConfirm={() => void submitRotate()}
        onClose={() => {
          if (!rotatePending) setRotateOpen(false);
        }}
      />

      <ConfirmActionDialog
        open={deleteOpen}
        title="Удалить подключение RAPT?"
        description={`Устройства и накопленные данные останутся${
          deviceCount > 0 ? ` (${deviceCount} ${pluralize(deviceCount, ["устройство", "устройства", "устройств"])})` : ""
        } — они просто перестанут получать новые точки, пока вы не настроите вебхук заново.`}
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        tone="danger"
        pending={deletePending}
        onConfirm={() => void submitDelete()}
        onClose={() => {
          if (!deletePending) setDeleteOpen(false);
        }}
      />
    </Card>
  );
}
