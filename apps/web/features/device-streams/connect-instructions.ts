import { streamWizardHardwareKinds, type StreamHardwareKind } from "./contracts";

// =============================================================================
//  features/device-streams/connect-instructions.ts
//  Тексты сворачиваемой инструкции на экране подключения (§5 F1) — куда именно в
//  конфигураторе устройства вставить URL. Чистые строковые константы, без логики —
//  вынесены отдельно от stream-device-console.tsx для тестируемости (полнота по
//  видам) и чтобы не раздувать клиентский компонент копирайтом.
// =============================================================================

const INSTRUCTIONS: Record<StreamHardwareKind, string> = {
  ispindel:
    "В веб-конфигураторе iSpindel (открывается при первом включении/через Wi-Fi-точку устройства) вставьте ссылку выше в поле Server Address, URL или Token — смотря что показывает ваша прошивка.",
  gravitymon: "В настройках GravityMon откройте раздел HTTP Push и вставьте ссылку выше как URL назначения.",
  tilt:
    "В приложении Tilt (или TiltPi/TiltBridge) откройте Настройки → Use Custom Cloud URL и вставьте ссылку выше. Телефон с приложением Tilt должен быть рядом с ферментером (связь по Bluetooth) — для надёжности лучше использовать TiltPi или TiltBridge.",
  floaty: "В приложении Floaty включите отправку на пользовательский сервер и вставьте ссылку выше как адрес назначения.",
  brewpiless: "В настройках BrewPiLess откройте раздел Remote logging и вставьте ссылку выше.",
  "rapt-pill": "RAPT Pill подключается отдельным флоу (RAPT Cloud) — здесь эта инструкция не используется.",
  "rapt-chamber": "RAPT-камера подключается отдельным флоу (RAPT Cloud) — здесь эта инструкция не используется.",
  "rapt-brewzilla": "BrewZilla подключается отдельным флоу (RAPT Cloud) — здесь эта инструкция не используется.",
  other: "Устройство должно уметь отправлять HTTP push в формате iSpindel или Brewfather — впишите ссылку выше как адрес назначения (обычно поле Server/URL)."
};

const FALLBACK_INSTRUCTION = INSTRUCTIONS.other;

/** Текст инструкции по виду устройства; неизвестный/отсутствующий вид → общий текст (other). */
export function instructionForKind(kind: string | null): string {
  if (kind && kind in INSTRUCTIONS) {
    return INSTRUCTIONS[kind as StreamHardwareKind];
  }
  return FALLBACK_INSTRUCTION;
}

/** Инвариант полноты (тест): каждый вид визарда + tilt имеют свою (не общую) инструкцию. */
export const kindsWithDedicatedInstructions: readonly StreamHardwareKind[] = streamWizardHardwareKinds;
