import { describe, expect, it } from "vitest";

import { devicePairingErrorText } from "@/features/devices/pairing-error-text";

describe("devicePairingErrorText", () => {
  it("translates known pairing error codes", () => {
    expect(devicePairingErrorText("INVALID_CLAIM_CODE")).toBe(
      "Код привязки неверен или истёк. Сгенерируйте новый на устройстве."
    );
    expect(devicePairingErrorText("DEVICE_OWNED_BY_OTHER_USER")).toBe(
      "Устройство уже привязано к другому аккаунту."
    );
    expect(devicePairingErrorText("CLAIM_CODE_OWNED_BY_OTHER_USER")).toBe(
      "Этот код выпущен для другого аккаунта."
    );
  });

  it("falls back to a generic pairing message for unknown codes", () => {
    expect(devicePairingErrorText("SOME_UNKNOWN_CODE")).toBe(
      "Не удалось привязать устройство. Проверьте код и адрес."
    );
  });

  it("falls back for undefined/null code", () => {
    expect(devicePairingErrorText(undefined)).toBe(
      "Не удалось привязать устройство. Проверьте код и адрес."
    );
    expect(devicePairingErrorText(null)).toBe(
      "Не удалось привязать устройство. Проверьте код и адрес."
    );
  });
});
