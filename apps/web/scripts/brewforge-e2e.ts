/**
 * Dev-only E2E: доказать, что ПОРТАЛ (через реальный код провайдера) управляет
 * физической платой BrewForge по LAN. Читает телеметрию и шлёт БЕЗОПАСНУЮ
 * негреющую команду SELECT_RECIPE (встроенный слот) — наблюдаемо меняет состояние
 * устройства, не требует ни датчика, ни арминга Remote, ни нагрева.
 *
 * Запуск: pnpm -F @nb/web exec tsx scripts/brewforge-e2e.ts
 */
import { brewDevices, db, eq, pool, users } from "@nb/db";
import { cmdSelectRecipe } from "@nb/brewforge-protocol";

import { brewforgeProvider } from "../features/brew-controller/brewforge-provider";

const EMAIL = process.env.DEV_AUTH_EMAIL || "qa.admin@localhost";
const HW = "bf-e9f8";

function pick(t: any) {
  if (!t) return t;
  return {
    online: t.online,
    stage: t.stageName ?? t.stage,
    activeRecipe: t.activeRecipe,
    recipeName: t.recipeName,
    heatingPermitted: t.heatingPermitted,
    faults: t.faults,
  };
}

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  const [device] = await db.select().from(brewDevices).where(eq(brewDevices.hardwareId, HW)).limit(1);
  if (!user || !device) throw new Error(`нет user(${EMAIL}) или device(${HW})`);
  const userId = user.id;
  const deviceId = device.id;
  console.log(`device ${HW} id=${deviceId} → ${device.localUrl} (owner ${EMAIL})\n`);

  console.log("1) readTelemetry ДО (через провайдер портала):");
  const before = await brewforgeProvider.readTelemetry({ userId, deviceId });
  console.log("   ", JSON.stringify(pick(before)));

  const curSlot = (before as any)?.activeRecipe ?? -1;
  const targetSlot = curSlot === 2 ? 4 : 2;   // выбрать слот, отличный от текущего → наблюдаемо
  console.log(`\n2) sendCommand SELECT_RECIPE(slot ${targetSlot}) — негреющая, через провайдер:`);
  const ack = await brewforgeProvider.sendCommand({
    userId,
    deviceId,
    brewBatchId: undefined as any,
    command: cmdSelectRecipe(targetSlot),
  });
  console.log("    ack:", JSON.stringify(ack));

  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n3) readTelemetry ПОСЛЕ:");
  const after = await brewforgeProvider.readTelemetry({ userId, deviceId });
  console.log("   ", JSON.stringify(pick(after)));

  const changed = (before as any)?.activeRecipe !== (after as any)?.activeRecipe ||
    (before as any)?.recipeName !== (after as any)?.recipeName;
  console.log(
    `\n==> Канал портал→плата: команда ${ (ack as any)?.ok ? "ПРИНЯТА (ok)" : "ack=" + JSON.stringify(ack) }; ` +
      `состояние устройства ${changed ? "ИЗМЕНИЛОСЬ ✅" : "не изменилось"}.`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.stack || e.message : e);
  process.exit(1);
});
