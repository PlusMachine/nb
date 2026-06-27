import { ZodError } from "zod";

// =============================================================================
//  features/devices — маппинг доменных ошибок сервиса в HTTP-ответ роутов.
//  Цель (item 8): не возвращать клиенту сырое (error as Error).message с 400 на
//  всё подряд. Известные доменные коды → конкретные статусы + СТАБИЛЬНЫЙ код
//  (UI его переводит в текст); неожиданные ошибки → 500 + общий код, а детали —
//  только в серверный лог. Транспортные/SSRF-строки (EGRESS_*, HTTP-тела) сюда
//  не относятся к «известным» и потому наружу не эхоятся.
// =============================================================================

/** Известные доменные коды → HTTP-статус. Сам код безопасен для отдачи клиенту. */
const KNOWN_STATUS: Record<string, number> = {
  INVALID_CLAIM_CODE: 400,
  CLAIM_CODE_REQUIRED: 400,
  CLAIM_CODE_OR_HARDWARE_ID_REQUIRED: 400,
  HARDWARE_ID_REQUIRED: 400,
  CLAIM_CODE_OWNED_BY_OTHER_USER: 403,
  CLAIM_CODE_ALREADY_CONSUMED: 409,
  DEVICE_OWNED_BY_OTHER_USER: 409,
  NOT_FOUND: 404
};

/**
 * Преобразует ошибку сервиса устройств в { status, code }.
 *  - ZodError → 400 INVALID_REQUEST (детали валидации наружу не эхоим);
 *  - известный доменный код → его статус + сам код (UI переведёт в сообщение);
 *  - всё прочее → 500 INTERNAL_ERROR, детали — в серверный лог.
 */
export function mapDeviceError(error: unknown): { status: number; code: string } {
  if (error instanceof ZodError) {
    return { status: 400, code: "INVALID_REQUEST" };
  }
  const code = error instanceof Error ? error.message : "";
  const status = KNOWN_STATUS[code];
  if (status) {
    return { status, code };
  }
  // Неожиданная ошибка: детали (вкл. возможные транспортные/SSRF-строки) — только
  // в серверный лог; наружу — общий код без подробностей.
  console.error("[devices] unexpected error:", error);
  return { status: 500, code: "INTERNAL_ERROR" };
}
