// =============================================================================
//  scripts/brewforge-cloud-db-e2e.ts
//  Полная цепочка облачного пути ЧЕРЕЗ ПРОВАЙДЕР + БД (нужны брокер + sim + мост +
//  postgres + засеянное устройство bf-sim01):
//    1. cloudTransport.getTelemetry читает свежую brew_telemetry (её пишет мост);
//    2. provider.sendCommand выбирает облако (нет localUrl + MQTT_URL) → публикует
//       команду, получает ack, финализирует строку device_commands;
//    3. строка аудита имеет id == cmd.id и статус acked ⇒ корреляция ack моста
//       (UPDATE ... WHERE id == ack.ackOf) тоже работает.
//
//  Запуск:
//    MQTT_URL=mqtt://localhost:1883 npx tsx apps/web/scripts/brewforge-cloud-db-e2e.ts
// =============================================================================
import { brewDevices, db, deviceCommands, eq } from "@nb/db";
import { cmdPause } from "@nb/brewforge-protocol";

import { getProvider } from "../features/brew-controller";
import { cloudTransport } from "../features/brew-controller/cloud-transport";

const HW = process.env.E2E_DEVICE ?? "bf-sim01";

async function main(): Promise<void> {
  const [device] = await db.select().from(brewDevices).where(eq(brewDevices.hardwareId, HW)).limit(1);
  if (!device) throw new Error(`устройство ${HW} не засеяно`);
  console.log(`[db-e2e] device id=${device.id} hw=${device.hardwareId} localUrl=${device.localUrl ?? "—"}`);

  // 1) Телеметрия из brew_telemetry (пишет мост из MQTT).
  const tele = await cloudTransport({ id: device.id, hardwareId: device.hardwareId }).getTelemetry();
  console.log(`[db-e2e] getTelemetry → ${tele ? `${tele.stageName} t=${tele.primary.c}°C seq=${tele.seq}` : "null"}`);

  // 2) Команда через провайдер (он сам выберет облачный транспорт).
  const provider = getProvider("brewforge");
  if (!provider?.sendCommand) throw new Error("провайдер недоступен");
  const cmd = cmdPause();
  const ack = await provider.sendCommand({ userId: device.userId, deviceId: device.id, command: cmd });
  console.log(`[db-e2e] provider.sendCommand(PAUSE id=${cmd.id}) → ack ok=${ack.ok} reason=${ack.reason}`);

  // 3) Аудит финализирован, id строки == cmd.id.
  await new Promise((r) => setTimeout(r, 800));
  const [row] = await db
    .select({ id: deviceCommands.id, status: deviceCommands.status, reason: deviceCommands.reason })
    .from(deviceCommands)
    .where(eq(deviceCommands.id, cmd.id))
    .limit(1);
  console.log(`[db-e2e] device_commands[${cmd.id}] → status=${row?.status} reason=${row?.reason}`);

  const ok = Boolean(tele) && ack.ok && row?.id === cmd.id && row?.status === "acked";
  console.log(
    ok
      ? "[db-e2e] PASS ✅ — телеметрия из brew_telemetry, провайдер выбрал облако, команда подтверждена, аудит acked (id==cmd.id ⇒ корреляция моста работает)"
      : "[db-e2e] FAIL ❌",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("[db-e2e] ОШИБКА:", error);
  process.exit(1);
});
