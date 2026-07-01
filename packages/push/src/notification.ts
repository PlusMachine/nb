// =============================================================================
//  @nb/push — notification.ts
//  Чистое построение payload web-push из событий телеметрии (@nb/brewforge-protocol
//  detectTelemetryEdges). Без web-push/БД/I-O — тестируется юнитами. Текст
//  уведомлений — самостоятельная терсовая копия (короче панели аварий; состояние
//  варки чувствительно — не раздуваем тело пуша).
// =============================================================================
import type { Fault, Prompt, TelemetryEdge } from "@nb/brewforge-protocol";

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

/** Контекст устройства для заголовка/диплинка уведомления. */
export type NotificationContext = { deviceId: string; deviceName: string };

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
  const labels = edge.faults.map((f) => FAULT_TEXT[f] ?? f).join(", ");
  return {
    title: `⚠ ${ctx.deviceName}`,
    body: `Авария: ${labels}`,
    tag: `${ctx.deviceId}:fault`,
    url,
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
