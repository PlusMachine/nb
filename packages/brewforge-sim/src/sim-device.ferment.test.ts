// =============================================================================
//  @nb/brewforge-sim — sim-device.ferment.test.ts
//  Сценарий "ferment" (H3, docs/brewforge-web-hmi.md §8/§13): гистерезис
//  компрессора/нагрева вокруг уставки текущей ступени, анти-короткий-цикл
//  компрессора (coolLockS), переход ступеней по SKIP_STAGE, appMode/mashStepIndex
//  зеркалирование. Через публичный интерфейс SimDevice (tick — приватный) —
//  advanceToNow(nowMs) с явным, растущим nowMs продвигает симуляцию
//  детерминированно, без ожидания реального времени.
// =============================================================================
import { describe, expect, it } from "vitest";

import { cmdSkipStage } from "@nb/brewforge-protocol";

import { SimDevice } from "./sim-device";

/**
 * Детерминированный «тикер»: advanceToNow продвигает симуляцию НЕ по разнице
 * с реальным Date.now() в момент вызова, а по разнице между переданным nowMs
 * и внутренним lastRealAt (=nowMs предыдущего вызова) — поэтому вызывающий
 * должен сам вести монотонный nowMs с фиксированным шагом. Каждый вызов
 * возвращённой функции продвигает РОВНО на один тик (шаг === tickMs,
 * < MAX_CATCHUP_MS=5с — без риска случайно продвинуть несколько тиков сразу).
 */
function makeTicker(device: SimDevice, tickMs: number): () => void {
  let t = Date.now();
  return () => {
    t += tickMs;
    device.advanceToNow(t);
  };
}

describe("SimDevice — сценарий ferment", () => {
  it("стартует в стадии FERMENT, appMode=ferment, зеркалит ступень/их число из ferment.steps", () => {
    const device = new SimDevice({
      deviceId: "ferment-start",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "ferment",
    });

    const snap = device.snapshot();
    expect(snap.stageName).toBe("FERMENT");
    expect(snap.appMode).toBe(2); // APP_MODE_NUM.ferment
    // дефолт DEFAULT_FERMENT_CONFIG: nSteps=3, первая ступень 18°C/168ч
    expect(snap.mashStepIndex).toBe(0);
    expect(snap.nMashSteps).toBe(3);
    expect(snap.setpointC).toBe(18);
    expect(snap.stageRemainingSec).toBe(168 * 3600);
    // coolOn/coolLockS — присутствуют с самого начала (appMode фиксируется в
    // конструкторе), начальное состояние — компрессор выключен, лок свободен
    expect(snap.coolOn).toBe(false);
    expect(snap.coolLockS).toBe(0);
  });

  it("coolOn/coolLockS отсутствуют вне ferment-сценария (undefined = поля нет)", () => {
    const idle = new SimDevice({
      deviceId: "ferment-not-idle",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "idle",
    });
    const mash = new SimDevice({
      deviceId: "ferment-not-mash",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "mash",
    });

    expect(idle.snapshot().appMode).toBe(0); // APP_MODE_NUM.brew
    expect(idle.snapshot().coolOn).toBeUndefined();
    expect(idle.snapshot().coolLockS).toBeUndefined();
    expect(mash.snapshot().coolOn).toBeUndefined();
    expect(mash.snapshot().coolLockS).toBeUndefined();
  });

  it("гистерезис: выше уставки+hysteresisC → компрессор, ниже уставки−hysteresisC → нагрев, внутри полосы — всё выключено", () => {
    // tickScale=1 держит температуру у AMBIENT_C≈20 почти неизменной за
    // несколько тиков — можем проверять три ветки решения на одном и том же
    // фактическом primaryC, просто переставляя уставку живым PUT /config
    // («правка уставки текущей ступени» — §13, применяется немедленно).
    const device = new SimDevice({
      deviceId: "ferment-hysteresis",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "ferment",
    });
    const tick = makeTicker(device, 1000);

    // 1) уставка далеко ниже факта (≈20) → компрессор
    device.writeConfig({ ferment: { steps: [{ tempC: 10 }] } });
    tick();
    tick();
    let snap = device.snapshot();
    expect(snap.setpointC).toBe(10);
    expect(snap.coolOn).toBe(true);
    expect(snap.heatOn).toBe(false);

    // 2) уставка далеко выше факта → нагрев
    device.writeConfig({ ferment: { steps: [{ tempC: 30 }] } });
    tick();
    tick();
    snap = device.snapshot();
    expect(snap.setpointC).toBe(30);
    expect(snap.heatOn).toBe(true);
    expect(snap.coolOn).toBe(false);
    expect(snap.heatDutyPct).toBe(100);

    // 3) уставка внутри полосы гистерезиса вокруг факта → всё выключено
    device.writeConfig({ ferment: { steps: [{ tempC: 20 }] } }); // hysteresisC=0.5 по умолчанию
    tick();
    tick();
    snap = device.snapshot();
    expect(snap.coolOn).toBe(false);
    expect(snap.heatOn).toBe(false);
    expect(snap.heatDutyPct).toBe(0);
  });

  it("нагрев не включается, если heatEnabled=false, даже сильно ниже уставки", () => {
    const device = new SimDevice({
      deviceId: "ferment-heat-disabled",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "ferment",
    });
    const tick = makeTicker(device, 1000);
    device.writeConfig({ ferment: { heatEnabled: false, steps: [{ tempC: 30 }] } });
    tick();
    const snap = device.snapshot();
    expect(snap.heatOn).toBe(false);
    expect(snap.heatDutyPct).toBe(0);
  });

  it("анти-короткий-цикл: coolLockS выставляется в compMinOffS при выключении компрессора и держит coolOn=false, пока не истечёт", () => {
    const tickMs = 1000;
    const device = new SimDevice({
      deviceId: "ferment-anti-short-cycle",
      fw: "sim-test",
      tickMs,
      tickScale: 1, // почти не двигает primaryC — переключаем спрос живым PUT /config
      scenario: "ferment",
    });
    const tick = makeTicker(device, tickMs);
    // короткий compMinOffS — быстрый детерминированный тест без реального ожидания
    device.writeConfig({ ferment: { compMinOffS: 20, steps: [{ tempC: 10 }] } });

    tick();
    tick();
    expect(device.snapshot().coolOn).toBe(true);
    expect(device.snapshot().coolLockS).toBe(0); // ещё не выключался — лок не набегал

    // спрос на охлаждение снят (уставка внутри полосы факта) → компрессор гаснет
    device.writeConfig({ ferment: { steps: [{ tempC: 20 }] } });
    tick();
    let snap = device.snapshot();
    expect(snap.coolOn).toBe(false);
    expect(snap.coolLockS).toBe(20); // == compMinOffS в момент выключения

    // снова просим охлаждение — анти-короткий-цикл обязан держать coolOn=false,
    // пока лок не истёк, ДАЖЕ ЕСЛИ спрос на охлаждение снова есть
    device.writeConfig({ ferment: { steps: [{ tempC: 10 }] } });
    tick();
    snap = device.snapshot();
    expect(snap.coolOn).toBe(false);
    expect(snap.coolLockS).toBe(19); // dtBrew = tickScale(1) × dtReal(1с) = 1с/тик

    // докручиваем лок до нуля (с запасом сверх 19 нужных тиков — coolLockRemainingSec
    // клампится снизу в 0, лишние тики безопасны) — компрессор обязан снова включиться
    for (let i = 0; i < 25; i++) tick();
    snap = device.snapshot();
    expect(snap.coolLockS).toBe(0);
    expect(snap.coolOn).toBe(true); // спрос всё ещё есть (уставка 10, факт ≈20) — лок снят, включился
  });

  it("SKIP_STAGE проходит ступени ferment.steps по порядку, последняя ступень → DONE", () => {
    const device = new SimDevice({
      deviceId: "ferment-skip",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "ferment",
    });

    let snap = device.snapshot();
    expect(snap.stageName).toBe("FERMENT");
    expect(snap.mashStepIndex).toBe(0);
    expect(snap.setpointC).toBe(18);

    let ack = device.handleCommand(cmdSkipStage());
    expect(ack.ok).toBe(true);
    snap = device.snapshot();
    expect(snap.stageName).toBe("FERMENT");
    expect(snap.mashStepIndex).toBe(1);
    expect(snap.setpointC).toBe(20);
    expect(snap.nMashSteps).toBe(3);

    ack = device.handleCommand(cmdSkipStage());
    expect(ack.ok).toBe(true);
    snap = device.snapshot();
    expect(snap.stageName).toBe("FERMENT");
    expect(snap.mashStepIndex).toBe(2);
    expect(snap.setpointC).toBe(2);
    expect(snap.stageRemainingSec).toBe(0); // hours=0 — держим до ручного перехода

    // последняя активная ступень → DONE; appMode ОСТАЁТСЯ ferment (вне
    // DISTILL_*/FERMENT авторитет режима переходит от stage к appMode, §2/§13)
    ack = device.handleCommand(cmdSkipStage());
    expect(ack.ok).toBe(true);
    snap = device.snapshot();
    expect(snap.stageName).toBe("DONE");
    expect(snap.appMode).toBe(2);
    expect(snap.mashStepIndex).toBe(-1);

    // SKIP_STAGE на DONE — идемпотентный no-op (isBrewing()===false)
    ack = device.handleCommand(cmdSkipStage());
    expect(ack.ok).toBe(true);
    expect(device.snapshot().stageName).toBe("DONE");
  });

  it("writeConfig/readConfig: глубокий патч ferment{} сливается по индексу ступеней, остальные слоты не трогаются", () => {
    const device = new SimDevice({
      deviceId: "ferment-config-merge",
      fw: "sim-test",
      tickMs: 1000,
      tickScale: 1,
      scenario: "idle", // конфиг независим от сценария/стадии
    });

    const before = device.readConfig().ferment!;
    expect(before.hysteresisC).toBe(0.5);
    expect(before.nSteps).toBe(3);
    expect(before.steps).toHaveLength(6);
    expect(before.steps[0]).toEqual({ tempC: 18, hours: 168 });

    const effective = device.writeConfig({
      ferment: { hysteresisC: 1, steps: [{ tempC: 19 }] },
    });

    expect(effective.ferment!.hysteresisC).toBe(1);
    expect(effective.ferment!.steps[0]).toEqual({ tempC: 19, hours: 168 }); // hours сохранён
    expect(effective.ferment!.steps[1]).toEqual({ tempC: 20, hours: 48 }); // не тронут
    expect(effective.ferment!.compMinOffS).toBe(300); // не тронут
    expect(effective.ferment!.nSteps).toBe(3); // не тронут

    // невалидный патч (вне клампов FermentConfigSchema) отклоняется до merge
    expect(() => device.writeConfig({ ferment: { hysteresisC: 10 } })).toThrow();
  });
});
