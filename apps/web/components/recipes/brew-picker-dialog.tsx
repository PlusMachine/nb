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

import {
  getBrewVolumeOptionsAction,
  startBrewFromRecipeAction,
  type BrewVolumeOptions,
  type StartBrewConsumeResult
} from "@/app/(public)/recipes/[slug]/brew-actions";
import {
  BrewVolumeChoice,
  hasBrewVolumeMismatch,
  isBrewVolumeSelectionReady,
  resolveBrewVolumeSelection,
  type BrewVolumeChoiceKind
} from "@/components/recipes/brew-volume-choice";
import { startBrewOnDeviceFromRecipeAction } from "@/features/brew-controller/brew-recipe-flow";
import { RemoteDisabledNotice } from "@/features/brew-controller/components/remote-disabled-notice";
import {
  DevicePickerList,
  isBrewCapableDevice,
  type PickerDevice
} from "@/features/devices/components/device-picker-list";
import { newIdempotencyKey } from "@/lib/idempotency-key";

type Screen = "gate" | "login" | "mode" | "virtual" | "device-pick" | "device-confirm";

// Локальная (не UTC) дата «сегодня» в формате yyyy-MM-dd — минимум для input[type=date].
const todayLocalDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Фидбэк списания склада для страницы партии — компактными query-параметрами,
 *  не свободным текстом (сам текст подсказки живёт в brew-stock-notice.tsx).
 *  Пусто, если списание вообще не запрашивалось (тогда на странице партии ни
 *  слова про склад). Общая для обеих веток единого входа «Сварить» — «самому»
 *  и «на автоматике». */
const buildStockQuery = (consume?: StartBrewConsumeResult): string => {
  if (!consume) return "";
  const params = new URLSearchParams();
  if (consume.ok) {
    params.set("stock", "consumed");
    params.set("items", String(consume.itemCount));
  } else {
    params.set("stock", consume.code);
  }
  if (consume.hasSubstitutes) {
    params.set("consumeSubs", "1");
  }
  return params.toString();
};

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
  // Раздел устройств в разработке: /api/devices отвечает devicesEnabled=false →
  // ветка автоматики (и CTA «Подключить BrewForge») скрывается целиком.
  const [devicesEnabled, setDevicesEnabled] = useState(true);
  // Аноним: /api/devices отвечает 401 → не гоняем его через выбор режима и
  // создание партии до самого низа, а сразу предлагаем вход (UX-находка #11).
  const [authRequired, setAuthRequired] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [consumeIngredients, setConsumeIngredients] = useState(false);
  // Дата варки (опционально) — yyyy-MM-dd, пусто = не задана.
  const [plannedDate, setPlannedDate] = useState("");
  // Объём варки: объёмы рецепта и оборудования подтягиваются при открытии; выбор
  // обязателен, только если они разошлись (см. brew-volume-choice.tsx).
  const [volumeOptions, setVolumeOptions] = useState<BrewVolumeOptions | null>(null);
  const [volumeOptionsLoading, setVolumeOptionsLoading] = useState(true);
  const [volumeChoice, setVolumeChoice] = useState<BrewVolumeChoiceKind | null>(null);
  const [customVolume, setCustomVolume] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState<{ message: string; brewBatchId: string; query?: string } | null>(null);
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
      // Аноним: роут отвечает 401 (getSessionUser, без redirect). Ловим и
      // редирект на /login на всякий случай — на случай регресса в роуте.
      const redirectedToLogin = res.redirected && new URL(res.url).pathname.startsWith("/login");
      if (res.status === 401 || res.status === 403 || redirectedToLogin) {
        setAuthRequired(true);
        return;
      }
      if (!res.ok) throw new Error("LIST_FAILED");
      const data = (await res.json()) as { devices?: PickerDevice[]; devicesEnabled?: boolean };
      const list = data.devices ?? [];
      setDevicesEnabled(data.devicesEnabled !== false);
      setDevices(list);
      // Автовыбор — только среди устройств, способных варить (стрим-ареометры
      // сюда не годятся, даже если формально "online").
      const brewable = list.filter(isBrewCapableDevice);
      setSelectedDeviceId((prev) => prev ?? brewable.find((device) => device.status === "online")?.id ?? null);
    } catch {
      setDevicesError("Не удалось загрузить список устройств.");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  // Объёмы рецепта и оборудования — вместе с устройствами, при открытии. Аноним
  // получает null (экшен молчит) и уходит на экран логина — там объём не нужен.
  const loadVolumeOptions = useCallback(async () => {
    setVolumeOptionsLoading(true);
    try {
      setVolumeOptions(await getBrewVolumeOptionsAction(recipeId));
    } catch {
      // Объём не подтянулся — не блокируем варку: без выбора партия создаётся в
      // объёме рецепта, как и раньше.
      setVolumeOptions(null);
    } finally {
      setVolumeOptionsLoading(false);
    }
  }, [recipeId]);

  // Сброс состояния мастера и ленивая проверка устройств при каждом открытии.
  // Новое открытие = новое «намерение сварить» → новый ключ идемпотентности
  // (осознанная повторная варка того же рецепта создаёт отдельную партию).
  useEffect(() => {
    if (!open) return;
    setScreen("gate");
    setDevices([]);
    setSelectedDeviceId(null);
    setConsumeIngredients(false);
    setPlannedDate("");
    setVolumeOptions(null);
    setVolumeOptionsLoading(true);
    setVolumeChoice(null);
    setCustomVolume("");
    setError(null);
    setRemoteDisabled(null);
    setAuthRequired(false);
    idempotencyKeyRef.current = newIdempotencyKey();
    inFlightRef.current = false;
    void loadDevices();
    void loadVolumeOptions();
  }, [open, loadDevices, loadVolumeOptions]);

  // Экран выбора показываем ВСЕГДА, даже без привязанного прибора: тогда вторая
  // опция — не «на автоматике», а «Подключить BrewForge» (см. mode-экран). Так
  // автоматика видна из основного флоу «Сварить», а не только тем, у кого прибор
  // уже подключён (решение владельца по UX-находкам #9/#10).
  // Ждём и устройства, и объёмы: иначе блок выбора объёма доезжает после отрисовки
  // экрана и кнопка «Создать варку» мигает из активной в неактивную.
  useEffect(() => {
    if (screen !== "gate") return;
    // Аноним не должен ждать параллельный запрос объёмов — как только известно
    // про authRequired, сразу ведём на экран логина.
    if (!devicesLoading && authRequired) {
      setScreen("login");
      return;
    }
    if (devicesLoading || volumeOptionsLoading) return;
    setScreen("mode");
  }, [screen, devicesLoading, volumeOptionsLoading, authRequired]);

  const hasDeviceChoice = Boolean(devicesError) || devices.some(isBrewCapableDevice);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const loginHref = `/login?next=${encodeURIComponent(slug ? `/recipes/${slug}` : "/app/brew-batches")}`;

  // Объём рецепта разошёлся с объёмом оборудования → выбор обязателен, кнопка
  // старта варки ждёт его (в обеих ветках: и «самому», и «на автоматике» —
  // варится одна и та же партия).
  const recipeBatchVolumeL = volumeOptions?.recipeBatchVolumeL ?? null;
  const volumeProfile = volumeOptions?.defaultProfile ?? null;
  const volumeChoiceRequired = hasBrewVolumeMismatch(recipeBatchVolumeL, volumeProfile);
  const volumeReady = isBrewVolumeSelectionReady({
    required: volumeChoiceRequired,
    choice: volumeChoice,
    customValue: customVolume
  });
  const volumeSelection = resolveBrewVolumeSelection({
    choice: volumeChoice,
    profile: volumeProfile,
    customValue: customVolume
  });

  const volumeChoiceBlock = volumeChoiceRequired && recipeBatchVolumeL != null && volumeProfile ? (
    <BrewVolumeChoice
      recipeBatchVolumeL={recipeBatchVolumeL}
      recipeEfficiencyPct={volumeOptions?.recipeEfficiencyPct ?? null}
      profile={volumeProfile}
      choice={volumeChoice}
      onChoiceChange={setVolumeChoice}
      customValue={customVolume}
      onCustomValueChange={setCustomVolume}
      disabled={submitting}
    />
  ) : null;

  const handleConfirmVirtual = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewFromRecipeAction({
        recipeId,
        consumeIngredients,
        idempotencyKey: ensureIdempotencyKey(),
        // Локальный полдень — осознанно: дата остаётся тем же календарным днём в
        // любом часовом поясе (полночь рядом с границей суток могла бы съехать).
        plannedFor: plannedDate ? new Date(`${plannedDate}T12:00`).toISOString() : undefined,
        ...volumeSelection
      });
      if (result.ok) {
        // Фидбэк списания довозим query-параметрами — страница партии покажет
        // тост (см. brew-stock-notice.tsx).
        const query = buildStockQuery(result.consume);
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
        idempotencyKey: ensureIdempotencyKey(),
        consumeIngredients,
        ...volumeSelection
      });
      if (result.ok && result.heatingStarted && result.brewBatchId) {
        const query = buildStockQuery(result.consume);
        window.location.assign(`/app/brew-batches/${result.brewBatchId}${query ? `?${query}` : ""}`);
        return;
      }
      if (result.ok && result.brewBatchId) {
        // REMOTE_DISABLED — не уходим молча, ждём явного клика.
        setRemoteDisabled({
          message: result.message,
          brewBatchId: result.brewBatchId,
          query: buildStockQuery(result.consume)
        });
        return;
      }
      if (result.brewBatchId) {
        // Устройство отказало/недоступно (nack или брошенная ошибка), НО партия
        // уже создана, а склад (если просили) уже списан. Не теряем это за голым
        // текстом ошибки: даём ссылку на партию с тем же фидбэком списания.
        setRemoteDisabled({
          message: result.message,
          brewBatchId: result.brewBatchId,
          query: buildStockQuery(result.consume)
        });
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
          {!devicesEnabled ? null : hasDeviceChoice ? (
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
            // /app/devices сам отправит на логин при необходимости). returnRecipe
            // тащит контекст варки через устройства — «Устройства» покажут баннер
            // «Продолжить варку …» после подключения (Ф7).
            <button
              type="button"
              onClick={() => window.location.assign(`/app/devices?returnRecipe=${encodeURIComponent(recipeId)}`)}
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
          {volumeChoiceBlock}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Дата варки</span>
            <input
              type="date"
              value={plannedDate}
              min={todayLocalDate()}
              onChange={(event) => setPlannedDate(event.target.value)}
              className="h-9 rounded-md border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
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
        <div className="space-y-3 p-5">
          {volumeChoiceBlock}
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
            <RemoteDisabledNotice
              message={remoteDisabled.message}
              brewBatchId={remoteDisabled.brewBatchId}
              query={remoteDisabled.query}
            />
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
          <Button
            variant="primary"
            onClick={() => void handleConfirmVirtual()}
            disabled={submitting || !volumeReady}
          >
            {submitting ? "Создаём…" : "Создать варку"}
          </Button>
        </DialogFooter>
      ) : null}

      {screen === "device-pick" ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => setScreen("mode")} disabled={submitting}>
            Назад
          </Button>
          <Button
            onClick={() => setScreen("device-confirm")}
            disabled={submitting || !selectedDeviceId || !volumeReady}
          >
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
