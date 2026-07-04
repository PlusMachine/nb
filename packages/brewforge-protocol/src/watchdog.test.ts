import { describe, expect, it } from "vitest";

import { APP_MODE_NUM, STAGE_NUM } from "./enums";
import { checkFermentWatchdog, isFermentFrame, type WatchdogState } from "./watchdog";

// =============================================================================
//  Юнит-тесты checkFermentWatchdog/isFermentFrame — офлайн-watchdog ферментации
//  (§12.2/§14): молчание прибора в режиме ферментации > 30 мин → пуш one-shot.
// =============================================================================

describe("isFermentFrame", () => {
  it("appMode=ferment → true, даже если stage не FERMENT (напр. IDLE — профиль не задан)", () => {
    expect(isFermentFrame({ appMode: APP_MODE_NUM.ferment, stage: STAGE_NUM.IDLE })).toBe(true);
  });

  it("stage=FERMENT → true, даже без appMode (старая прошивка)", () => {
    expect(isFermentFrame({ stage: STAGE_NUM.FERMENT })).toBe(true);
  });

  it("appMode=brew и stage не FERMENT → false", () => {
    expect(isFermentFrame({ appMode: APP_MODE_NUM.brew, stage: STAGE_NUM.MASH_STEP })).toBe(false);
  });

  it("appMode=distill, stage=IDLE → false", () => {
    expect(isFermentFrame({ appMode: APP_MODE_NUM.distill, stage: STAGE_NUM.IDLE })).toBe(false);
  });
});

describe("checkFermentWatchdog", () => {
  it("не ферментация — никогда не пушит, даже при долгом молчании", () => {
    const state: WatchdogState = { isFerment: false, lastSeenAtMs: 0, alerted: false };
    const result = checkFermentWatchdog(state, 10 * 60 * 60_000);
    expect(result.shouldPush).toBe(false);
    expect(result.nextState).toEqual(state);
  });

  it("молчание меньше 30 мин — не пушит", () => {
    const state: WatchdogState = { isFerment: true, lastSeenAtMs: 0, alerted: false };
    const result = checkFermentWatchdog(state, 29 * 60_000 + 59_000);
    expect(result.shouldPush).toBe(false);
  });

  it("молчание ровно 30 мин — пушит, silentMinutes=30", () => {
    const state: WatchdogState = { isFerment: true, lastSeenAtMs: 0, alerted: false };
    const result = checkFermentWatchdog(state, 30 * 60_000);
    expect(result.shouldPush).toBe(true);
    expect(result.silentMinutes).toBe(30);
    expect(result.nextState.alerted).toBe(true);
  });

  it("молчание 45 мин — пушит, silentMinutes=45", () => {
    const state: WatchdogState = { isFerment: true, lastSeenAtMs: 0, alerted: false };
    const result = checkFermentWatchdog(state, 45 * 60_000);
    expect(result.shouldPush).toBe(true);
    expect(result.silentMinutes).toBe(45);
  });

  it("уже оповещали (alerted=true) в этом эпизоде — повторно не пушит", () => {
    const state: WatchdogState = { isFerment: true, lastSeenAtMs: 0, alerted: true };
    const result = checkFermentWatchdog(state, 60 * 60_000);
    expect(result.shouldPush).toBe(false);
    expect(result.nextState).toEqual(state);
  });

  it("прибор вернулся (lastSeenAtMs свежий) после алёрта — снимает one-shot флаг, пуша нет", () => {
    // lastSeenAtMs обновляет вызывающий на каждом свежем кадре; здесь имитируем
    // «пришёл кадр, silentMs снова мал» при alerted=true с прошлого эпизода.
    const state: WatchdogState = { isFerment: true, lastSeenAtMs: 100_000, alerted: true };
    const result = checkFermentWatchdog(state, 100_000 + 60_000); // молчал всего 1 мин
    expect(result.shouldPush).toBe(false);
    expect(result.nextState.alerted).toBe(false);
  });

  it("новый эпизод молчания после возврата снова пушит one-shot", () => {
    let state: WatchdogState = { isFerment: true, lastSeenAtMs: 0, alerted: false };
    // Первый эпизод: молчит >30 мин → пуш.
    let result = checkFermentWatchdog(state, 30 * 60_000);
    expect(result.shouldPush).toBe(true);
    state = result.nextState;

    // Прибор вернулся: свежий кадр обновляет lastSeenAtMs (делает вызывающий).
    state = { ...state, lastSeenAtMs: 40 * 60_000 };
    result = checkFermentWatchdog(state, 40 * 60_000 + 1_000); // почти сразу — не молчит
    expect(result.shouldPush).toBe(false);
    expect(result.nextState.alerted).toBe(false); // one-shot снят
    state = result.nextState;

    // Снова замолчал на 30+ мин → пуш опять.
    result = checkFermentWatchdog(state, 40 * 60_000 + 30 * 60_000);
    expect(result.shouldPush).toBe(true);
    expect(result.silentMinutes).toBe(30);
  });

  it("молчание 29 мин 59 сек — граница снизу, ещё не пушит", () => {
    const state: WatchdogState = { isFerment: true, lastSeenAtMs: 1_000, alerted: false };
    const result = checkFermentWatchdog(state, 1_000 + 30 * 60_000 - 1);
    expect(result.shouldPush).toBe(false);
  });
});
