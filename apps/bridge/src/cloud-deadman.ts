// =============================================================================
//  apps/bridge — cloud-deadman.ts
//  Cloud-плечо dead-man (Phase 6b): ВТОРИЧНАЯ сеть безопасности удалённого нагрева.
//  Первичная защита — firmware dead-man на плате (нагрев гаснет при потере
//  heartbeat командного источника, Phase 3). Здесь мост, видя телеметрию, ловит
//  «ручной нагрев включён, а управляющий сеанс потерян» (control-lease истёк) и:
//    - ВСЕГДА оповещает владельца пушем «проверьте пивоварню» (default);
//    - опц. (BREWFORGE_CLOUD_DEADMAN_STOP) шлёт EXIT_MANUAL — автономная актуация
//      из облака рискованна (ложное срабатывание при транзиентном обрыве связи),
//      поэтому off по умолчанию; firmware dead-man остаётся первичным.
//
//  Триггер именно «lease === expired» (портал управлял и пропал), а НЕ «none»:
//  локальное ручное использование платы (аренды не было) не порождает ложных пушей.
//  Дедуп — one-shot на эпизод (Set по deviceId), сброс при снятии условия.
// =============================================================================
import {
  cmdExitManual,
  isManualHeatActive,
  type Command,
  type Telemetry,
} from "@nb/brewforge-protocol";
import { cloudDeadmanNotification, sendPushToUser } from "@nb/push";

import { getLeaseStateForDevice, type DeviceRow } from "./db.js";

// deviceId, по которым уже оповестили в текущем эпизоде «брошенного нагрева».
const alerted = new Set<string>();

/** Включена ли автономная актуация (EXIT_MANUAL) — по умолчанию OFF (только пуш). */
function autonomousStopEnabled(): boolean {
  const v = process.env.BREWFORGE_CLOUD_DEADMAN_STOP;
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

/**
 * Проверить кадр телеметрии на «брошенный ручной нагрев» и среагировать (пуш +
 * опц. EXIT_MANUAL). Best-effort: ошибки не роняют мост.
 */
export async function runCloudDeadman(
  device: DeviceRow,
  telemetry: Telemetry,
  publish: (hardwareId: string, command: Command) => Promise<void>,
): Promise<void> {
  if (!isManualHeatActive(telemetry)) {
    alerted.delete(device.id); // условие снято — эпизод закрыт, дальше можно оповещать заново
    return;
  }
  if (alerted.has(device.id)) return; // уже оповестили — не дёргаем БД и не спамим

  const lease = await getLeaseStateForDevice(device.id);
  // "valid" — оператор на связи (heartbeat идёт); "none" — локальное использование
  // без портала. Реагируем только на "expired": портал управлял и пропал.
  if (lease !== "expired") return;

  alerted.add(device.id);

  // 1) Оповещение владельца (первичная защита — firmware dead-man на плате).
  try {
    await sendPushToUser(
      device.userId,
      cloudDeadmanNotification({ deviceId: device.id, deviceName: device.name }),
    );
    console.log(`[cloud-deadman] ${device.hardwareId}: брошенный ручной нагрев → push`);
  } catch (err) {
    console.error("[cloud-deadman] сбой пуша:", err instanceof Error ? err.message : String(err));
  }

  // 2) Автономный выход из ручного режима — только под явным opt-in.
  if (autonomousStopEnabled()) {
    try {
      await publish(device.hardwareId, cmdExitManual());
      console.log(`[cloud-deadman] ${device.hardwareId}: EXIT_MANUAL (opt-in)`);
    } catch (err) {
      console.error("[cloud-deadman] сбой EXIT_MANUAL:", err instanceof Error ? err.message : String(err));
    }
  }
}
