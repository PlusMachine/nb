// =============================================================================
//  @nb/brewforge-protocol — notify.ts
//  Чистая детекция «фронтов» телеметрии для уведомлений (web-push, Phase 6):
//  из пары кадров (предыдущий срез → новый) выделяет СОБЫТИЯ, требующие внимания
//  оператора вне экрана — новый промпт (засыпь/промывка/…) и вновь поднятые
//  аварии. Без побочных эффектов и I/O — тестируется юнитами, переиспользуется
//  и мостом (диспетчер пушей), и порталом (тесты/предпросмотр).
//
//  Дедуп по конструкции: промпт — по смене promptSeq (идемпотентно, один пуш на
//  один промпт); авария — только по НОВЫМ битам маски (raised edge), а не по
//  каждому кадру с активной аварией.
// =============================================================================
import { decodeFaults, PROMPT_NAMES, type Fault, type Prompt } from "./enums.js";
import type { Telemetry } from "./telemetry.js";

/** Событие-фронт телеметрии, достойное уведомления. */
export type TelemetryEdge =
  | { kind: "prompt"; prompt: Prompt; promptSeq: number }
  | { kind: "fault"; faults: Fault[] };

/** Минимальный срез для детекта фронтов между кадрами (память диспетчера). */
export type EdgeState = { promptSeq: number; prompt: number; faultMask: number };

/** Срез памяти фронтов из полного кадра телеметрии. */
export function edgeStateOf(t: Telemetry): EdgeState {
  return { promptSeq: t.promptSeq, prompt: t.prompt, faultMask: t.faultMask };
}

/** Безопасное имя промпта (незнакомое числовое значение → null, не бросаем). */
function safePromptName(value: number): Prompt | null {
  const name = PROMPT_NAMES[value];
  return name ?? null;
}

/**
 * Выделить события-фронты между предыдущим срезом и новым кадром.
 *
 * ВАЖНО (анти-спам при рестарте): prev === null (первый кадр устройства в памяти
 * диспетчера) НЕ порождает событий — только сидирование. Иначе рестарт моста
 * среди варки дал бы ложный пуш по текущему промпту/аварии.
 */
export function detectTelemetryEdges(prev: EdgeState | null, next: Telemetry): TelemetryEdge[] {
  const edges: TelemetryEdge[] = [];
  if (prev === null) return edges;

  // Новый промпт: активен (prompt != NONE) И сменился promptSeq (идемпотентно —
  // один пуш на один промпт, даже если он висит много кадров).
  if (next.prompt !== 0 && next.promptSeq !== prev.promptSeq) {
    const name = safePromptName(next.prompt);
    if (name && name !== "NONE") {
      edges.push({ kind: "prompt", prompt: name, promptSeq: next.promptSeq });
    }
  }

  // Вновь поднятые аварии: биты, стоящие в next, но не стоявшие в prev.
  const newlyRaised = next.faultMask & ~prev.faultMask;
  if (newlyRaised !== 0) {
    edges.push({ kind: "fault", faults: decodeFaults(newlyRaised) });
  }

  return edges;
}

/**
 * Активен ли РУЧНОЙ нагрев (для cloud-плеча dead-man, Phase 6b): плата в MANUAL и
 * нагрев командуется (мгновенный SSR ON или ненулевая скважность). Именно этот
 * сценарий «включил нагрев вручную и ушёл» закрывает firmware dead-man на плате;
 * облако лишь оповещает/дублирует, если управляющий сеанс потерян. Чистая функция.
 */
export function isManualHeatActive(
  t: Pick<Telemetry, "stageName" | "heatOn" | "heatDutyPct">,
): boolean {
  return t.stageName === "MANUAL" && (t.heatOn || t.heatDutyPct > 0);
}
