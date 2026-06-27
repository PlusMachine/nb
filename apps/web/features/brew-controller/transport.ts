// =============================================================================
//  features/brew-controller/transport.ts
//  Транспорт «портал → устройство». Абстракция `DeviceTransport` + LAN-REST
//  реализация поверх fetch. MQTT-мостовой транспорт (`bridgeTransport`) —
//  заглушка-TODO до появления брокера/моста (Phase 3).
//
//  Контракт LAN-REST зеркалит apps/device-sim и прошивку:
//    GET  {base}/telemetry  → Telemetry
//    POST {base}/cmd        → тело-Ack (HTTP 200 при ok, 422 при nack)
//    PUT  {base}/recipe     → { slot: number }
//    GET  {base}/config     → { …сеть, config: DeviceConfig }   (§6.3, несекретный)
//    PUT  {base}/config     → { …, config: DeviceConfig }       (клампит+персистит)
//  Авторизация — заголовок `Authorization: Bearer <token>` (для LAN опционален).
// =============================================================================
import { isIP } from "node:net";

import {
  AckSchema,
  DeviceConfigSchema,
  TelemetrySchema,
  type Ack,
  type Command,
  type DeviceConfig,
  type DeviceConfigPatch,
  type DeviceRecipe,
  type Telemetry,
} from "@nb/brewforge-protocol";

/** Узкое сужение до объекта-записи (для извлечения вложенного `config` из ответа). */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// =============================================================================
//  SSRF-егресс-гард (assertEgressUrlAllowed)
//  device.localUrl полностью контролируется пользователем, а fetch выполняется
//  на СЕРВЕРЕ. Без проверки это classic SSRF: можно навести портал на
//  cloud-metadata (169.254.169.254), внутренние сервисы и т.п. Политика:
//   - схема только http/https;
//   - ВСЕГДА запрет: cloud-metadata/link-local 169.254.0.0/16, fe80::/10,
//     unspecified 0.0.0.0 / ::;
//   - РАЗРЕШЕНО: приватные LAN-диапазоны 10/8, 172.16/12, 192.168/16, ULA
//     fc00::/7 и *.local (устройство легитимно живёт в LAN пользователя —
//     это и есть модель LAN-транспорта);
//   - LOOPBACK (127/8, ::1, localhost): разрешён ТОЛЬКО когда NODE_ENV !=
//     'production' ИЛИ выставлен BREWFORGE_ALLOW_LOOPBACK_DEVICE — так в dev
//     продолжает работать localhost-СИМУЛЯТОР, а в проде loopback закрыт;
//   - kill-switch BREWFORGE_LAN_TRANSPORT_DISABLED — запрещает ВЕСЬ LAN-транспорт
//     (облачные развёртывания, где устройство всё равно недостижимо напрямую).
//
//  Бросаемые ошибки НЕ содержат URL/host — код блокировки не должен утекать
//  наружу/в логи (см. также маппинг ошибок роутов).
//
//  TODO(follow-up, DNS-rebinding): сейчас имя НЕ резолвится — проверяется лишь
//  литерал host. Имя из публичного DNS может зарезолвиться в приватный адрес
//  (и наоборот, между проверкой и fetch). Корректное усиление — резолвить host
//  ОДИН раз, валидировать полученный IP и подключаться именно к нему (pin),
//  чтобы исключить rebinding между валидацией и соединением.
// =============================================================================

/** Переменная окружения «включена», если задана непустым не-ложным значением. */
const isEnvEnabled = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

/** Loopback разрешён вне production либо по явному opt-in (для localhost-симулятора). */
const loopbackAllowed = (): boolean =>
  process.env.NODE_ENV !== "production" ||
  isEnvEnabled(process.env.BREWFORGE_ALLOW_LOOPBACK_DEVICE);

type HostDecision = "allow" | "loopback" | "deny";

/** Классификация IPv4-литерала (host уже провалидирован isIP===4). */
function classifyIpv4(host: string): HostDecision {
  const octets = host.split(".");
  const a = Number(octets[0]);
  const b = Number(octets[1]);
  if (a === 0) return "deny"; // 0.0.0.0/8 — unspecified/«this network» (вкл. 0.0.0.0)
  if (a === 127) return "loopback"; // 127.0.0.0/8
  if (a === 169 && b === 254) return "deny"; // 169.254.0.0/16 link-local + metadata 169.254.169.254
  if (a === 10) return "allow"; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return "allow"; // 172.16.0.0/12
  if (a === 192 && b === 168) return "allow"; // 192.168.0.0/16
  return "deny"; // публичные и прочие спец-диапазоны — запрещаем по умолчанию
}

/** Классификация IPv6-литерала (host уже провалидирован isIP===6, без скобок). */
function classifyIpv6(host: string): HostDecision {
  const norm = host.toLowerCase();
  if (norm === "::") return "deny"; // unspecified
  if (norm === "::1") return "loopback"; // loopback
  const firstGroup = norm.split(":")[0] ?? "";
  const head = firstGroup === "" ? 0 : Number.parseInt(firstGroup, 16);
  if (Number.isNaN(head)) return "deny";
  if ((head & 0xffc0) === 0xfe80) return "deny"; // fe80::/10 link-local
  if ((head & 0xfe00) === 0xfc00) return "allow"; // fc00::/7 ULA — приватный LAN-эквивалент
  // прочий IPv6, в т.ч. ::ffff: IPv4-mapped, — запрещаем по умолчанию
  return "deny";
}

/** Классификация DNS-имени (не IP-литерал). */
function classifyHostname(host: string): HostDecision {
  let name = host.toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1); // абсолютный FQDN
  if (name === "localhost" || name.endsWith(".localhost")) return "loopback";
  if (name.endsWith(".local")) return "allow"; // mDNS-имя в LAN
  // прочие имена без резолва не верифицируемы (см. DNS-rebinding follow-up) — запрет
  return "deny";
}

/**
 * Проверяет, что URL допустим для серверного fetch к устройству в LAN.
 * Бросает Error с кодом `EGRESS_*` (без URL внутри), если запрещён.
 */
export function assertEgressUrlAllowed(rawUrl: string): void {
  if (isEnvEnabled(process.env.BREWFORGE_LAN_TRANSPORT_DISABLED)) {
    throw new Error("EGRESS_DISABLED");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("EGRESS_INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("EGRESS_SCHEME");
  }

  // Node на ряде версий возвращает IPv6-host В скобках ([::1]) — снимаем их.
  let host = url.hostname;
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  const kind = isIP(host);
  const decision: HostDecision =
    kind === 4 ? classifyIpv4(host) : kind === 6 ? classifyIpv6(host) : classifyHostname(host);

  if (decision === "deny") {
    throw new Error("EGRESS_BLOCKED");
  }
  if (decision === "loopback" && !loopbackAllowed()) {
    throw new Error("EGRESS_BLOCKED"); // loopback в production без opt-in
  }
}

export interface DeviceTransport {
  /** Текущий снимок телеметрии, либо null, если валидной телеметрии нет. */
  getTelemetry(): Promise<Telemetry | null>;
  /** Отправить команду и вернуть Ack (в т.ч. nack — ok:false). */
  sendCommand(cmd: Command): Promise<Ack>;
  /** Записать рецепт в записываемый слот устройства; вернуть номер слота. */
  putRecipe(recipe: DeviceRecipe): Promise<{ slot: number }>;
  /** Прочитать текущий НЕсекретный конфиг §6.3, либо null, если валидного нет. */
  getConfig(): Promise<DeviceConfig | null>;
  /**
   * Записать (под)множество полей конфига §6.3. Устройство клампит и персистит;
   * возвращает эффективный (клампнутый) конфиг. Применяется ПОСЛЕ перезагрузки.
   */
  putConfig(cfg: DeviceConfigPatch): Promise<DeviceConfig>;
}

const buildHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token && token.length > 0) headers.authorization = `Bearer ${token}`;
  return headers;
};

/**
 * LAN-REST транспорт к устройству в локальной сети.
 *
 * Семантика ошибок:
 *  - getTelemetry: сетевая ошибка (устройство недоступно) — пробрасывается;
 *    null означает «устройство ответило, но валидной телеметрии нет» (например 404).
 *  - sendCommand: тело и при 200, и при 422 — это Ack; бросаем только если тело
 *    не парсится как Ack.
 *  - putRecipe: бросает на не-2xx (только статус, БЕЗ тела ответа устройства).
 *
 * Перед КАЖДЫМ fetch вызывается assertEgressUrlAllowed (SSRF-гард) — host
 * device.localUrl полностью пользовательский и не должен наводить сервер на
 * metadata/внутренние адреса.
 */
export function lanTransport(baseUrl: string, token?: string): DeviceTransport {
  const base = baseUrl.replace(/\/+$/, "");
  const headers = buildHeaders(token);

  return {
    async getTelemetry() {
      const url = `${base}/telemetry`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const parsed = TelemetrySchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    },

    async sendCommand(cmd) {
      const url = `${base}/cmd`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(cmd),
      });
      const json = await res.json().catch(() => null);
      const parsed = AckSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`lanTransport.sendCommand: невалидный Ack (HTTP ${res.status})`);
      }
      return parsed.data;
    },

    async putRecipe(recipe) {
      const url = `${base}/recipe`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(recipe),
      });
      if (!res.ok) {
        // НЕ подмешиваем тело ответа устройства в ошибку: это утечка внутренних
        // ответов и port-scan-оракул. Оставляем только статус.
        throw new Error(`lanTransport.putRecipe: HTTP ${res.status}`);
      }
      const json = (await res.json().catch(() => null)) as { slot?: unknown } | null;
      const slot = typeof json?.slot === "number" ? json.slot : 0;
      return { slot };
    },

    async getConfig() {
      const url = `${base}/config`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      // Прошивка кладёт настраиваемый конфиг под ключ "config" (рядом — несекретный
      // статус сети). Берём только config; невалидное/отсутствует → null.
      const cfg = isRecord(json) ? json.config : null;
      const parsed = DeviceConfigSchema.safeParse(cfg);
      return parsed.success ? parsed.data : null;
    },

    async putConfig(cfg) {
      const url = `${base}/config`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        // Как putRecipe: НЕ подмешиваем тело ответа устройства (info-leak/port-scan) —
        // только статус (вкл. 429 RATE_LIMITED / 400 при отказе валидации прошивки).
        throw new Error(`lanTransport.putConfig: HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => null);
      // Ответ PUT эхоит эффективный (клампнутый) конфиг под ключом "config".
      const cfgObj = isRecord(json) ? json.config : null;
      const parsed = DeviceConfigSchema.safeParse(cfgObj);
      if (!parsed.success) {
        throw new Error(`lanTransport.putConfig: невалидный config в ответе (HTTP ${res.status})`);
      }
      return parsed.data;
    },
  };
}

/**
 * TODO(Phase 3, мост): транспорт поверх MQTT-моста (длительный Node-процесс).
 *
 * Реалтайм-канал моста — это его WebSocket-сервер (apps/bridge, ws.ts): браузер
 * подключается к нему напрямую (телеметрия фан-аутом + отправка команд), а сам
 * мост публикует команды в brewforge/<id>/cmd (QoS1) и пишет ack из .../cmd/ack
 * и телеметрию из .../telemetry в БД. Поэтому «pull»-семантика DeviceTransport
 * (getTelemetry/sendCommand на запрос) для облачного пути нетипична — портал
 * читает последнюю телеметрию из brew_telemetry, а живой поток берёт по WS.
 *
 * Этот REST-подобный bridgeTransport здесь намеренно не реализуется: если он и
 * понадобится (например, серверный one-shot sendCommand из route handler), он
 * будет тонкой обёрткой, публикующей в брокер. Пока — явная заглушка.
 * Развёртывание моста/брокера и контракт WS — см. apps/bridge/README.md.
 */
export function bridgeTransport(_deviceId: string, _opts?: { token?: string }): DeviceTransport {
  throw new Error("BRIDGE_TRANSPORT_NOT_IMPLEMENTED");
}
