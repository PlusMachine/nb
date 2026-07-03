import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { deterministicSeq, deterministicUuid, shouldSkipFile } from "./log-sync";

// =============================================================================
//  Юнит-тесты ЧИСТОЙ логики log-sync.ts (P3, пакет 4-B) — БЕЗ БД (см. соглашение
//  "features/** — колокированные юнит-тесты без БД" в apps/web/vitest.config.ts).
//  Полная оркестрация syncDeviceLog() (провайдер + db.insert/onConflictDoNothing)
//  здесь НЕ тестируется — только детерминированные ключи дедупа и решение
//  «скипнуть файл», которые и есть риск в этой логике (idempotency при повторной
//  синхронизации/растущем файле активной варки).
// =============================================================================

describe("shouldSkipFile", () => {
  it("файла ещё не было в реестре → НЕ скипать", () => {
    expect(shouldSkipFile(undefined, { sizeBytes: 100 })).toBe(false);
  });

  it("тот же размер, что в реестре → скипать (уже полностью догружен)", () => {
    expect(shouldSkipFile({ sizeBytes: 4096 }, { sizeBytes: 4096 })).toBe(true);
  });

  it("размер вырос (файл ещё открыт, варка продолжается) → НЕ скипать, перечитать", () => {
    expect(shouldSkipFile({ sizeBytes: 4096 }, { sizeBytes: 8192 })).toBe(false);
  });

  it("размер уменьшился (файл пересоздан/ротация) → тоже НЕ скипать", () => {
    expect(shouldSkipFile({ sizeBytes: 4096 }, { sizeBytes: 100 })).toBe(false);
  });
});

describe("deterministicSeq / deterministicUuid", () => {
  const digestOf = (s: string) => crypto.createHash("sha256").update(s).digest();

  it("детерминированы: тот же вход → тот же выход (идемпотентность повторной синхронизации)", () => {
    const d1 = digestOf("device-1:brew-1.jsonl:s:0");
    const d2 = digestOf("device-1:brew-1.jsonl:s:0");
    expect(deterministicSeq(d1)).toBe(deterministicSeq(d2));
    expect(deterministicUuid(d1)).toBe(deterministicUuid(d2));
  });

  it("разные входы дают (практически всегда) разные seq/uuid", () => {
    const a = deterministicSeq(digestOf("device-1:brew-1.jsonl:s:0"));
    const b = deterministicSeq(digestOf("device-1:brew-1.jsonl:s:1"));
    expect(a).not.toBe(b);
  });

  it("deterministicSeq ВСЕГДА строго отрицателен и в пределах int32 (никогда не коллидирует с живым положительным seq)", () => {
    for (let i = 0; i < 50; i++) {
      const seq = deterministicSeq(digestOf(`device-x:file-${i}.jsonl:s:${i}`));
      expect(seq).toBeLessThan(0);
      expect(seq).toBeGreaterThanOrEqual(-2147483648);
    }
  });

  it("deterministicUuid отдаёт валидный по форме UUID (8-4-4-4-12 hex)", () => {
    const uuid = deterministicUuid(digestOf("device-1:brew-1.jsonl:e:0"));
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("одинаковый файл, стабильно РАСТУЩИЙ (новые строки только дописаны) — старые индексы дают ТЕ ЖЕ ключи", () => {
    // Симулирует пересинхронизацию файла, который вырос с 3 до 5 сэмплов: индексы
    // 0..2 должны остаться теми же самыми ключами (появляются лишь 3 и 4).
    const beforeGrowth = [0, 1, 2].map((i) => deterministicSeq(digestOf(`device-1:brew-1.jsonl:s:${i}`)));
    const afterGrowth = [0, 1, 2, 3, 4].map((i) => deterministicSeq(digestOf(`device-1:brew-1.jsonl:s:${i}`)));
    expect(afterGrowth.slice(0, 3)).toEqual(beforeGrowth);
  });
});
