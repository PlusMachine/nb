// =============================================================================
//  features/brew-controller/device-telemetry-cache.ts
//  ОДИН общий серверный поллер/кеш телеметрии НА УСТРОЙСТВО с фан-аутом на всех
//  подписчиков (см. docs/brewery-command-center.md §«Архитектура телеметрии»).
//
//  Зачем: без общего кеша каждый SSE-стрим (пульт L2 зоны B + дашборд партии
//  зоны A + будущие L1-плитки) поднимал бы СВОЙ poll-loop к слабому ESP32 —
//  N стримов × M клиентов = N×M опросов. Здесь на устройство работает ровно
//  один loop; кадры раздаются всем слушателям, last-known кешируется.
//
//  Модульный синглтон (Map deviceId→Hub) живёт в пределах одного инстанса
//  сервера — этого достаточно для self-host/dev. В многоинстансном serverless
//  кеш будет per-instance (приемлемая деградация: просто больше опросов).
//
//  Персист истории: хаб пишет даунсэмпл в brew_telemetry (deviceId + активная
//  brewing-партия устройства, если есть) — ровно один писатель на устройство,
//  без дублей из конкурентных стримов.
//
//  Владелец опроса: readTelemetry провайдера — ownership-checked (loadDevice по
//  userId). Устройство принадлежит одному пользователю, а до подписки роут уже
//  проверил владение (getDeviceById), поэтому userId всех подписчиков совпадает —
//  хаб берёт его для опроса.
// =============================================================================
import { and, brewBatches, brewTelemetry, db, desc, eq } from "@nb/db";
import type { Telemetry } from "@nb/brewforge-protocol";

import { getProvider } from "./index";
import { BREWFORGE_PROVIDER_ID } from "./contracts";

/** Кадр фан-аута: снимок телеметрии, «офлайн» (нет валидной телеметрии) или ошибка. */
export type TelemetryFrame =
  | { type: "telemetry"; data: Telemetry }
  | { type: "offline" }
  | { type: "error"; error: string };

type Listener = (frame: TelemetryFrame) => void;

// Интервал опроса устройства (как в прежнем per-route поллере).
const POLL_INTERVAL_MS = 1500;
// Даунсэмпл-персист истории: не чаще одной строки раз в ~10 с на устройство.
const PERSIST_INTERVAL_MS = 10_000;
// Кадр свежее этого порога считаем годным для freshness-гейта без нового опроса.
const FRESH_MS = 8000;
// После ухода последнего подписчика держим loop ещё немного — быстрые
// переподключения (навигация, реконнект EventSource) не должны дёргать loop.
const LINGER_MS = 5000;
// Резолв активной партии устройства кешируем — не дёргаем БД на каждый персист.
const ACTIVE_BATCH_TTL_MS = 30_000;

interface Hub {
  deviceId: string;
  ownerUserId: string;
  // Провайдер устройства (per-device dispatch, Phase 4.5): один поллер резолвит
  // провайдер по providerId устройства (brewforge → железо/LAN/облако,
  // brewforge-demo → in-process стаб). Дефолт — brewforge.
  providerId: string;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setInterval> | null;
  lingerTimer: ReturnType<typeof setTimeout> | null;
  lastFrame: Telemetry | null;
  lastFrameAt: number; // wall-clock сервера, мс (когда получен lastFrame)
  polling: boolean; // защита от наложения тиков при медленном readTelemetry
  lastPersistAt: number;
  lastPersistedSeq: number;
  activeBatchId: string | null;
  activeBatchAt: number; // когда резолвили activeBatchId
}

const hubs = new Map<string, Hub>();

/** Активная (brewing) партия устройства для персиста истории, либо null. Кешируется. */
async function resolveActiveBatchId(hub: Hub): Promise<string | null> {
  const nowMs = Date.now();
  if (nowMs - hub.activeBatchAt < ACTIVE_BATCH_TTL_MS) {
    return hub.activeBatchId;
  }
  hub.activeBatchAt = nowMs;
  try {
    const [row] = await db
      .select({ id: brewBatches.id })
      .from(brewBatches)
      .where(and(eq(brewBatches.deviceId, hub.deviceId), eq(brewBatches.status, "brewing")))
      .orderBy(desc(brewBatches.updatedAt))
      .limit(1);
    hub.activeBatchId = row?.id ?? null;
  } catch {
    hub.activeBatchId = null;
  }
  return hub.activeBatchId;
}

/** Даунсэмпл-персист телеметрии в brew_telemetry. Никогда не роняет loop. */
async function persistDownsampled(hub: Hub, t: Telemetry): Promise<void> {
  const nowMs = Date.now();
  if (nowMs - hub.lastPersistAt < PERSIST_INTERVAL_MS) return;
  if (t.seq === hub.lastPersistedSeq) return;
  hub.lastPersistAt = nowMs;
  hub.lastPersistedSeq = t.seq;
  try {
    const brewBatchId = await resolveActiveBatchId(hub);
    await db
      .insert(brewTelemetry)
      .values({
        deviceId: hub.deviceId,
        brewBatchId,
        // ts устройства — SNTP wall-clock (сек); при отсутствии (0) берём now.
        ts: t.ts > 0 ? new Date(t.ts * 1000) : new Date(),
        seq: t.seq,
        stage: t.stage,
        primaryC: t.primary.valid ? t.primary.c : null,
        setpointC: t.setpointC,
        heatDutyPct: t.heatDutyPct,
        payload: t as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({
        target: [brewTelemetry.deviceId, brewTelemetry.brewBatchId, brewTelemetry.seq],
      });
  } catch {
    // best-effort: ошибка БД не должна прерывать фан-аут телеметрии
  }
}

function fanout(hub: Hub, frame: TelemetryFrame): void {
  for (const listener of hub.listeners) {
    try {
      listener(frame);
    } catch {
      // сбойный слушатель не должен ронять раздачу остальным
    }
  }
}

async function pollOnce(hub: Hub): Promise<void> {
  if (hub.polling) return; // не накладываем тики, если прошлый readTelemetry ещё идёт
  hub.polling = true;
  try {
    const provider = getProvider(hub.providerId);
    if (!provider?.readTelemetry) {
      fanout(hub, { type: "error", error: "PROVIDER_UNAVAILABLE" });
      return;
    }
    const telemetry = await provider.readTelemetry({
      userId: hub.ownerUserId,
      deviceId: hub.deviceId,
    });
    if (telemetry) {
      hub.lastFrame = telemetry;
      hub.lastFrameAt = Date.now();
      fanout(hub, { type: "telemetry", data: telemetry });
      void persistDownsampled(hub, telemetry);
    } else {
      fanout(hub, { type: "offline" });
    }
  } catch (error) {
    // Наружу — стабильный код; реальную причину логируем на сервере.
    console.error("[device-telemetry-cache] сбой чтения телеметрии:", error);
    fanout(hub, { type: "error", error: "TELEMETRY_READ_FAILED" });
  } finally {
    hub.polling = false;
  }
}

function startTimer(hub: Hub): void {
  if (hub.timer) return;
  // Немедленный первый опрос, затем по интервалу.
  void pollOnce(hub);
  hub.timer = setInterval(() => void pollOnce(hub), POLL_INTERVAL_MS);
}

function stopTimer(hub: Hub): void {
  if (hub.timer) {
    clearInterval(hub.timer);
    hub.timer = null;
  }
}

function getOrCreateHub(deviceId: string, ownerUserId: string, providerId: string): Hub {
  let hub = hubs.get(deviceId);
  if (!hub) {
    hub = {
      deviceId,
      ownerUserId,
      providerId,
      listeners: new Set(),
      timer: null,
      lingerTimer: null,
      lastFrame: null,
      lastFrameAt: 0,
      polling: false,
      lastPersistAt: 0,
      lastPersistedSeq: -1,
      activeBatchId: null,
      activeBatchAt: 0,
    };
    hubs.set(deviceId, hub);
  } else {
    // Устройство одного владельца, но обновим на случай пере-создания сессии.
    hub.ownerUserId = ownerUserId;
    hub.providerId = providerId;
  }
  return hub;
}

/**
 * Подписаться на живую телеметрию устройства. Немедленно доставляет последний
 * известный кадр (если есть), затем — каждый новый кадр общего поллера. Возвращает
 * функцию отписки; после ухода последнего подписчика loop гасится (с LINGER-грацией).
 *
 * ВАЖНО (безопасность): userId должен быть УЖЕ проверен на владение устройством
 * вызывающим (роут делает getDeviceById(userId, deviceId)) — хаб доверяет ему для
 * ownership-checked readTelemetry.
 */
export function subscribeDeviceTelemetry(
  params: { userId: string; deviceId: string; providerId?: string },
  listener: Listener,
): () => void {
  const hub = getOrCreateHub(params.deviceId, params.userId, params.providerId ?? BREWFORGE_PROVIDER_ID);

  if (hub.lingerTimer) {
    clearTimeout(hub.lingerTimer);
    hub.lingerTimer = null;
  }

  hub.listeners.add(listener);
  // Тёплый старт: сразу отдаём последний кадр, если он свежий.
  if (hub.lastFrame && Date.now() - hub.lastFrameAt < FRESH_MS) {
    try {
      listener({ type: "telemetry", data: hub.lastFrame });
    } catch {
      // игнорируем сбой немедленной доставки
    }
  }
  startTimer(hub);

  return () => {
    hub.listeners.delete(listener);
    if (hub.listeners.size > 0) return;
    // Последний ушёл — гасим loop после грации (быстрый реконнект его переиспользует).
    if (hub.lingerTimer) clearTimeout(hub.lingerTimer);
    hub.lingerTimer = setTimeout(() => {
      hub.lingerTimer = null;
      if (hub.listeners.size === 0) {
        stopTimer(hub);
        hubs.delete(hub.deviceId);
      }
    }, LINGER_MS);
  };
}

/**
 * Свежая телеметрия для серверного freshness-гейта команд. Если открыт дашборд —
 * общий кеш тёплый и возвращается без нового опроса; иначе делаем один точечный
 * readTelemetry. null = устройство не отдало валидной телеметрии (offline/stale) —
 * роут отклонит опасную команду.
 */
export async function readFreshTelemetry(params: {
  userId: string;
  deviceId: string;
  providerId?: string;
}): Promise<Telemetry | null> {
  const hub = hubs.get(params.deviceId);
  if (hub?.lastFrame && Date.now() - hub.lastFrameAt < FRESH_MS) {
    return hub.lastFrame;
  }
  const provider = getProvider(params.providerId ?? hub?.providerId ?? BREWFORGE_PROVIDER_ID);
  if (!provider?.readTelemetry) return null;
  // Транспортная ошибка (устройство недостижимо / ECONNREFUSED) для freshness-гейта
  // = «не свежо»: не можем подтвердить связь → возвращаем null, роут отклонит опасную
  // команду чётким 409 DEVICE_STALE (а не общим 400). Fail-safe: сомнение → блок.
  let telemetry: Telemetry | null;
  try {
    telemetry = await provider.readTelemetry(params);
  } catch {
    return null;
  }
  if (hub && telemetry) {
    hub.lastFrame = telemetry;
    hub.lastFrameAt = Date.now();
  }
  return telemetry;
}
