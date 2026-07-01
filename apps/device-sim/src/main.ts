// =============================================================================
//  @nb/device-sim — main.ts
//  CLI-точка входа. Поднимает SimDevice + HTTP/WS-сервер.
//
//  Флаги:
//    --port       порт HTTP/WS (по умолчанию 8080)
//    --device-id  идентификатор устройства (по умолчанию bf-sim01)
//    --tick-ms    интервал реального тика, мс (по умолчанию 1000)
//    --tick-scale ускорение варочного времени, сек/сек (по умолчанию 60)
//    --scenario   idle | mash | fault (по умолчанию idle)
//    --fw         строка прошивки (по умолчанию sim-0.0.0)
// =============================================================================
import { SimDevice, type Scenario } from "@nb/brewforge-sim";
import { startServer } from "./server.js";
import { startMqtt, type SimMqttHandle } from "./mqtt.js";

interface Args {
  port: number;
  deviceId: string;
  tickMs: number;
  tickScale: number;
  scenario: Scenario;
  fw: string;
  /** URL MQTT-брокера для облачного режима; undefined — только REST/WS. */
  mqttUrl: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        map.set(key, next);
        i++;
      } else {
        map.set(key, "true");
      }
    }
  }

  const scenarioRaw = map.get("scenario") ?? "idle";
  const scenario: Scenario =
    scenarioRaw === "mash" || scenarioRaw === "fault" ? scenarioRaw : "idle";

  // --mqtt без значения → дефолтный локальный брокер; со значением → его URL.
  const mqttRaw = map.get("mqtt");
  const mqttUrl = mqttRaw === undefined ? undefined : mqttRaw === "true" ? "mqtt://localhost:1883" : mqttRaw;

  return {
    port: intArg(map.get("port"), 8080),
    deviceId: map.get("device-id") ?? "bf-sim01",
    tickMs: intArg(map.get("tick-ms"), 1000),
    tickScale: numArg(map.get("tick-scale"), 60),
    scenario,
    fw: map.get("fw") ?? "sim-0.0.0",
    mqttUrl,
  };
}

function intArg(v: string | undefined, def: number): number {
  if (v === undefined) return def;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

function numArg(v: string | undefined, def: number): number {
  if (v === undefined) return def;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? def : n;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const device = new SimDevice({
    deviceId: args.deviceId,
    fw: args.fw,
    tickMs: args.tickMs,
    tickScale: args.tickScale,
    scenario: args.scenario,
  });
  device.start();

  const server = startServer(device, args.port);
  const base = `http://localhost:${args.port}`;

  // Облачный режим: дополнительно к REST/WS подключаемся к брокеру (как прошивка).
  const mqttHandle: SimMqttHandle | null = args.mqttUrl
    ? startMqtt(device, args.deviceId, args.mqttUrl)
    : null;

  console.log("BrewForge device simulator");
  console.log(`  device-id : ${args.deviceId}`);
  console.log(`  fw        : ${args.fw}`);
  console.log(`  scenario  : ${args.scenario}`);
  console.log(`  tick      : ${args.tickMs} ms, scale x${args.tickScale}`);
  console.log(`  mqtt      : ${args.mqttUrl ?? "(выкл — только REST/WS)"}`);
  console.log("");
  console.log("Endpoints:");
  console.log(`  GET  ${base}/telemetry`);
  console.log(`  POST ${base}/cmd`);
  console.log(`  PUT  ${base}/recipe?slot=0`);
  console.log(`  GET  ${base}/recipe?slot=0`);
  console.log(`  GET  ${base}/recipes`);
  console.log(`  GET  ${base}/config`);
  console.log(`  PUT  ${base}/config`);
  console.log(`  POST ${base}/sim/fault`);
  console.log(`  GET  ${base}/log`);
  console.log(`  GET  ${base}/events     (SSE)`);
  console.log(`  WS   ws://localhost:${args.port}/ws`);
  console.log("");

  const shutdown = (): void => {
    console.log("\nОстановка...");
    device.stopTimer();
    const closeMqtt = mqttHandle ? mqttHandle.close() : Promise.resolve();
    void Promise.allSettled([server.close(), closeMqtt]).then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
