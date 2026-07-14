// =============================================================================
//  features/device-streams — analytics.ts
//  Тонкий серверный трекер продуктовых событий фичи (§11 M5:
//  device_connected/kind, first_packet, session_started, verdict_likely_done,
//  alert_sent, calibration_applied).
//
//  В проекте сейчас есть только КЛИЕНТСКИЙ PostHog (apps/web/lib/analytics.ts,
//  "use client", opt-in по cookie-согласию, грузится динамическим import()) —
//  серверного capture (posthog-node либо ручной fetch на POSTHOG_HOST/capture/)
//  нигде в кодовой базе нет, хотя ключи в .env.example заведены (POSTHOG_KEY/
//  POSTHOG_HOST). Поднимать серверную инфраструктуру PostHog ради одной фичи —
//  лишнее; вместо этого — тонкий no-op хелпер с той же сигнатурой, что и будущий
//  адаптер. Событийная сетка готова и появится «бесплатно» в тот момент, когда
//  серверный PostHog заведут — правки понадобятся только внутри track(), не в
//  вызывающих местах (service.ts/actions.ts/ingest.ts/ingest-rapt.ts/alerts.ts).
//
//  TODO(analytics): заменить тело track() на реальный серверный capture (см.
//  комментарий выше), когда серверный PostHog появится в проекте.
// =============================================================================

/** Свойства по каждому событию (§11 M5) — типобезопасный вызов track(). */
export type DeviceStreamsAnalyticsProps = {
  /** Подключено новое устройство — и через визард F1, и автообнаружением RAPT (ingest-rapt.ts). */
  device_connected: { kind: string; provider: string; demo?: boolean };
  /** Первая точка телеметрии устройства (до INSERT показаний у устройства не было ни одного). */
  first_packet: { provider: string };
  /** Создан сеанс привязки к партии (F2) — retro=true, если пользователь запросил ретро-привязку. */
  session_started: { retro: boolean };
  /** Вердикт «Похоже, добродило» посчитан впервые за сеанс (до этого alertState.likely_done не было). */
  verdict_likely_done: { sessionId: string };
  /** Веб-пуш алерта отправлен (попытка отправки, не подтверждённая доставка — см. alerts.ts). */
  alert_sent: { type: string };
  /** Применена офсет-калибровка сеанса («Выровнять по моему замеру», F4.1). */
  calibration_applied: { sessionId: string };
};

export type DeviceStreamsAnalyticsEvent = keyof DeviceStreamsAnalyticsProps;

/**
 * Точечный трекер серверных событий фичи (§11 M5). Пока не подключён реальный
 * адаптер — no-op с логом в dev (чтобы событийную сетку было видно вживую при
 * разработке), в проде тихий и дешёвый. Никогда не бросает — аналитика не
 * должна влиять на основной путь (ingest/сеансы/алерты).
 */
export const track = <E extends DeviceStreamsAnalyticsEvent>(
  event: E,
  properties: DeviceStreamsAnalyticsProps[E]
): void => {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[device-streams:analytics] ${event}`, properties);
    }
  } catch {
    // no-op — трекер не должен ронять вызывающий код ни при каких обстоятельствах
  }
};
