// =============================================================================
//  @nb/brewforge-sim — sim-device.distill.test.ts
//  Сценарий "distill" (H2, docs/brewforge-web-hmi.md §7/§13): преднагрев полной
//  мощностью с автопереходом в HEADS по порогу tHeadsC, дальше фиксированная
//  скважность по фракции (headsPct/heartsPct/tailsPct), клапан отбора (valveOn)
//  во время HEADS/HEARTS/TAILS, «пора сменить ёмкость» (actionReady) и авто-стоп
//  TAILS→DONE по tEndC (защита от сухого хода).
//
//  КРИТИЧНО (сверено с bf_process.c:1014-1050 этой сессией, см. отчёт
//  оркестратору): HEADS→HEARTS и HEARTS→TAILS НЕ автопереходят по температуре —
//  порог там только взводит actionReady («смените тару»), а саму стадию
//  двигает ИСКЛЮЧИТЕЛЬНО SKIP_STAGE (оператор). Автопороги — только
//  PREHEAT→HEADS (tHeadsC) и TAILS→DONE (tEndC, авто-стоп). Тесты ниже
//  специально проверяют, что стадия НЕ меняется сама при пересечении
//  tHeartsC/tTailsC — это не пропуск, а осознанный паритет с прошивкой.
//
//  Через публичный интерфейс SimDevice (tick — приватный) — advanceToNow(nowMs)
//  с явным, растущим nowMs продвигает симуляцию детерминированно, без ожидания
//  реального времени (паритет с sim-device.ferment.test.ts).
// =============================================================================
import { describe, expect, it } from "vitest";

import { cmdSkipStage } from "@nb/brewforge-protocol";

import { SimDevice } from "./sim-device";

/** Тикер с монотонным nowMs — см. комментарий в sim-device.ferment.test.ts. */
function makeTicker(device: SimDevice, tickMs: number): () => void {
  let t = Date.now();
  return () => {
    t += tickMs;
    device.advanceToNow(t);
  };
}

describe("SimDevice — сценарий distill", () => {
  it("стартует в стадии DISTILL_PREHEAT, appMode=distill, valveOn=false, actionReady=false", () => {
    const device = new SimDevice({
      deviceId: "distill-start",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "distill",
    });

    const snap = device.snapshot();
    expect(snap.stageName).toBe("DISTILL_PREHEAT");
    expect(snap.appMode).toBe(1); // APP_MODE_NUM.distill
    // valveOn/actionReady — присутствуют с самого начала (appMode фиксируется в
    // конструкторе), начальное состояние — клапан закрыт, действие не требуется
    expect(snap.valveOn).toBe(false);
    expect(snap.actionReady).toBe(false);
  });

  it("valveOn/actionReady отсутствуют вне distill-сценария (undefined = поля нет)", () => {
    const idle = new SimDevice({
      deviceId: "distill-not-idle",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "idle",
    });
    const ferment = new SimDevice({
      deviceId: "distill-not-ferment",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "ferment",
    });

    expect(idle.snapshot().appMode).toBe(0); // APP_MODE_NUM.brew
    expect(idle.snapshot().valveOn).toBeUndefined();
    expect(idle.snapshot().actionReady).toBeUndefined();
    expect(ferment.snapshot().valveOn).toBeUndefined();
    expect(ferment.snapshot().actionReady).toBeUndefined();
  });

  it(
    "путь по фракциям: PREHEAT→HEADS автопереходит по порогу tHeadsC; HEADS/HEARTS " +
      "держат стадию при пороге и взводят actionReady, двигает только SKIP_STAGE; " +
      "TAILS не взводит actionReady и автопереходит в DONE по tEndC",
    () => {
      const device = new SimDevice({
        deviceId: "distill-journey",
        fw: "sim-test",
        tickMs: 1000,
        tickScale: 200,
        scenario: "distill",
      });
      const tick = makeTicker(device, 1000);
      // низкие пороги + высокая мощность на всех фракциях — быстрый детерминированный
      // прогон (паритет с приёмом ferment-тестов: живой PUT /config для скорости).
      device.writeConfig({
        distill: {
          tHeadsC: 30, // минимум DistillConfigSchema (клампы паритетны прошивке)
          tHeartsC: 32,
          tTailsC: 34,
          tEndC: 36,
          headsPct: 100,
          heartsPct: 100,
          tailsPct: 100,
        },
      });

      // --- PREHEAT: полная мощность, клапан закрыт ---
      let snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_PREHEAT");
      expect(snap.valveOn).toBe(false);

      // PREHEAT → HEADS — ТОЛЬКО по порогу tHeadsC, без SKIP_STAGE
      let guard = 0;
      while (device.snapshot().stageName === "DISTILL_PREHEAT" && guard < 30) {
        tick();
        guard++;
      }
      expect(guard).toBeLessThan(30); // не зависли
      snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_HEADS");
      expect(snap.valveOn).toBe(true); // отбор пошёл
      expect(snap.heatDutyPct).toBe(100); // headsPct из конфига

      // HEADS: ждём порог tHeartsC → actionReady взводится, СТАДИЯ НЕ МЕНЯЕТСЯ САМА
      guard = 0;
      while (!device.snapshot().actionReady && guard < 30) {
        tick();
        guard++;
      }
      expect(guard).toBeLessThan(30);
      snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_HEADS"); // порог НЕ двигает стадию
      expect(snap.actionReady).toBe(true);

      // флаг держится (не гаснет сам по таймеру/следующим тикам)
      tick();
      tick();
      snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_HEADS");
      expect(snap.actionReady).toBe(true);

      // оператор явно переходит — SKIP_STAGE двигает стадию И гасит actionReady
      let ack = device.handleCommand(cmdSkipStage());
      expect(ack.ok).toBe(true);
      snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_HEARTS");
      expect(snap.actionReady).toBe(false); // сброшен переходом стадии (паритет с go())
      expect(snap.valveOn).toBe(true); // отбор продолжается
      expect(snap.heatDutyPct).toBe(100); // heartsPct из конфига

      // HEARTS: тот же паттерн — порог tTailsC взводит actionReady, стадию не двигает
      guard = 0;
      while (!device.snapshot().actionReady && guard < 30) {
        tick();
        guard++;
      }
      expect(guard).toBeLessThan(30);
      snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_HEARTS");
      expect(snap.actionReady).toBe(true);

      ack = device.handleCommand(cmdSkipStage());
      expect(ack.ok).toBe(true);
      snap = device.snapshot();
      expect(snap.stageName).toBe("DISTILL_TAILS");
      expect(snap.actionReady).toBe(false);
      expect(snap.valveOn).toBe(true);
      expect(snap.heatDutyPct).toBe(100); // tailsPct из конфига

      // TAILS: НЕ взводит actionReady ни разу, авто-стоп по tEndC (защита от сухого хода)
      guard = 0;
      while (device.snapshot().stageName === "DISTILL_TAILS" && guard < 30) {
        expect(device.snapshot().actionReady).toBe(false);
        tick();
        guard++;
      }
      expect(guard).toBeLessThan(30);
      snap = device.snapshot();
      expect(snap.stageName).toBe("DONE");
      expect(snap.valveOn).toBe(false); // клапан закрылся
      expect(snap.actionReady).toBe(false);
      // авторитет режима на DONE переходит appMode (§2/§13) — остаётся distill
      expect(snap.appMode).toBe(1);

      // SKIP_STAGE на DONE — идемпотентный no-op (isBrewing()===false)
      ack = device.handleCommand(cmdSkipStage());
      expect(ack.ok).toBe(true);
      expect(device.snapshot().stageName).toBe("DONE");
    },
  );

  it("writeConfig/readConfig: патч distill{} сливается по полям, непереданные поля не трогаются", () => {
    const device = new SimDevice({
      deviceId: "distill-config-merge",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "idle", // конфиг независим от сценария/стадии
    });

    const before = device.readConfig().distill!;
    expect(before.headsPct).toBe(40);
    expect(before.heartsPct).toBe(65);
    expect(before.tHeadsC).toBe(78);
    expect(before.tEndC).toBe(98);
    expect(before.refluxWindowS).toBe(30);

    const effective = device.writeConfig({
      distill: { tHeadsC: 62, headsPct: 45 },
    });

    expect(effective.distill!.tHeadsC).toBe(62);
    expect(effective.distill!.headsPct).toBe(45);
    expect(effective.distill!.heartsPct).toBe(65); // не тронут
    expect(effective.distill!.tEndC).toBe(98); // не тронут
    expect(effective.distill!.refluxWindowS).toBe(30); // не тронут

    // невалидный патч (вне клампов DistillConfigSchema) отклоняется до merge
    expect(() => device.writeConfig({ distill: { tHeadsC: 200 } })).toThrow();
    expect(() => device.writeConfig({ distill: { headsPct: 150 } })).toThrow();
  });
});
