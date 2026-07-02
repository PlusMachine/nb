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
