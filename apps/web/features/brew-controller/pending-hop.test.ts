import { describe, expect, it } from "vitest";
import type { Telemetry } from "@nb/brewforge-protocol";
import { pendingHop } from "./pending-hop";

const frame = { stageName: "BOILING", nextHopName: "Citra", nextHopG: 40,
  pendingHop: { index: 0, name: "Magnum", amountG: 20, count: 1 } } as Telemetry;

describe("текущее внесение хмеля", () => {
  it("показывает ожидающий Magnum, а не будущий Citra", () => {
    expect(pendingHop(frame)).toEqual({ index: 0, name: "Magnum", amountG: 20, count: 1 });
  });
  it("последний хмель остаётся доступен без nextHopName", () => {
    expect(pendingHop({ ...frame, nextHopName: "" })?.index).toBe(0);
  });
  it("после подтверждения карточка исчезает", () => {
    expect(pendingHop({ ...frame, pendingHop: { index: -1, name: "", amountG: 0, count: 0 } })).toBeNull();
  });
  it("старые прошивки не получают ошибочного подтверждения будущего хмеля", () => {
    expect(pendingHop({ ...frame, pendingHop: undefined })).toBeNull();
  });
  it("вне стадии внесений и без кадра ничего не предлагает", () => {
    expect(pendingHop({ ...frame, stageName: "COOLING" })).toBeNull();
    expect(pendingHop(null)).toBeNull();
  });
});
