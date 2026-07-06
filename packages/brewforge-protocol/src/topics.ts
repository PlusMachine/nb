// =============================================================================
//  @nb/brewforge-protocol — topics.ts
//  Карта MQTT-топиков brewforge/<deviceId>/* (PHASE2-4_PLAN §2.2).
//  Один источник имён для моста, портала и симулятора.
// =============================================================================

export interface DeviceTopics {
  telemetry: string; // QoS0, retained, ~1 Гц — снимок состояния
  status: string;    // retained, LWT — online/offline + fw + ip
  cmd: string;       // QoS1 — команды на устройство
  ack: string;       // QoS1 — ack/nack команд
  recipe: string;    // push рецепта
  log: string;       // события брю-лога
  update: string;    // retained, портал→устройство — доступное OTA-обновление (§5.3)
}

/** Построить карту топиков для устройства. */
export function topics(deviceId: string): DeviceTopics {
  const base = `brewforge/${deviceId}`;
  return {
    telemetry: `${base}/telemetry`,
    status: `${base}/status`,
    cmd: `${base}/cmd`,
    ack: `${base}/cmd/ack`,
    recipe: `${base}/recipe`,
    log: `${base}/log`,
    update: `${base}/update`,
  };
}

/** Префикс топиков устройства (для wildcard-подписок: `${topicPrefix(id)}/#`). */
export function topicPrefix(deviceId: string): string {
  return `brewforge/${deviceId}`;
}
