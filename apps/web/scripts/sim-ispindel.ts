/**
 * Dev-симулятор iSpindel: шлёт на заданный ingest-URL пакеты в native-формате
 * сток-прошивки iSpindel (angle/temperature/gravity/battery/RSSI/interval),
 * синтезируя правдоподобную кривую брожения. Нужен для ручной проверки M1
 * («плитка живёт, первый пакет ловится») и как заготовка для M2/демо-данных.
 *
 * Спека: docs/specs/third-party-fermentation-devices.md §11 (M1 DoD), §12.
 *
 * Модель кривой (виртуальное время t, часы, от начала прогона):
 *   - лаг 12 ч: плотность ≈ OG с лёгким шумом (брожение ещё не пошло);
 *   - экспоненциальный спуск OG→FG за следующие 96 ч (4 суток) — к концу
 *     окна остаётся ~2% исходного разрыва;
 *   - хвост: плотность стабилизируется около FG до конца duration.
 *   Угол наклона (никто на него не смотрит, но пусть будет правдоподобным)
 *   синтезируется пропорционально прогрессу брожения: ~65° при OG → ~25° при FG.
 *   Температура — 19.5°C базовая + суточная синусоида ±0.8°C + шум.
 *   Батарея — линейный разряд 4.2В → 3.9В за весь прогон.
 *   RSSI — −60…−85 дБм, каждый пакет заново.
 *   Редкие выбросы (~каждый 40-й пакет, случайно) — плотность в этой ТОЧКЕ
 *   подскакивает на +0.030 SG (для будущей демонстрации исключения точек, F4/M3).
 *
 * Персист-гейт сервера — не чаще 1 записанной точки/5 мин НА УСТРОЙСТВО (по ts,
 * а ts = времени приёма). При --speed > ~20 большинство пакетов будут отвечать
 * 200 {ok:true,stored:false} — это ШТАТНО (throttled/gated), а не ошибка: смысл
 * M1-прогона — поймать первый пакет и убедиться, что плитка/статус живут, а не
 * протащить в БД полную кривую (для этого нужен --speed 1 или отдельный сидинг).
 *
 * Запуск:
 *   npm run sim:ispindel -- --url http://localhost:3000/api/ingest/<token>
 *   npm run sim:ispindel -- --url <url> --speed 120 --duration 2
 *   npm run sim:ispindel -- --url <url> --og 1.060 --fg 1.010
 *
 * Остановка: Ctrl+C (или `kill <pid>`) в любой момент — печатает итоговую сводку.
 */

const DEVICE_NAME = "iSpindel-sim";
const DEVICE_ID = 4974097;

const LAG_HOURS = 12;
const DECAY_HOURS = 96; // 4 суток
const DEFAULT_DURATION_HOURS = LAG_HOURS + DECAY_HOURS + 24; // 132 = лаг + 4 суток + хвост

const VIRTUAL_INTERVAL_SECONDS = 900; // поле "interval" в пакете — фиксировано спекой
const MIN_REAL_DELAY_MS = 2000; // «не чаще 1 пакета в 2 секунды» вне зависимости от speed

const BASE_TEMP_C = 19.5;
const TEMP_DAILY_AMPLITUDE_C = 0.8;
const BATTERY_START_V = 4.2;
const BATTERY_END_V = 3.9;
const OUTLIER_PROBABILITY = 1 / 40;
const OUTLIER_GRAVITY_OFFSET = 0.03;

const RSSI_MIN = -85;
const RSSI_MAX = -60;

// -----------------------------------------------------------------------------
// Аргументы
// -----------------------------------------------------------------------------

type Args = {
  url: string;
  og: number;
  fg: number;
  speed: number;
  duration: number;
};

const flagValue = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`После ${flag} нужно значение.`);
  }
  return value;
};

const parseNumberFlag = (argv: string[], flag: string, fallback: number): number => {
  const raw = flagValue(argv, flag);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} должен быть числом, а не "${raw}".`);
  }
  return parsed;
};

const parseArgs = (argv: string[]): Args => {
  const url = flagValue(argv, "--url");
  if (!url) {
    throw new Error("Нужен --url <ingest-URL> (см. страницу устройства → «Показать URL»).");
  }
  const og = parseNumberFlag(argv, "--og", 1.052);
  const fg = parseNumberFlag(argv, "--fg", 1.014);
  if (fg >= og) {
    throw new Error(`--fg (${fg}) должен быть меньше --og (${og}).`);
  }
  const speed = parseNumberFlag(argv, "--speed", 60);
  if (speed <= 0) {
    throw new Error(`--speed должен быть положительным, а не "${speed}".`);
  }
  const duration = parseNumberFlag(argv, "--duration", DEFAULT_DURATION_HOURS);
  if (duration <= 0) {
    throw new Error(`--duration должен быть положительным, а не "${duration}".`);
  }
  return { url, og, fg, speed, duration };
};

// -----------------------------------------------------------------------------
// Модель кривой
// -----------------------------------------------------------------------------

/** Равномерный шум в диапазоне [-amplitude, +amplitude]. */
const noise = (amplitude: number): number => (Math.random() * 2 - 1) * amplitude;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Плотность (SG) в момент t (виртуальные часы от старта), без выбросов. */
const gravityAt = (t: number, og: number, fg: number): number => {
  const span = og - fg;
  if (t < LAG_HOURS) {
    return og + noise(0.0005);
  }
  const elapsed = Math.min(t - LAG_HOURS, DECAY_HOURS);
  // На elapsed=DECAY_HOURS остаётся 2% исходного разрыва — дальше (хвост)
  // используем то же самое значение (elapsed зажат), только шум поменьше.
  const k = -Math.log(0.02) / DECAY_HOURS;
  const decayed = fg + span * Math.exp(-k * elapsed);
  const isTail = t - LAG_HOURS >= DECAY_HOURS;
  return decayed + noise(isTail ? 0.0003 : 0.0005);
};

const temperatureAt = (t: number): number => BASE_TEMP_C + TEMP_DAILY_AMPLITUDE_C * Math.sin((2 * Math.PI * t) / 24) + noise(0.15);

const batteryAt = (t: number, durationHours: number): number => {
  const progress = clamp(t / durationHours, 0, 1);
  return BATTERY_START_V + (BATTERY_END_V - BATTERY_START_V) * progress + noise(0.01);
};

/** Угол наклона поплавка — синтетика, пропорциональная прогрессу OG→FG (65°→25°). */
const angleAt = (gravitySg: number, og: number, fg: number): number => {
  const progress = clamp((gravitySg - fg) / (og - fg), 0, 1);
  return 25 + progress * 40 + noise(1.5);
};

const rssiAt = (): number => Math.round(RSSI_MIN + Math.random() * (RSSI_MAX - RSSI_MIN));

type SimPacket = {
  name: string;
  ID: number;
  angle: number;
  temperature: number;
  temp_units: "C";
  gravity: number;
  battery: number;
  interval: number;
  RSSI: number;
};

const buildPacket = (t: number, og: number, fg: number, durationHours: number): { packet: SimPacket; isOutlier: boolean } => {
  const isOutlier = Math.random() < OUTLIER_PROBABILITY;
  const gravitySg = gravityAt(t, og, fg) + (isOutlier ? OUTLIER_GRAVITY_OFFSET : 0);
  const tempC = temperatureAt(t);
  const packet: SimPacket = {
    name: DEVICE_NAME,
    ID: DEVICE_ID,
    angle: Number(angleAt(gravitySg, og, fg).toFixed(2)),
    temperature: Number(tempC.toFixed(2)),
    temp_units: "C",
    gravity: Number(gravitySg.toFixed(4)),
    battery: Number(batteryAt(t, durationHours).toFixed(3)),
    interval: VIRTUAL_INTERVAL_SECONDS,
    RSSI: rssiAt()
  };
  return { packet, isOutlier };
};

// -----------------------------------------------------------------------------
// Отправка
// -----------------------------------------------------------------------------

class FatalSimError extends Error {}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Tally = { sent: number; stored: number; gated: number; networkErrors: number };

const sendPacket = async (url: string, packet: SimPacket, isOutlier: boolean, tally: Tally): Promise<void> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });
  } catch (error) {
    tally.networkErrors += 1;
    console.warn(`⚠️  сетевая ошибка, продолжаю: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  tally.sent += 1;

  if (response.status === 404) {
    throw new FatalSimError(`токен не найден (404) — проверь --url. Отправлено: ${url}`);
  }
  if (response.status === 400 || response.status === 413) {
    const bodyText = await response.text().catch(() => "<не читается>");
    throw new FatalSimError(`сервер отклонил пакет (${response.status}): ${bodyText}`);
  }
  if (!response.ok) {
    console.warn(`⚠️  неожиданный статус ${response.status}, продолжаю`);
    return;
  }

  const json = (await response.json().catch(() => ({}))) as { ok?: boolean; stored?: boolean };
  const stored = json.stored !== false;
  if (stored) {
    tally.stored += 1;
  } else {
    tally.gated += 1;
  }

  const flag = isOutlier ? " [выброс]" : "";
  console.log(
    `${stored ? "✅ stored " : "…  gated  "} SG=${packet.gravity.toFixed(4)} T=${packet.temperature.toFixed(2)}°C batt=${packet.battery.toFixed(3)}V${flag}`
  );
};

const printSummary = (tally: Tally): void => {
  console.log(
    `\n📊  Итог: отправлено ${tally.sent}, записано ${tally.stored}, отброшено гейтом ${tally.gated}, сетевых ошибок ${tally.networkErrors}.`
  );
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `🌡️  sim:ispindel → ${args.url}\n    OG=${args.og} FG=${args.fg} speed=×${args.speed} duration=${args.duration}ч (виртуальных)`
  );

  const tally: Tally = { sent: 0, stored: 0, gated: 0, networkErrors: 0 };

  const stopEarly = (signal: string) => {
    console.log(`\n⏹  получен ${signal}, останавливаюсь…`);
    printSummary(tally);
    process.exit(0);
  };
  process.once("SIGINT", () => stopEarly("SIGINT"));
  process.once("SIGTERM", () => stopEarly("SIGTERM"));

  const totalVirtualSeconds = args.duration * 3600;
  let virtualSeconds = 0;

  while (virtualSeconds <= totalVirtualSeconds) {
    const virtualHours = virtualSeconds / 3600;
    const { packet, isOutlier } = buildPacket(virtualHours, args.og, args.fg, args.duration);
    await sendPacket(args.url, packet, isOutlier, tally);

    virtualSeconds += VIRTUAL_INTERVAL_SECONDS;
    if (virtualSeconds > totalVirtualSeconds) break;

    const realDelayMs = Math.max(MIN_REAL_DELAY_MS, (VIRTUAL_INTERVAL_SECONDS / args.speed) * 1000);
    await sleep(realDelayMs);
  }

  printSummary(tally);
  process.exit(0);
};

main().catch((error) => {
  if (error instanceof FatalSimError) {
    console.error(`❌  sim:ispindel остановлен: ${error.message}`);
  } else {
    console.error("❌  sim:ispindel упал:", error?.stack ?? error?.message ?? error);
  }
  process.exit(1);
});
