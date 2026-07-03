// =============================================================================
//  @nb/brewforge-protocol — log.ts
//  Офлайн-журнал варки на устройстве (components/comms/bf_log.c). Не MQTT-топик
//  (см. topics.ts .../log — это ДИСКРЕТНЫЕ события вроде recipe_saved, не сэмплы):
//  это формат REST-эндпоинтов LAN-only:
//    GET {base}/log         → JSON-массив DeviceLogFileMeta (список журналов)
//    GET {base}/log?name=X  → сырой .jsonl (одна строка = один JSON-объект)
//
//  Один журнал = одна варка (SPIFFS, файл открывается на входе в рабочую стадию,
//  закрывается на IDLE/DONE/FAULT/MANUAL). Формат строки — bf_log.c (шапка файла
//  там же). Парсер здесь ЧИСТЫЙ (без сети/БД) — пригоден и для портала (P3,
//  features/devices/log-sync.ts), и для будущего использования мостом (см. D7 в
//  notes/audit/comms-portal.md — довыгрузка по MQTT сейчас не реализована).
// =============================================================================
import { z } from "zod";

/** Один элемент списка GET /log (bf_log_list, bf_log.c). */
export const DeviceLogFileSchema = z.object({
  name: z.string(),        // "brew-<epoch|uptime>[-N].jsonl" (bf_log.c name_safe())
  startTs: z.number().int(), // ключ упорядочивания: SNTP-эпоха старта ИЛИ uptime, если часов не было
  sizeBytes: z.number().int(),
  recipeName: z.string(),  // best-effort из первой строки файла ("" если не распозналось)
});
export type DeviceLogFileMeta = z.infer<typeof DeviceLogFileSchema>;

export const DeviceLogFileListSchema = z.array(DeviceLogFileSchema);

// -----------------------------------------------------------------------------
//  Строки .jsonl. Свободные (passthrough) — бортовой формат не «замороженный
//  контракт» §2 (это внутренняя диагностика устройства, не команда/телеметрия),
//  так что лишние/будущие поля не должны ронять парсинг уже сохранённых логов.
// -----------------------------------------------------------------------------

/** Сэмпл (append_sample, раз в 10 с, пока файл открыт). */
export const LogSampleSchema = z
  .object({
    t: z.literal("s"),
    ts: z.number().int(),   // стенные часы (UTC, сек); 0 = SNTP не был синхронизирован
    up: z.number().int(),   // аптайм устройства, сек (монотонен В ПРЕДЕЛАХ файла)
    st: z.number().int(),   // bf_stage_t
    sp: z.number(),         // setpoint, °C
    tp: z.number(),         // текущая (первичная) температура, °C
    hd: z.number().int(),   // heat_duty_pct
    ho: z.boolean(),        // heat_on
    pu: z.boolean(),        // pump_on
    fm: z.number().int(),   // fault_mask
  })
  .passthrough();
export type LogSample = z.infer<typeof LogSampleSchema>;

/** Событие (append_ev_*): общая часть + ev-специфичные поля (passthrough). */
export const LogEventSchema = z
  .object({
    t: z.literal("e"),
    ts: z.number().int(),
    up: z.number().int(),
    ev: z.enum(["stage", "prompt", "fault", "start", "end"]),
  })
  .passthrough();
export type LogEvent = z.infer<typeof LogEventSchema>;

export type ParsedLogLine =
  | { kind: "sample"; line: number; data: LogSample }
  | { kind: "event"; line: number; data: LogEvent };

export type ParseLogJsonlResult = {
  samples: LogSample[];
  events: LogEvent[];
  /** Строки, которые не удалось разобрать/распознать (битые/усечённые/неизвестный t) — считаем, не роняем весь файл (SPIFFS-файл мог оборваться посреди записи на потере питания). */
  malformedLines: number;
  totalLines: number;
};

/**
 * Разобрать одну строку .jsonl. null — строка пустая/битый JSON/не подошла ни под
 * одну из известных схем (толерантно: SPIFFS-файл может обрываться посреди
 * последней строки при потере питания — это НЕ повод отбрасывать весь файл).
 */
export function parseLogLine(raw: string, lineIndex: number): ParsedLogLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const sample = LogSampleSchema.safeParse(json);
  if (sample.success) return { kind: "sample", line: lineIndex, data: sample.data };

  const event = LogEventSchema.safeParse(json);
  if (event.success) return { kind: "event", line: lineIndex, data: event.data };

  return null;
}

/** Разобрать содержимое целого .jsonl-файла (см. GET {base}/log?name=). */
export function parseLogJsonl(content: string): ParseLogJsonlResult {
  const lines = content.split("\n");
  const samples: LogSample[] = [];
  const events: LogEvent[] = [];
  let malformedLines = 0;
  let totalLines = 0;

  lines.forEach((raw, i) => {
    if (!raw.trim()) return; // финальный '\n' даёт пустой «хвост» — не строка
    totalLines++;
    const parsed = parseLogLine(raw, i);
    if (!parsed) {
      malformedLines++;
      return;
    }
    if (parsed.kind === "sample") samples.push(parsed.data);
    else events.push(parsed.data);
  });

  return { samples, events, malformedLines, totalLines };
}
