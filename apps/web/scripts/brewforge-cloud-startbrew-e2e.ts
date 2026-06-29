// =============================================================================
//  scripts/brewforge-cloud-startbrew-e2e.ts
//  Облачный «запуск варки откуда угодно» (нужны брокер + sim + мост + засеянное
//  устройство bf-sim01):
//    1. cloudTransport.putRecipe публикует рецепт → прошивка/sim сохраняет в слот →
//       событие recipe_saved (мост → brew_log_events) → дочитываем slot;
//    2. provider.sendCommand(START_BREW(slot)) запускает варку по облаку;
//    3. телеметрия (из brew_telemetry) показывает activeRecipe==slot и стадию != IDLE.
//
//  Запуск:
//    MQTT_URL=mqtt://localhost:1883 npx tsx apps/web/scripts/brewforge-cloud-startbrew-e2e.ts
// =============================================================================
import { brewDevices, db, eq } from "@nb/db";
import { DeviceRecipeSchema, PROTOCOL_SCHEMA_VERSION, cmdStartBrew, cmdStop } from "@nb/brewforge-protocol";

import { getProvider } from "../features/brew-controller";
import { cloudTransport } from "../features/brew-controller/cloud-transport";

const HW = process.env.E2E_DEVICE ?? "bf-sim01";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const [device] = await db.select().from(brewDevices).where(eq(brewDevices.hardwareId, HW)).limit(1);
  if (!device) throw new Error(`устройство ${HW} не засеяно`);

  const provider = getProvider("brewforge");
  if (!provider?.sendCommand) throw new Error("провайдер недоступен");

  const transport = cloudTransport({ id: device.id, hardwareId: device.hardwareId });

  const recipe = DeviceRecipeSchema.parse({
    schema: PROTOCOL_SCHEMA_VERSION,
    name: "Cloud E2E Ale",
    units: "C",
    mash: {
      doughInTempC: null,
      pidDuringDoughIn: true,
      steps: [{ name: "Sacc", tempC: 66, timeMin: 60 }],
      mashOut: { tempC: 76, timeMin: 10 },
    },
    boil: { boilTimeMin: 60, boilTempC: null, hops: [{ name: "Saaz", amountG: 30, atMinBeforeEnd: 60 }] },
    hopStand: [],
    whirlpool: "off",
    cooling: { targetC: 20 },
  });

  // 1) Облачный push рецепта → слот.
  const { slot } = await transport.putRecipe(recipe);
  console.log(`[startbrew] putRecipe → slot=${slot}`);

  // 2) START_BREW(slot) через провайдер (облачный транспорт).
  const ack = await provider.sendCommand({ userId: device.userId, deviceId: device.id, command: cmdStartBrew(slot) });
  console.log(`[startbrew] START_BREW(${slot}) → ack ok=${ack.ok} reason=${ack.reason}`);

  // 3) Телеметрия показывает запуск.
  await sleep(3000);
  const tele = await transport.getTelemetry();
  console.log(`[startbrew] телеметрия: стадия=${tele?.stageName} activeRecipe=${tele?.activeRecipe} recipe="${tele?.recipeName}"`);

  const ok = slot >= 0 && ack.ok && Boolean(tele) && tele?.activeRecipe === slot && tele?.stageName !== "IDLE";
  console.log(
    ok
      ? "[startbrew] PASS ✅ — рецепт запушен в слот, START_BREW принят, варка идёт по облаку"
      : "[startbrew] FAIL ❌",
  );

  // Прибираемся: останавливаем варку, чтобы не оставлять устройство активным.
  await provider.sendCommand({ userId: device.userId, deviceId: device.id, command: cmdStop() });
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("[startbrew] ОШИБКА:", error);
  process.exit(1);
});
