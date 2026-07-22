"use client";

// =============================================================================
//  components/recipes/brew-picker-dialog.tsx
//  Единый вход «Сварить»: если у пользователя есть хотя бы одно устройство,
//  способное варить (или список устройств не загрузился — ошибка тоже повод
//  дать выбор), сначала экран выбора режима — «Вручную» (виртуальный гид
//  варочного дня) или «На BrewForge» (запуск на контроллере). Если выбирать
//  не из чего — экран режима пропускается, диалог сразу открывает форму
//  «Вручную» (экран virtual), а внизу формы — компактное промо подключения
//  BrewForge (ссылка, не псевдо-вариант варки).
//
//  Виртуальная и device-ветки формы используют общий двухсостояние футера
//  (стейт startStep: "start"/"schedule") — по умолчанию основная кнопка
//  стартует без даты в один клик; «Запланировать» раскрывает поле даты и
//  меняет primary-кнопку на подтверждение с датой.
//
//  Виртуальная ветка создаёт партию в статусе 'planned' и ведёт в акт
//  «Подготовка» — сам варочный день запускается уже там.
//
//  Device-ветка при немедленном запуске («Подтвердить и запустить нагрев»)
//  получает статус 'brewing' по факту ack устройства. При планировании
//  (state "schedule" → «Запланировать») device-ветка НЕ создаёт партию с
//  deviceId и не трогает устройство — переиспользует виртуальный путь
//  (startBrewFromRecipeAction с plannedFor): партия с deviceId рендерит на
//  своей странице device-дашборд вместо акта «Подготовка», а «нагрев на
//  будущую дату» устройство не поддерживает. Запуск на устройстве из уже
//  существующей партии — отдельный путь (startBrewOnDeviceAction), из этого
//  пикера не вызывается.
//
//  Списания склада здесь нет — единственная точка списания теперь страница
//  партии (диалог с превью exact/замены/нехватка).
//
//  Один диалог для публичной витрины, дашборда и редактора рецептов —
//  принимает только recipeId, без привязки к зоне (маршрут после успеха
//  всегда — /app/brew-batches/:id).
//
//  Ошибки — внутри диалога (role="alert"), диалог себя не закрывает;
//  REMOTE_DISABLED — честный баннер с явным переходом по клику.
// =============================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Cpu, Loader2, ShieldAlert, Timer } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";

import {
  getBrewVolumeOptionsAction,
  startBrewFromRecipeAction,
  type BrewVolumeOptions
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
// Состояние футера виртуальной и device-веток (общее): "start" — по
// умолчанию, поле даты скрыто, основная кнопка стартует без plannedFor;
// "schedule" — раскрыто поле даты, primary-кнопка меняется на
// «Запланировать» с датой.
type StartStep = "start" | "schedule";

// Локальная (не UTC) дата «сегодня» в формате yyyy-MM-dd — минимум для input[type=date].
const todayLocalDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  // ветка автоматики (и весь экран режима) скрывается целиком.
  const [devicesEnabled, setDevicesEnabled] = useState(true);
  // Аноним: /api/devices отвечает 401 → не гоняем его через выбор режима и
  // создание партии до самого низа, а сразу предлагаем вход (UX-находка #11).
  const [authRequired, setAuthRequired] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [startStep, setStartStep] = useState<StartStep>("start");
  // Дата варки — yyyy-MM-dd, задаётся только в состоянии "schedule".
  const [plannedDate, setPlannedDate] = useState("");
  // Объём варки: объёмы рецепта и оборудования подтягиваются при открытии; выбор
  // обязателен, только если они разошлись (см. brew-volume-choice.tsx).
  const [volumeOptions, setVolumeOptions] = useState<BrewVolumeOptions | null>(null);
  const [volumeOptionsLoading, setVolumeOptionsLoading] = useState(true);
  const [volumeChoice, setVolumeChoice] = useState<BrewVolumeChoiceKind | null>(null);
  const [customVolume, setCustomVolume] = useState("");
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
    setStartStep("start");
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

  // Экран выбора режима имеет смысл, только если реально есть из чего выбирать:
  // хотя бы одно привязанное устройство, способное варить, либо ошибка загрузки
  // списка (тогда пользователь видит причину и может повторить, а не тихо
  // проваливается в форму «вручную»). Иначе — сразу виртуальная ветка.
  const hasBrewCapableDevice = devices.some(isBrewCapableDevice);
  const hasDeviceChoice = Boolean(devicesError) || hasBrewCapableDevice;
  const modeScreenAvailable = devicesEnabled && hasDeviceChoice;
  // Промо BrewForge на форме «вручную» — только когда выбирать было не из чего
  // (экран режима пропущен), но раздел устройств вообще включён.
  const showBrewforgePromo = devicesEnabled && !modeScreenAvailable;

  // Ждём и устройства, и объёмы: иначе блок выбора объёма доезжает после отрисовки
  // экрана и кнопка старта мигает из активной в неактивную.
  useEffect(() => {
    if (screen !== "gate") return;
    // Аноним не должен ждать параллельный запрос объёмов — как только известно
    // про authRequired, сразу ведём на экран логина.
    if (!devicesLoading && authRequired) {
      setScreen("login");
      return;
    }
    if (devicesLoading || volumeOptionsLoading) return;
    setScreen(modeScreenAvailable ? "mode" : "virtual");
  }, [screen, devicesLoading, volumeOptionsLoading, authRequired, modeScreenAvailable]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const loginHref = `/login?next=${encodeURIComponent(slug ? `/recipes/${slug}` : "/app/brew-batches")}`;

  // Объём рецепта разошёлся с объёмом оборудования → выбор обязателен, кнопка
  // старта варки ждёт его (в обеих ветках: и «вручную», и «на BrewForge» —
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

  // plannedForDate — явный параметр, а не чтение общего стейта: «Начать сейчас»/
  // «Начать варку» вызывают без аргумента (дата игнорируется, даже если поле уже
  // было раскрыто), «Запланировать» передаёт выбранную дату явно.
  const handleConfirmVirtual = async (plannedForDate?: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewFromRecipeAction({
        recipeId,
        idempotencyKey: ensureIdempotencyKey(),
        // Локальный полдень — осознанно: дата остаётся тем же календарным днём в
        // любом часовом поясе (полночь рядом с границей суток могла бы съехать).
        plannedFor: plannedForDate ? new Date(`${plannedForDate}T12:00`).toISOString() : undefined,
        ...volumeSelection
      });
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
        ...volumeSelection
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
      if (result.brewBatchId) {
        // Устройство отказало/недоступно (nack или брошенная ошибка), НО партия
        // уже создана. Не теряем это за голым текстом ошибки: даём ссылку на партию.
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
              {screen === "device-confirm"
                ? startStep === "schedule"
                  ? "Выберите дату варки."
                  : "Подтвердите запуск нагрева."
                : null}
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
            onClick={() => {
              // Сброс — иначе визит на device-confirm/schedule (другая ветка)
              // мог бы протечь сюда состоянием или датой.
              setStartStep("start");
              setPlannedDate("");
              setScreen("virtual");
            }}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-border hover:bg-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
              <Timer className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">Вручную</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Гид варочного дня на экране: паузы, таймеры, шаги.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setScreen("device-pick")}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-border hover:bg-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
              <Cpu className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">На BrewForge</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Рецепт уйдёт на контроллер BrewForge, который запустит нагрев.
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {screen === "virtual" ? (
        <div className="space-y-3 p-5">
          {volumeChoiceBlock}
          {startStep === "schedule" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Дата варки</span>
              <input
                type="date"
                value={plannedDate}
                min={todayLocalDate()}
                autoFocus
                onChange={(event) => setPlannedDate(event.target.value)}
                className="h-9 rounded-md border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-3 text-sm text-destructive-subtle-foreground" role="alert">
              {error}
            </div>
          ) : null}
          {showBrewforgePromo ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <Cpu className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                Варить можно не только вручную — BrewForge сам греет и держит паузы затирания.
              </span>
              <a
                href={`/app/devices?returnRecipe=${encodeURIComponent(recipeId)}`}
                className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
              >
                Подключить
              </a>
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
            <RemoteDisabledNotice message={remoteDisabled.message} brewBatchId={remoteDisabled.brewBatchId} />
          ) : (
            <>
              {startStep === "schedule" ? (
                // В "schedule" primary-действие («Запланировать») уходит в
                // виртуальный путь и устройства вообще не касается — баннер про
                // немедленный нагрев здесь не по адресу, вместо него поле даты
                // (предупреждение уже было показано на экране "start" до перехода).
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Дата варки</span>
                  <input
                    type="date"
                    value={plannedDate}
                    min={todayLocalDate()}
                    autoFocus
                    onChange={(event) => setPlannedDate(event.target.value)}
                    className="h-9 rounded-md border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              ) : (
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
              )}
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
          {/* Экран режима показывается, только если реально есть выбор — тогда и
              «Назад» есть куда вести; иначе форма открылась сразу и назад некуда. */}
          {modeScreenAvailable ? (
            <Button variant="outline" onClick={() => setScreen("mode")} disabled={submitting}>
              Назад
            </Button>
          ) : null}
          {startStep === "schedule" ? (
            <>
              <Button
                variant="outline"
                onClick={() => void handleConfirmVirtual()}
                disabled={submitting || !volumeReady}
              >
                {submitting ? "Начинаем…" : "Начать сейчас"}
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmVirtual(plannedDate)}
                disabled={submitting || !volumeReady || !plannedDate}
              >
                {submitting ? "Планируем…" : "Запланировать"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStartStep("schedule")} disabled={submitting}>
                Запланировать
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmVirtual()}
                disabled={submitting || !volumeReady}
              >
                {submitting ? "Начинаем…" : "Начать варку"}
              </Button>
            </>
          )}
        </DialogFooter>
      ) : null}

      {screen === "device-pick" ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => setScreen("mode")} disabled={submitting}>
            Назад
          </Button>
          <Button
            onClick={() => {
              // Сброс — иначе повторный заход на device-confirm (Назад → Далее)
              // унаследует "schedule"/дату от предыдущего визита.
              setStartStep("start");
              setPlannedDate("");
              setScreen("device-confirm");
            }}
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
              {/* "Назад" ведёт к выбору устройства независимо от startStep —
                  как и в виртуальной ветке, где "Назад" не привязан к шагу. */}
              <Button variant="outline" onClick={() => setScreen("device-pick")} disabled={submitting}>
                Назад
              </Button>
              {startStep === "schedule" ? (
                <>
                  <Button variant="outline" onClick={() => void handleConfirmDevice()} disabled={submitting}>
                    {submitting ? "Запускаем…" : "Начать сейчас"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void handleConfirmVirtual(plannedDate)}
                    disabled={submitting || !plannedDate}
                  >
                    {submitting ? "Планируем…" : "Запланировать"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setStartStep("schedule")} disabled={submitting}>
                    Запланировать
                  </Button>
                  <Button variant="primary" onClick={() => void handleConfirmDevice()} disabled={submitting}>
                    {submitting ? "Запускаем…" : "Подтвердить и запустить нагрев"}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      ) : null}
    </Dialog>
  );
}
