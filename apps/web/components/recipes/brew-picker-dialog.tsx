"use client";

// =============================================================================
//  components/recipes/brew-picker-dialog.tsx
//  Единый вход «Сварить»: два равноправных режима — «Сварить самому»
//  (виртуальный гид варочного дня) и «Сварить на автоматике» (BrewForge). Клик
//  реально ЗАПУСКАЕТ варку (не оставляет запись в 'planned' без сигнала) —
//  партия сразу переходит в 'brewing' (виртуальная ветка) либо получает этот
//  статус по факту ack устройства (автоматика). Один диалог для публичной
//  витрины, дашборда и редактора рецептов — принимает только recipeId, без
//  привязки к зоне (маршрут после успеха всегда — /app/brew-batches/:id).
//
//  Экран выбора режима показывается ТОЛЬКО если у пользователя есть хотя бы
//  одно привязанное устройство (лениво проверяется при открытии) — иначе сразу
//  виртуальная ветка. Ошибки — внутри диалога (role="alert"), диалог себя не
//  закрывает; REMOTE_DISABLED — честный баннер с явным переходом по клику.
// =============================================================================
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cpu, Loader2, ShieldAlert, Timer } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";

import { startBrewFromRecipeAction } from "@/app/(public)/recipes/[slug]/brew-actions";
import { startBrewOnDeviceFromRecipeAction } from "@/features/brew-controller/brew-recipe-flow";
import { RemoteDisabledNotice } from "@/features/brew-controller/components/remote-disabled-notice";
import { DevicePickerList, type PickerDevice } from "@/features/devices/components/device-picker-list";

type Screen = "gate" | "mode" | "virtual" | "device-pick" | "device-confirm";

export type BrewPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Рецепт для варки — свой любой статус или чужой published (без клонирования). */
  recipeId: string;
  /** Slug рецепта — только для редиректа на логин из публичной витрины. */
  slug?: string;
  /** Название рецепта для заголовка диалога (опционально). */
  recipeTitle?: string | null;
};

export function BrewPickerDialog({ open, onOpenChange, recipeId, slug, recipeTitle }: BrewPickerDialogProps) {
  const [screen, setScreen] = useState<Screen>("gate");
  const [devices, setDevices] = useState<PickerDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [consumeIngredients, setConsumeIngredients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState<{ message: string; brewBatchId: string } | null>(null);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (!res.ok) throw new Error("LIST_FAILED");
      const data = (await res.json()) as { devices?: PickerDevice[] };
      const list = data.devices ?? [];
      setDevices(list);
      setSelectedDeviceId((prev) => prev ?? list.find((device) => device.status === "online")?.id ?? null);
    } catch {
      setDevicesError("Не удалось загрузить список устройств.");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  // Сброс состояния мастера и ленивая проверка устройств при каждом открытии.
  useEffect(() => {
    if (!open) return;
    setScreen("gate");
    setDevices([]);
    setSelectedDeviceId(null);
    setConsumeIngredients(false);
    setError(null);
    setRemoteDisabled(null);
    void loadDevices();
  }, [open, loadDevices]);

  // Гейт режима: устройств нет (или их не удалось посчитать) → сразу виртуальная
  // ветка без экрана выбора; иначе — выбор режима.
  useEffect(() => {
    if (screen !== "gate" || devicesLoading) return;
    setScreen(devicesError || devices.length > 0 ? "mode" : "virtual");
  }, [screen, devicesLoading, devicesError, devices.length]);

  const hasDeviceChoice = Boolean(devicesError) || devices.length > 0;
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;

  const handleConfirmVirtual = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewFromRecipeAction({ recipeId, consumeIngredients });
      if (result.ok) {
        // Может пересекать зоны (публичная витрина → app) — полная навигация уместна.
        window.location.assign(`/app/brew-batches/${result.brewBatchId}`);
        return;
      }
      if (result.code === "AUTH" && slug) {
        window.location.assign(`/login?next=${encodeURIComponent(`/recipes/${slug}`)}`);
        return;
      }
      setError(result.message);
    } catch {
      setError("Не удалось начать варку. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDevice = async () => {
    if (!selectedDeviceId) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewOnDeviceFromRecipeAction({ recipeId, deviceId: selectedDeviceId });
      if (result.ok && result.heatingStarted && result.brewBatchId) {
        window.location.assign(`/app/brew-batches/${result.brewBatchId}`);
        return;
      }
      if (result.ok && result.brewBatchId) {
        // REMOTE_DISABLED — не уходим молча, ждём явного клика.
        setRemoteDisabled({ message: result.message, brewBatchId: result.brewBatchId });
        return;
      }
      setError(result.message);
    } catch {
      setError("Не удалось запустить варку на устройстве.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Сварить рецепт"
      hideTitle
      size="md"
      guard={{ isDirty: () => submitting, onGuardedClose: () => {} }}
    >
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            {screen === "device-pick" || screen === "device-confirm" ? (
              <Cpu className="h-5 w-5" />
            ) : (
              <Timer className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-950">
              {recipeTitle ? `Сварить «${recipeTitle}»` : "Сварить"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {screen === "gate" ? "Проверяем ваши устройства…" : null}
              {screen === "mode" ? "Выберите, как варить." : null}
              {screen === "virtual" ? "Гид варочного дня: паузы и таймеры на экране." : null}
              {screen === "device-pick" ? "Выберите устройство BrewForge." : null}
              {screen === "device-confirm" ? "Подтвердите запуск нагрева." : null}
            </p>
          </div>
        </div>
        <DialogCloseButton disabled={submitting} />
      </DialogHeader>

      {screen === "gate" ? (
        <div className="flex items-center gap-2 p-5 py-10 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      ) : null}

      {screen === "mode" ? (
        <div className="space-y-3 p-5">
          <button
            type="button"
            onClick={() => setScreen("virtual")}
            className="flex w-full items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Timer className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Сварить самому</span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                Гид варочного дня на экране: паузы, таймеры, шаги.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setScreen("device-pick")}
            className="flex w-full items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Cpu className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Сварить на автоматике</span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                Рецепт уйдёт на контроллер BrewForge, который запустит нагрев.
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {screen === "virtual" ? (
        <div className="space-y-3 p-5">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${
              consumeIngredients ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={consumeIngredients}
              onChange={(event) => setConsumeIngredients(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Списать ингредиенты со склада</span>
              <span className="text-xs leading-5 text-zinc-500">
                Списание будет выполнено только после нажатия кнопки ниже.
              </span>
            </span>
          </label>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      {screen === "device-pick" ? (
        <div className="p-5">
          <DevicePickerList
            devices={devices}
            loading={devicesLoading}
            loadError={devicesError}
            onRetry={() => void loadDevices()}
            selectedDeviceId={selectedDeviceId}
            onSelect={setSelectedDeviceId}
            onDeviceAdded={(device) =>
              setDevices((prev) => [...prev.filter((existing) => existing.id !== device.id), device])
            }
            disabled={submitting}
          />
        </div>
      ) : null}

      {screen === "device-confirm" ? (
        <div className="space-y-3 p-5">
          {remoteDisabled ? (
            <RemoteDisabledNotice message={remoteDisabled.message} brewBatchId={remoteDisabled.brewBatchId} />
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">Запуск включит нагрев</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Устройство «{selectedDevice?.name ?? "—"}» начнёт нагрев ТЭНов по рецепту. Убедитесь, что в
                    ёмкости есть вода, а оборудование под присмотром.
                  </p>
                </div>
              </div>
              {error ? (
                <div
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {screen === "virtual" ? (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => (hasDeviceChoice ? setScreen("mode") : onOpenChange(false))}
            disabled={submitting}
          >
            {hasDeviceChoice ? "Назад" : "Отмена"}
          </Button>
          <Button variant="primary" onClick={() => void handleConfirmVirtual()} disabled={submitting}>
            {submitting ? "Готовим…" : "Сварить"}
          </Button>
        </DialogFooter>
      ) : null}

      {screen === "device-pick" ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => setScreen("mode")} disabled={submitting}>
            Назад
          </Button>
          <Button onClick={() => setScreen("device-confirm")} disabled={submitting || !selectedDeviceId}>
            Далее
          </Button>
        </DialogFooter>
      ) : null}

      {screen === "device-confirm" ? (
        <DialogFooter>
          {remoteDisabled ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setScreen("device-pick")} disabled={submitting}>
                Назад
              </Button>
              <Button variant="primary" onClick={() => void handleConfirmDevice()} disabled={submitting}>
                {submitting ? "Запускаем…" : "Подтвердить и запустить нагрев"}
              </Button>
            </>
          )}
        </DialogFooter>
      ) : null}
    </Dialog>
  );
}
