"use client";

// =============================================================================
//  features/device-streams/components/connect-stream-device-form.tsx
//  F1 «Поплавок/датчик» — шаг 2 визарда подключения (docs/specs/third-party-
//  fermentation-devices.md §5): имя (дефолт — лейбл выбранного вида) + вид
//  устройства. Сабмит → createStreamDeviceAction → редирект на страницу
//  устройства (там экран подключения: URL, инструкция, живая зона).
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Input, Select, useToast } from "@nb/ui";

import { createStreamDeviceAction } from "@/features/device-streams/actions";
import {
  streamHardwareKindLabels,
  streamWizardHardwareKinds,
  type StreamHardwareKind
} from "@/features/device-streams/contracts";

type Props = {
  onBack: () => void;
};

const DEFAULT_KIND: StreamHardwareKind = streamWizardHardwareKinds[0] ?? "ispindel";

export function ConnectStreamDeviceForm({ onBack }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [kind, setKind] = useState<StreamHardwareKind>(DEFAULT_KIND);
  const [name, setName] = useState<string>(streamHardwareKindLabels[DEFAULT_KIND]);
  const [nameTouched, setNameTouched] = useState(false);
  const [pending, setPending] = useState(false);

  const handleKindChange = (next: StreamHardwareKind) => {
    setKind(next);
    // Имя — дефолт по виду, ПОКА пользователь его не тронул руками.
    if (!nameTouched) {
      setName(streamHardwareKindLabels[next]);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const trimmed = name.trim();
      const result = await createStreamDeviceAction({ name: trimmed || streamHardwareKindLabels[kind], kind });
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      router.push(`/app/devices/${result.deviceId}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Цифровой ареометр или датчик</h2>
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Вид устройства
          <Select
            value={kind}
            onChange={(event) => handleKindChange(event.target.value as StreamHardwareKind)}
          >
            {streamWizardHardwareKinds.map((option) => (
              <option key={option} value={option}>
                {streamHardwareKindLabels[option]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          Название
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameTouched(true);
            }}
            placeholder={streamHardwareKindLabels[kind]}
            autoComplete="off"
          />
        </label>
        <div className="flex items-center gap-2 sm:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Подключаем…" : "Подключить"}
          </Button>
          <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
            Назад
          </Button>
        </div>
      </form>
    </Card>
  );
}
