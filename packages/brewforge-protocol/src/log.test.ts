import { describe, expect, it } from "vitest";

import { DeviceLogFileListSchema, parseLogJsonl, parseLogLine } from "./log";

// =============================================================================
//  Юнит-тесты парсера офлайн-журнала (bf_log.c .jsonl) — пакет 4-B, P3.
//  Формат строк — из шапки-комментария bf_log.c; фикстуры ниже воспроизводят
//  реальный вывод append_sample/append_ev_* побайтово (те же ключи/порядок).
// =============================================================================

const SAMPLE_LINE =
  '{"t":"s","ts":1719500000,"up":1234,"st":5,"sp":67.0,"tp":66.8,"hd":80,"ho":true,"pu":true,"fm":0}';

const EV_START_LINE =
  '{"t":"e","ts":1719499990,"up":1220,"ev":"start","st":3,"stName":"DOUGH_IN","recipe":"IPA","recipeIdx":6}';

const EV_STAGE_LINE = '{"t":"e","ts":1719500010,"up":1240,"ev":"stage","st":5,"stName":"MASH_STEP"}';

const EV_PROMPT_LINE = '{"t":"e","ts":1719500020,"up":1250,"ev":"prompt","pr":3,"seq":2}';

const EV_FAULT_LINE = '{"t":"e","ts":1719500030,"up":1260,"ev":"fault","mask":1,"on":true}';

const EV_END_LINE = '{"t":"e","ts":1719503600,"up":4830,"ev":"end","st":13,"stName":"DONE"}';

describe("parseLogLine", () => {
  it("разбирает сэмпл", () => {
    const parsed = parseLogLine(SAMPLE_LINE, 0);
    expect(parsed?.kind).toBe("sample");
    if (parsed?.kind === "sample") {
      expect(parsed.data.st).toBe(5);
      expect(parsed.data.tp).toBe(66.8);
      expect(parsed.data.ho).toBe(true);
    }
  });

  it("разбирает событие start/stage/prompt/fault/end", () => {
    for (const line of [EV_START_LINE, EV_STAGE_LINE, EV_PROMPT_LINE, EV_FAULT_LINE, EV_END_LINE]) {
      const parsed = parseLogLine(line, 0);
      expect(parsed?.kind).toBe("event");
    }
  });

  it("пустая строка → null (не ошибка)", () => {
    expect(parseLogLine("", 0)).toBeNull();
    expect(parseLogLine("   \n", 0)).toBeNull();
  });

  it("битый JSON (обрыв записи на потере питания) → null, не бросает исключение", () => {
    expect(parseLogLine('{"t":"s","ts":171950', 0)).toBeNull();
  });

  it("валидный JSON, но незнакомая форма (не сэмпл и не событие) → null", () => {
    expect(parseLogLine('{"foo":"bar"}', 0)).toBeNull();
    expect(parseLogLine('{"t":"e","ts":1,"up":1,"ev":"unknown-kind"}', 0)).toBeNull();
  });
});

describe("parseLogJsonl", () => {
  it("разбирает полный файл (start + сэмплы + события + end), сохраняя порядок", () => {
    const content = [EV_START_LINE, SAMPLE_LINE, EV_STAGE_LINE, EV_PROMPT_LINE, EV_FAULT_LINE, EV_END_LINE].join(
      "\n",
    );
    const result = parseLogJsonl(content);
    expect(result.samples).toHaveLength(1);
    expect(result.events).toHaveLength(5); // start, stage, prompt, fault, end
    expect(result.malformedLines).toBe(0);
    expect(result.totalLines).toBe(6);
  });

  it("толерантен к обрыву последней строки (потеря питания посреди fwrite)", () => {
    const content = `${EV_START_LINE}\n${SAMPLE_LINE}\n{"t":"s","ts":171950`; // усечённый хвост
    const result = parseLogJsonl(content);
    expect(result.samples).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result.malformedLines).toBe(1);
    expect(result.totalLines).toBe(3);
  });

  it("игнорирует финальный перевод строки (не считает его пустой «строкой»)", () => {
    const content = `${SAMPLE_LINE}\n`;
    const result = parseLogJsonl(content);
    expect(result.totalLines).toBe(1);
    expect(result.samples).toHaveLength(1);
  });

  it("пустой файл → пустой результат", () => {
    const result = parseLogJsonl("");
    expect(result.samples).toHaveLength(0);
    expect(result.events).toHaveLength(0);
    expect(result.totalLines).toBe(0);
  });
});

describe("DeviceLogFileListSchema (GET /log)", () => {
  it("разбирает точный ответ bf_log_list", () => {
    const raw = [
      { name: "brew-1719499990.jsonl", startTs: 1719499990, sizeBytes: 4096, recipeName: "IPA" },
      { name: "brew-1719400000-1.jsonl", startTs: 1719400000, sizeBytes: 128, recipeName: "" },
    ];
    const parsed = DeviceLogFileListSchema.parse(raw);
    expect(parsed).toHaveLength(2);
  });

  it("пустой список (SPIFFS не смонтирован / нет журналов) — валиден", () => {
    expect(DeviceLogFileListSchema.parse([])).toEqual([]);
  });
});
