// =============================================================================
//  features/devices/pairing-error-text.ts
//  Единый словарь текстов для кодов ошибок привязки устройства (см.
//  features/devices/errors.ts::mapDeviceError → KNOWN_STATUS — источник
//  кодов). Раньше был продублирован дважды с расхождением в формулировках:
//  ERROR_TEXT в devices-manager.tsx (форма привязки L1 + демо-пивоварня) и
//  translatePairError в device-picker-list.tsx (выбор устройства в
//  BrewPickerDialog). При расхождении оставлен более специфичный/действенный
//  вариант текста.
//
//  Домен НЕ путать с device-config-form.tsx/onboard-recipes-panel — там
//  другие коды (настройка профиля устройства, синхронизация рецептов), это
//  отдельный словарь, дедуп с ним не нужен.
// =============================================================================

export const PAIRING_ERROR_TEXT: Record<string, string> = {
  INVALID_REQUEST: "Проверьте введённые данные.",
  INVALID_CLAIM_CODE: "Код привязки неверен или истёк. Сгенерируйте новый на устройстве.",
  CLAIM_CODE_REQUIRED: "Введите claim-код устройства — привязка по одному hardware ID отключена.",
  CLAIM_CODE_OR_HARDWARE_ID_REQUIRED: "Укажите код привязки.",
  HARDWARE_ID_REQUIRED: "Для прямой привязки укажите hardware ID устройства.",
  CLAIM_CODE_OWNED_BY_OTHER_USER: "Этот код выпущен для другого аккаунта.",
  CLAIM_CODE_ALREADY_CONSUMED: "Код привязки уже использован. Сгенерируйте новый на устройстве.",
  DEVICE_OWNED_BY_OTHER_USER: "Устройство уже привязано к другому аккаунту.",
  NOT_FOUND: "Устройство не найдено.",
  DEMO_NOT_AVAILABLE: "Демо-пивоварня недоступна в этом окружении.",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже."
};

const DEFAULT_PAIRING_ERROR_TEXT = "Не удалось привязать устройство. Проверьте код и адрес.";

/** Переводит код ошибки привязки устройства (из errors.ts) в текст для UI. */
export function devicePairingErrorText(code?: string | null): string {
  return (code && PAIRING_ERROR_TEXT[code]) || DEFAULT_PAIRING_ERROR_TEXT;
}

// =============================================================================
//  Тексты ИТОГА автодоставки токена устройству (P4, пакет 4-B) — ОТДЕЛЬНЫЙ
//  домен от PAIRING_ERROR_TEXT выше: claimDevice САМ по себе уже успешен (код/
//  устройство/токен созданы), это лишь статус попытки POST {localUrl}/pair.
//  Соответствует PairingDeliveryStatus.reason из features/devices/contracts.ts.
// =============================================================================
export const PAIRING_DELIVERY_REASON_TEXT: Record<string, string> = {
  NO_LOCAL_URL: "Токен выдан. Локальный адрес устройства не указан — введите токен на устройстве вручную.",
  ALREADY_PAIRED:
    "Устройство уже сопряжено — сбросьте привязку на самом устройстве: Настройки → Удалённо.",
  UNREACHABLE:
    "Токен выдан, но устройство сейчас недоступно по сети. Введите его на устройстве вручную, когда оно будет в сети.",
  REJECTED: "Устройство отклонило токен. Введите его на устройстве вручную."
};

const DEFAULT_PAIRING_DELIVERY_TEXT = "Не удалось автоматически доставить токен устройству. Введите его вручную.";

/** Переводит `pairing.reason` (ClaimDeviceResult.pairing) в текст для UI. */
export function pairingDeliveryReasonText(reason?: string | null): string {
  return (reason && PAIRING_DELIVERY_REASON_TEXT[reason]) || DEFAULT_PAIRING_DELIVERY_TEXT;
}
