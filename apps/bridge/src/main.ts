// =============================================================================
//  apps/bridge — main.ts
//  Точка входа длительного процесса-моста (cloud realtime path, PRD §D — это
//  отдельный процесс, НЕ обработчик запроса Next.js).
//
//  Связывает: MQTT (устройства) ↔ DB (телеметрия/команды/лог) ↔ WS (портал).
//   - mqtt.onTelemetry / onAck → ws.broadcast* (фан-аут владельцам);
//   - ws.command            → mqtt.publishCommand (publish brewforge/<id>/cmd).
//
//  Env:
//   MQTT_URL        брокер (default mqtt://localhost:1883)
//   BRIDGE_WS_PORT  порт WS-сервера (default 8090)
//   DATABASE_URL    Postgres (читается @nb/db; default — локальный docker)
// =============================================================================
import { startMqtt } from "./mqtt.js";
import { startWsServer } from "./ws.js";
import { closeDb } from "./db.js";
import { runFermentWatchdog } from "./watchdog.js";

const MQTT_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const WS_PORT = Number.parseInt(process.env.BRIDGE_WS_PORT ?? "8090", 10) || 8090;

function main(): void {
  console.log("[bridge] старт BrewForge MQTT↔DB↔WS моста");

  // WS поднимаем первым: он отдаёт фан-аут хуки, которые получит mqtt.
  const ws = startWsServer({ port: WS_PORT });

  const mqttBridge = startMqtt({
    url: MQTT_URL,
    hooks: {
      onTelemetry: (deviceId, telemetry) => ws.broadcastTelemetry(deviceId, telemetry),
      onAck: (deviceId, ack) => ws.broadcastAck(deviceId, ack),
    },
  });

  // Замыкаем цикл: команды из WS публикуются в MQTT.
  ws.setCommandPublisher((deviceId, command) => mqttBridge.publishCommand(deviceId, command));

  // Периодический health-лог.
  const health = setInterval(() => {
    console.log(
      `[bridge] health: mqtt=${mqttBridge.isConnected() ? "up" : "down"} ws_clients=${ws.clientCount()}`,
    );
  }, 30_000);
  health.unref();

  // Офлайн-watchdog ферментации (H3, §12.2/§14): раз в 5 мин — приборы,
  // чей last-known режим ферментация и кто молчит > 30 мин, получают пуш.
  // Проверка по in-memory состоянию (trackFermentFrame в mqtt.ts), БД не сканирует.
  const watchdog = setInterval(() => {
    runFermentWatchdog().catch((err: unknown) => {
      console.error("[bridge] сбой офлайн-watchdog ферментации:", err instanceof Error ? err.message : String(err));
    });
  }, 5 * 60_000);
  watchdog.unref();

  // Graceful shutdown.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[bridge] получен ${signal}, завершение…`);
    clearInterval(health);
    clearInterval(watchdog);
    void (async () => {
      try {
        await ws.close();
        await mqttBridge.close();
        await closeDb();
      } catch (err) {
        console.error("[bridge] ошибка при завершении:", err);
      } finally {
        process.exit(0);
      }
    })();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error("[bridge] unhandledRejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[bridge] uncaughtException:", err);
  });
}

main();
