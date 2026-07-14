// =============================================================================
//  features/brew-controller/messages.ts
//  Человекочитаемые сообщения для запуска варки на устройстве — общие для
//  features/brew-controller/actions.ts (запуск из уже существующей партии) и
//  features/brew-controller/brew-recipe-flow.ts (композиция рецепт→партия→
//  запуск). Вынесены в отдельный модуль, чтобы не дублировать тексты между
//  двумя серверными экшенами с одинаковой картой ошибок/nack-причин.
// =============================================================================
import type { AckReason } from "@nb/brewforge-protocol";

/** Приводит коды ошибок старта варки к человекочитаемым сообщениям для UI.
 *  НЕ эхоит транспортные/SSRF-детали (EGRESS_*, HTTP-тела) — только общий текст. */
export function describeStartBrewError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "FORBIDDEN":
      return "Недостаточно прав для запуска варки на этом устройстве.";
    case "NOT_FOUND":
      return "Рецепт не найден или недоступен для варки.";
    case "BREW_BATCH_NOT_FOUND":
      return "Партия варки не найдена.";
    case "DEVICE_NOT_FOUND":
      return "Устройство не найдено или не привязано к вам.";
    case "DEVICE_NOT_CAPABLE":
      return "Это устройство только передаёт показания и не поддерживает запуск варки. Выберите пивоварню BrewForge.";
    case "DEVICE_NO_LOCAL_URL":
      return "У устройства не задан локальный адрес (localUrl). Допривяжите устройство по адресу в сети.";
    case "PROVIDER_UNAVAILABLE":
      return "Контроллер недоступен. Повторите попытку позже.";
    default:
      // В т.ч. EGRESS_* (SSRF-гард) и сетевые ошибки — наружу общий текст,
      // без адреса/детали (детали — в серверный лог транспорта).
      return "Не удалось запустить варку. Проверьте, что устройство в сети и доступно.";
  }
}

/** Честное сообщение для nack-причин START_BREW (нагрев НЕ запущен). */
export function describeStartBrewNack(reason: AckReason | null): string {
  switch (reason) {
    case "REJECTED_INTERLOCK":
      return "Устройство отклонило запуск: активен интерлок безопасности (датчик/перегрев/поплавок/E-stop). Устраните причину и повторите.";
    case "RATE_LIMITED":
      return "Слишком частые команды устройству. Повторите чуть позже.";
    case "QUEUE_FULL":
      return "Очередь команд устройства переполнена. Повторите позже.";
    case "VALIDATION":
      return "Устройство отклонило рецепт/команду (валидация). Проверьте рецепт и повторите.";
    default:
      return "Устройство не запустило варку. Проверьте состояние контроллера.";
  }
}
