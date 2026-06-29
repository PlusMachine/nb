// =============================================================================
//  scripts/brewforge-cloud-e2e.ts
//  Реальная проверка облачного пути BrewForge БЕЗ БД и браузера: брокер + sim.
//  Прогоняет два контура через те же модули, что и портал:
//    1. Телеметрия: подписываемся на brewforge/<id>/telemetry, считаем кадры.
//    2. Команды: publishCommandAwaitAck (реальный mqtt-client портала) → ack
//       устройства, коррелированный по cmd.id.
//
//  Запуск (нужен брокер + sim):
//    docker compose up -d mosquitto
//    npm run dev -w @nb/device-sim -- --mqtt mqtt://localhost:1883 \
//       --device-id bf-sim01 --scenario mash --tick-scale 30
//    MQTT_URL=mqtt://localhost:1883 npx tsx apps/web/scripts/brewforge-cloud-e2e.ts
// =============================================================================
import mqtt from "mqtt";
import { TelemetrySchema, cmdPause, cmdResume, cmdSkipStage, type Telemetry } from "@nb/brewforge-protocol";

import { publishCommandAwaitAck } from "../features/brew-controller/mqtt-client";

const URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const DEVICE = process.env.E2E_DEVICE ?? "bf-sim01";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Holder для последнего кадра: запись из колбэка mqtt не сбивает сужение типов.
const obsState: { frames: number; last: Telemetry | null } = { frames: 0, last: null };

async function main(): Promise<void> {
  console.log(`[e2e] брокер=${URL} устройство=${DEVICE}`);

  // --- 1) Телеметрия ---------------------------------------------------------
  const obs = mqtt.connect(URL, { clientId: `e2e-obs-${Math.random().toString(16).slice(2, 8)}` });
  await new Promise<void>((resolve, reject) => {
    obs.on("connect", () => obs.subscribe(`brewforge/${DEVICE}/telemetry`, (e) => (e ? reject(e) : resolve())));
    obs.on("error", reject);
  });
  obs.on("message", (_t, raw) => {
    const p = TelemetrySchema.safeParse(JSON.parse(raw.toString("utf8")));
    if (p.success) {
      obsState.frames += 1;
      obsState.last = p.data;
    }
  });
  await sleep(4000);
  console.log(`[e2e] телеметрия: ${obsState.frames} кадров, стадия=${obsState.last?.stageName ?? "—"}, t=${obsState.last?.primary.c ?? "—"}°C`);

  // --- 2) Командный round-trip через mqtt-client портала ---------------------
  const pause = await publishCommandAwaitAck(DEVICE, cmdPause());
  await sleep(1500);
  console.log(`[e2e] PAUSE ack=${pause?.ok}/${pause?.reason}; стадия→${obsState.last?.stageName}`);
  const pausedSeen = obsState.last?.stageName === "PAUSED";

  const resume = await publishCommandAwaitAck(DEVICE, cmdResume());
  await sleep(1500);
  console.log(`[e2e] RESUME ack=${resume?.ok}/${resume?.reason}; стадия→${obsState.last?.stageName}`);

  const skip = await publishCommandAwaitAck(DEVICE, cmdSkipStage());
  await sleep(1500);
  console.log(`[e2e] SKIP_STAGE ack=${skip?.ok}/${skip?.reason}; стадия→${obsState.last?.stageName}`);

  const ok =
    obsState.frames > 3 && pause?.ok === true && resume?.ok === true && skip?.ok === true && pausedSeen;

  console.log(
    ok
      ? "[e2e] PASS ✅ — телеметрия идёт, команды доставлены и подтверждены, пауза наблюдалась в телеметрии"
      : "[e2e] FAIL ❌",
  );
  obs.end();
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("[e2e] ОШИБКА:", error);
  process.exit(1);
});
