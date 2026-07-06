"use client";

// =============================================================================
//  components/recipes/brew-picker-dialog.tsx
//  Единый вход «Сварить»: два равноправных режима — «Сварить самому»
//  (виртуальный гид варочного дня) и «Сварить на автоматике» (BrewForge).
//  Виртуальная ветка создаёт партию в статусе 'planned' и ведёт в акт
//  «Подготовка» — сам варочный день запускается уже там; device-ветка получает
//  статус 'brewing' по факту ack устройства (без изменений). Один диалог для
//  публичной витрины, дашборда и редактора рецептов — принимает только
//  recipeId, без привязки к зоне (маршрут после успеха всегда —
//  /app/brew-batches/:id).
//
//  Экран выбора режима показывается ТОЛЬКО если у пользователя есть хотя бы
//  одно привязанное устройство (лениво проверяется при открытии) — иначе сразу
//  виртуальная ветка. Ошибки — внутри диалога (role="alert"), диалог себя не
//  закрывает; REMOTE_DISABLED — честный баннер с явным переходом по клику.
// =============================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Cpu, Loader2, ShieldAlert, Timer } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";

import { startBrewFromRecipeAction } from "@/app/(public)/recipes/[slug]/brew-actions";
import { startBrewOnDeviceFromRecipeAction } from "@/features/brew-controller/brew-recipe-flow";
import { RemoteDisabledNotice } from "@/features/brew-controller/components/remote-disabled-notice";
import { DevicePickerList, type PickerDevice } from "@/features/devices/components/device-picker-list";
import { newIdempotencyKey } from "@/lib/idempotency-key";

type Screen = "gate" | "login" | "mode" | "virtual" | "device-pick" | "device-confirm";

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
  // Аноним: /api/devices отвечает 401 → не гоняем его через выбор режима и
  // создание партии до самого низа, а сразу предлагаем вход (UX-находка #11).
  const [authRequired, setAuthRequired] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [consumeIngredients, setConsumeIngredients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState<{ message: string; brewBatchId: string } | null>(null);
  // Ключ идемпотентности «намерения сварить»: один на открытие диалога, стабилен
  // между ретраями (создать партию два раза одним намерением нельзя). Гард
  // inFlight режет повторный сабмит в том же тике до того, как отрисуется disabled.
  const idempotencyKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const ensureIdempotencyKey = () =>
    (idempotencyKeyRef.current ??= newIdempotencyKey());

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    setAuthRequired(false);
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      // Аноним: requireUser() отвечает не 401, а редиректом (307) на /login, и fetch
      // его СЛЕДУЕТ → res.ok=200 с HTML логина. Ловим оба варианта: и следованный
      // редирект на /login, и 401/403 (на случай, если роут поменяют на JSON-ответ).
      const redirectedToLogin = res.redirected && new URL(res.url).pathname.startsWith("/login");
      if (res.status === 401 || res.status === 403 || redirectedToLogin) {
        setAuthRequired(true);
        return;
      }
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
  // Новое открытие = новое «намерение сварить» → новый ключ идемпотентности
  // (осознанная повторная варка того же рецепта создаёт отдельную партию).
  useEffect(() => {
    if (!open) return;
    setScreen("gate");
    setDevices([]);
    setSelectedDeviceId(null);
    setConsumeIngredients(false);
    setError(null);
    setRemoteDisabled(null);
    setAuthRequired(false);
    idempotencyKeyRef.current = newIdempotencyKey();
    inFlightRef.current = false;
    void loadDevices();
  }, [open, loadDevices]);

  // Экран выбора показываем ВСЕГДА, даже без привязанного прибора: тогда вторая
  // опция — не «на автоматике», а «Подключить BrewForge» (см. mode-экран). Так
  // автоматика видна из основного флоу «Сварить», а не только тем, у кого прибор
  // уже подключён (решение владельца по UX-находкам #9/#10).
  useEffect(() => {
    if (screen !== "gate" || devicesLoading) return;
    setScreen(authRequired ? "login" : "mode");
  }, [screen, devicesLoading, authRequired]);

  const hasDeviceChoice = Boolean(devicesError) || devices.length > 0;
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const loginHref = `/login?next=${encodeURIComponent(slug ? `/recipes/${slug}` : "/app/brew-batches")}`;

  const handleConfirmVirtual = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewFromRecipeAction({
        recipeId,
        consumeIngredients,
        idempotencyKey: ensureIdempotencyKey()
      });
      if (result.ok) {
        // Фидбэк списания довозим query-параметрами — страница партии покажет
        // тост (см. brew-stock-notice.tsx). Параметры добавляем, только если
        // списание вообще запрашивалось (иначе про склад на странице ни слова).
        const params = new URLSearchParams();
        if (result.consume) {
          if (result.consume.ok) {
            params.set("stock", "consumed");
            params.set("items", String(result.consume.itemCount));
          } else {
            params.set("stock", result.consume.code);
          }
        }
        const query = params.toString();
        // Может пересекать зоны (публичная витрина → app) — полная навигация уместна.
        window.location.assign(`/app/brew-batches/${result.brewBatchId}${query ? `?${query}` : ""}`);
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
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirmDevice = async () => {
    if (!selectedDeviceId || inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewOnDeviceFromRecipeAction({
        recipeId,
        deviceId: selectedDeviceId,
        idempotencyKey: ensureIdempotencyKey()
      });
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
      inFlightRef.current = false;
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
            {screen === "device-pick" || screen === "device-confirm" ? (
              <Cpu className="h-5 w-5" />
            ) : (
              <Timer className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {recipeTitle ? `Сварить «${recipeTitle}»` : "Сварить"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {screen === "gate" ? "Проверяем ваши устройства…" : null}
              {screen === "login" ? "Войдите, чтобы начать варку." : null}
              {screen === "mode" ? "Выберите, как варить." : null}
              {screen === "virtual" ? "Партия появится в подготовке — старт варочного дня там." : null}
              {screen === "device-pick" ? "Выберите устройство BrewForge." : null}
              {screen === "device-confirm" ? "Подтвердите запуск нагрева." : null}
            </p>
          </div>
        </div>
        <DialogCloseButton disabled={submitting} />
      </DialogHeader>

      {screen === "gate" ? (
        <div className="flex items-center gap-2 p-5 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      ) : null}

      {screen === "login" ? (
        <div className="p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Варка сохранится в вашей мастерской: шаги, таймеры и замеры в одном месте. Аккаунт создаётся
            автоматически при первом входе.
          </p>
        </div>
      ) : null}

      {screen === "mode" ? (
        <div className="space-y-3 p-5">
          <button
            type="button"
            onClick={() => setScreen("virtual")}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-border hover:bg-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
              <Timer className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">Сварить самому</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Гид варочного дня на экране: паузы, таймеры, шаги.
              </span>
            </span>
          </button>
          {hasDeviceChoice ? (
            <button
              type="button"
              onClick={() => setScreen("device-pick")}
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-border hover:bg-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                <Cpu className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Сварить на автоматике</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Рецепт уйдёт на контроллер BrewForge, который запустит нагрев.
                </span>
              </span>
            </button>
          ) : (
            // Прибор не подключён: вместо device-ветки — вход в подключение BrewForge.
            // Полная навигация (уходим в рабочую зону; из публичной витрины —
            // /app/devices сам отправит на логин при необходимости).
            <button
              type="button"
              onClick={() => window.location.assign("/app/devices")}
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-border hover:bg-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                <Cpu className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Подключить BrewForge</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Автоматика варки: контроллер сам греет и держит паузы затирания. Пока не подключён.
                </span>
              </span>
            </button>
          )}
        </div>
      ) : null}

      {screen === "virtual" ? (
        <div className="space-y-3 p-5">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${
              consumeIngredients ? "border-foreground bg-muted" : "border-border bg-card"
            }`}
          >
            <input
              type="checkbox"
              checked={consumeIngredients}
              onChange={(event) => setConsumeIngredients(event.target.checked)}
              className="mt-1"
            />
            <span className="block text-sm font-semibold text-foreground">Списать ингредиенты со склада</span>
          </label>
          {error ? (
            <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-3 text-sm text-destructive-subtle-foreground" role="alert">
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
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-3 text-sm text-warning-subtle-foreground">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-subtle-foreground" />
                <div>
                  <p className="font-semibold">Запуск включит нагрев</p>
                  <p className="mt-1 text-xs leading-5 text-warning-subtle-foreground">
                    Устройство «{selectedDevice?.name ?? "—"}» начнёт нагрев ТЭНов по рецепту. Убедитесь, что в
                    ёмкости есть вода, а оборудование под присмотром.
                  </p>
                </div>
              </div>
              {error ? (
                <div
                  className="flex items-start gap-2 rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-3 text-sm text-destructive-subtle-foreground"
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

      {screen === "login" ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          {/* Полная навигация: уходим в публичную зону логина с возвратом на рецепт. */}
          <Button variant="primary" onClick={() => window.location.assign(loginHref)}>
            Войти
          </Button>
        </DialogFooter>
      ) : null}

      {screen === "virtual" ? (
        <DialogFooter>
          {/* Экран выбора теперь показывается всегда → «Назад» всегда ведёт на него. */}
          <Button variant="outline" onClick={() => setScreen("mode")} disabled={submitting}>
            Назад
          </Button>
          <Button variant="primary" onClick={() => void handleConfirmVirtual()} disabled={submitting}>
            {submitting ? "Создаём…" : "Создать варку"}
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
