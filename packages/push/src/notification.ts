// =============================================================================
//  @nb/push — notification.ts
//  Чистое построение payload web-push из событий телеметрии (@nb/brewforge-protocol
//  detectTelemetryEdges). Без web-push/БД/I-O — тестируется юнитами. Текст
//  уведомлений — самостоятельная терсовая копия (короче панели аварий; состояние
//  варки чувствительно — не раздуваем тело пуша).
// =============================================================================
import { STAGE_NUM, type Fault, type Prompt, type TelemetryEdge } from "@nb/brewforge-protocol";

/** Payload, который service worker покажет как Notification (JSON в теле пуша). */
export type PushPayload = {
  title: string;
  body: string;
  /** Тег схлопывания: повторные события одного рода/устройства заменяют друг друга. */
  tag: string;
  /** Диплинк, открываемый по клику по уведомлению. */
  url: string;
};

// Короткий текст промпта (действие оператора). NONE не приходит в фронтах.
const PROMPT_TEXT: Record<Prompt, string> = {
  NONE: "",
  SPARGE_WATER: "Готова вода для промывки?",
  CONTINUE_DOUGH: "Продолжить засыпку солода?",
  ADD_MALT: "Засыпьте солод",
  IODINE: "Йодная проба",
  REMOVE_MALT: "Удалите солод",
  RESUME_BREW: "Возобновить варку после перезагрузки?",
};

// Короткая метка аварии для тела пуша (детали/что делать — в AlarmsPanel портала).
const FAULT_TEXT: Record<Fault, string> = {
  SENSOR: "отказ датчика",
  OVERHEAT_REL: "перегрев (относительный)",
  OVERHEAT_ABS: "перегрев (абсолютный)",
  DT_DT: "скачок температуры",
  FLOAT_DRY: "сухой ход",
  ESTOP: "аварийный останов",
  WATCHDOG: "сторожевой таймер",
  STAGE_TO: "таймаут стадии",
  NO_FLOW: "нет рециркуляции",
};

// Дистилляция (H2, §12.2): локальный словарь фракций для тела пуша — детектор
// (@nb/brewforge-protocol) намеренно отдаёт только числовые bf_stage_t
// (fromStage/toStage), не подписи (словарь всех 22 стадий — stage-labels.ts в
// apps/web, сюда его тащить незачем: нужны только 4 термина перегона).
// «Разогрев» ничего не отбирает — у него своя, безобъектная формулировка.
const DISTILL_FRACTION_DONE_TEXT: Partial<Record<number, string>> = {
  [STAGE_NUM.DISTILL_PREHEAT]: "Разогрев завершён",
  [STAGE_NUM.DISTILL_HEADS]: "Головы отобраны",
  [STAGE_NUM.DISTILL_HEARTS]: "Тело отобрано",
  [STAGE_NUM.DISTILL_TAILS]: "Хвосты отобраны",
};

const DISTILL_FRACTION_START_TEXT: Partial<Record<number, string>> = {
  [STAGE_NUM.DISTILL_HEADS]: "начат отбор голов",
  [STAGE_NUM.DISTILL_HEARTS]: "начат отбор тела",
  [STAGE_NUM.DISTILL_TAILS]: "начат отбор хвостов",
};

/** Тело пуша «фракция завершена» по паре bf_stage_t (fromStage/toStage). */
function distillFractionText(fromStage: number, toStage: number): string {
  const done = DISTILL_FRACTION_DONE_TEXT[fromStage] ?? "Фракция завершена";
  const start = toStage === STAGE_NUM.DONE ? "перегон завершён" : DISTILL_FRACTION_START_TEXT[toStage];
  return `${done} — ${start ?? "начат отбор следующей фракции"}`;
}

/** Контекст устройства для заголовка/диплинка уведомления. */
export type NotificationContext = { deviceId: string; deviceName: string };

// °C с одним знаком после запятой, единообразно для тела пуша ("18.0°", "20.3°").
function fmtC(value: number): string {
  return `${value.toFixed(1)}°`;
}

/** Построить payload web-push из события-фронта телеметрии. Чистая функция. */
export function notificationFor(edge: TelemetryEdge, ctx: NotificationContext): PushPayload {
  const url = `/app/devices/${ctx.deviceId}`;
  if (edge.kind === "prompt") {
    return {
      title: ctx.deviceName,
      body: PROMPT_TEXT[edge.prompt] || "Требуется действие оператора",
      tag: `${ctx.deviceId}:prompt`,
      url,
    };
  }
  if (edge.kind === "fault") {
    const labels = edge.faults.map((f) => FAULT_TEXT[f] ?? f).join(", ");
    return {
      title: `⚠ ${ctx.deviceName}`,
      body: `Авария: ${labels}`,
      tag: `${ctx.deviceId}:fault`,
      url,
    };
  }
  if (edge.kind === "ferment-deviation") {
    return {
      title: ctx.deviceName,
      body: `Отклонение от уставки: ${fmtC(edge.primaryC)} при уставке ${fmtC(edge.setpointC)}`,
      tag: `${ctx.deviceId}:ferment-deviation`,
      url,
    };
  }
  if (edge.kind === "ferment-step-done") {
    // Имена ступеней в приборе не хранятся (§13) — текст без названия шага,
    // только новая уставка (то, что реально известно устройству).
    return {
      title: ctx.deviceName,
      body: `Ступень брожения завершена — держит ${fmtC(edge.setpointC)}`,
      tag: `${ctx.deviceId}:ferment-step`,
      url,
    };
  }
  if (edge.kind === "distill-action-ready") {
    return {
      title: ctx.deviceName,
      body: "Смените приёмную ёмкость",
      tag: `${ctx.deviceId}:distill-action-ready`,
      url,
    };
  }
  // "distill-fraction-done": одна фракция отобрана, начат отбор следующей
  // (или, для TAILS→DONE, перегон завершён целиком).
  return {
    title: ctx.deviceName,
    body: distillFractionText(edge.fromStage, edge.toStage),
    tag: `${ctx.deviceId}:distill-fraction`,
    url,
  };
}

/**
 * Уведомление офлайн-watchdog ферментации (§12.2/§14): прибор в режиме
 * ферментации молчит дольше порога — на недельном процессе это ЧП, не «клиент
 * закрыл вкладку». minutes — из checkFermentWatchdog (@nb/brewforge-protocol).
 */
export function fermentWatchdogNotification(ctx: NotificationContext, minutes: number): PushPayload {
  return {
    title: `⚠ ${ctx.deviceName}`,
    body: `Прибор молчит ${minutes} мин`,
    tag: `${ctx.deviceId}:ferment-watchdog`,
    url: `/app/devices/${ctx.deviceId}`,
  };
}

/**
 * Уведомление о доступном обновлении прошивки (F3, docs/brewforge-firmware-
 * releases.md §6): мост шлёт при первом обнаружении пары (device, newer-release);
 * дедуп — колонка brew_devices.update_notified_fw. Диплинк — настройки
 * устройства (там блок «Прошивка» с changelog и кнопкой «Обновить»).
 */
export function firmwareUpdateNotification(ctx: NotificationContext, version: string): PushPayload {
  return {
    title: ctx.deviceName,
    body: `Доступно обновление BrewForge ${version}`,
    tag: `${ctx.deviceId}:fw-update`,
    url: `/app/devices/${ctx.deviceId}/settings`,
  };
}

/**
 * Уведомление cloud-плеча dead-man (Phase 6b): ручной нагрев включён, а
 * управляющий сеанс потерян (аренда истекла). Реальную защиту даёт firmware
 * dead-man на плате — облако лишь оповещает владельца проверить пивоварню.
 */
export function cloudDeadmanNotification(ctx: NotificationContext): PushPayload {
  return {
    title: `⚠ ${ctx.deviceName}`,
    body: "Ручной нагрев включён, а управление потеряно — проверьте пивоварню.",
    tag: `${ctx.deviceId}:deadman`,
    url: `/app/devices/${ctx.deviceId}`,
  };
}

/**
 * Уведомление «Поплавок молчит» (M5-B, docs/specs/third-party-fermentation-devices.md
 * §5 F6): нет пакетов дольше порога (max(2 ч, 6× заявленный интервал устройства) —
 * apps/bridge/src/stream-silence.ts silenceThresholdMs). One-shot до восстановления
 * связи — дедуп in-memory на стороне моста (тот же паттерн, что fermentWatchdogNotification).
 * Диплинк — страница партии (не устройства): «молчит» осмысленно именно в разрезе
 * конкретного брожения.
 */
export function streamSilenceNotification(
  ctx: NotificationContext,
  silentHours: number,
  batchName: string,
  brewBatchId: string,
): PushPayload {
  return {
    title: `Ареометр молчит: ${ctx.deviceName}`,
    body: `Нет данных ${silentHours} ч. Партия «${batchName}»`,
    tag: `${ctx.deviceId}:stream-silence`,
    url: `/app/brew-batches/${brewBatchId}`,
  };
}

/**
 * Уведомление автозавершения сеанса по молчанию (M5-B, §5 F2): молчание дольше
 * 7 суток — сеанс завершается автоматически (end_reason='auto_silence'), устройство
 * освобождается для привязки к новой партии. Уважает alerts_muted сеанса (шлётся,
 * только если алерты не заглушены) — само автозавершение от mute не зависит.
 */
export function streamSilenceAutoEndedNotification(
  ctx: NotificationContext,
  batchName: string,
  brewBatchId: string,
): PushPayload {
  return {
    title: ctx.deviceName,
    body: `Сеанс завершён автоматически: нет данных 7 дней. Партия «${batchName}»`,
    tag: `${ctx.deviceId}:stream-silence-ended`,
    url: `/app/brew-batches/${brewBatchId}`,
  };
}
