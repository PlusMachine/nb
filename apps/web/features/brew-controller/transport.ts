// =============================================================================
//  features/brew-controller/transport.ts
//  Транспорт «портал → устройство». Абстракция `DeviceTransport` + LAN-REST
//  реализация поверх fetch. MQTT-мостовой транспорт (`bridgeTransport`) —
//  заглушка-TODO до появления брокера/моста (Phase 3).
//
//  Контракт LAN-REST зеркалит apps/device-sim и прошивку:
//    GET  {base}/telemetry     → Telemetry
//    POST {base}/cmd           → тело-Ack (HTTP 200 всегда; ok:false = nack)
//    PUT  {base}/recipe[?slot] → {"ok":true,"slot":N} ИЛИ {"ok":false,"error":N}
//                                 (⚠ ПРОШИВКА отдаёт HTTP 200 в ОБОИХ случаях —
//                                 см. putRecipe ниже, статус НЕ индикатор успеха)
//    GET  {base}/recipes       → { slots:[{slot,name}] }        (только 6..25)
//    GET  {base}/recipe?slot=N → DeviceRecipe напрямую (без обёртки), 404 если пусто
//    GET  {base}/config        → { …сеть, config: DeviceConfig } (§6.3, несекретный)
//    PUT  {base}/config        → { …, config: DeviceConfig }     (клампит+персистит)
//    GET  {base}/log           → DeviceLogFileMeta[]             (P3, офлайн-журнал)
//    GET  {base}/log?name=X    → сырой .jsonl
//    POST {base}/pair          → см. pairDeviceOverLan ниже (P4)
//  Авторизация — заголовок `Authorization: Bearer <token>` (для LAN опционален).
// =============================================================================
import { isIP } from "node:net";

import {
  AckSchema,
  DeviceConfigSchema,
  DeviceLogFileListSchema,
  DeviceRecipeSchema,
  TelemetrySchema,
  type Ack,
  type Command,
  type DeviceConfig,
  type DeviceConfigPatch,
  type DeviceLogFileMeta,
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

/** Один слот рецепта на устройстве: номер + имя, если занят (null — пуст). */
export type DeviceRecipeSlot = { slot: number; name: string | null };

export interface DeviceTransport {
  /** Текущий снимок телеметрии, либо null, если валидной телеметрии нет. */
  getTelemetry(): Promise<Telemetry | null>;
  /** Отправить команду и вернуть Ack (в т.ч. nack — ok:false). */
  sendCommand(cmd: Command): Promise<Ack>;
  /**
   * Записать рецепт в слот устройства; вернуть номер слота, куда он реально лёг.
   * `slot` — целевой слот (Phase 4, device-first push «на плату»); без него
   * устройство САМО автовыбирает первый свободный записываемый слот (прошивка:
   * 6..25, `pick_recipe_slot()`; НЕ 0 — слот 0 на реальном железе ROM-встроенный).
   */
  putRecipe(recipe: DeviceRecipe, slot?: number): Promise<{ slot: number }>;
  /** Прочитать текущий НЕсекретный конфиг §6.3, либо null, если валидного нет. */
  getConfig(): Promise<DeviceConfig | null>;
  /**
   * Записать (под)множество полей конфига §6.3. Устройство клампит и персистит;
   * возвращает эффективный (клампнутый) конфиг. Применяется ПОСЛЕ перезагрузки.
   */
  putConfig(cfg: DeviceConfigPatch): Promise<DeviceConfig>;
  /** Карта слотов устройства (номер + имя рецепта, если занят). */
  listSlots(): Promise<DeviceRecipeSlot[]>;
  /** Read-only снапшот «что лежит на плате» в слоте, либо null если слот пуст. */
  readSlotSnapshot(slot: number): Promise<DeviceRecipe | null>;
  /**
   * P3 (офлайн-журнал варки, bf_log.c): список файлов на устройстве. ОПЦИОНАЛЬНО —
   * журнал живёт на SPIFFS устройства, доступен только по LAN (GET /log); облачный
   * (MQTT) транспорт и in-process демо его не реализуют (см. cloud-transport.ts/
   * sim-transport.ts) — методов нет ⇒ вызывающий (log-sync.ts) должен явно
   * проверять наличие перед вызовом, а не полагаться на throw.
   */
  listLogs?(): Promise<DeviceLogFileMeta[]>;
  /** P3: скачать конкретный файл журнала (.jsonl) целиком; null, если файла нет (404). */
  readLog?(name: string): Promise<string | null>;
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

    async putRecipe(recipe, targetSlot) {
      // Целевой слот (device-first push) — query `?slot=N`; без него прошивка
      // автовыбирает первый свободный записываемый слот (6..25). Номер отдаёт
      // устройство в ответе (source of truth).
      const url =
        targetSlot === undefined
          ? `${base}/recipe`
          : `${base}/recipe?slot=${encodeURIComponent(String(targetSlot))}`;
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
      // ⚠ Сверка контракта (пакет 4-B): реальная прошивка (h_recipe, bf_comms.c)
      // возвращает HTTP 200 даже для ОТКЛОНЁННОГО рецепта — {"ok":false,"error":N}
      // БЕЗ поля slot (нет свободного слота / невалидный явный ?slot=). Раньше
      // отсутствующий json.slot тихо читался как 0 — а слот 0 на реальном железе
      // это ВСТРОЕННЫЙ ROM-рецепт: последующий START_BREW(0) запустил бы совсем не
      // тот рецепт, который пытались запушить. Поэтому статус 2xx — необходимое, но
      // НЕ достаточное условие успеха; смотрим ещё и body.ok/typeof slot==="number".
      const json = (await res.json().catch(() => null)) as
        | { ok?: unknown; slot?: unknown; error?: unknown }
        | null;
      if (!json || json.ok !== true || typeof json.slot !== "number") {
        const code = isRecord(json) && typeof json.error === "number" ? ` (код ${json.error})` : "";
        throw new Error(`lanTransport.putRecipe: устройство отклонило рецепт${code}`);
      }
      return { slot: json.slot };
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

    async listSlots() {
      const url = `${base}/recipes`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) return [];
      const json = await res.json().catch(() => null);
      const raw = isRecord(json) && Array.isArray(json.slots) ? json.slots : [];
      return raw.filter(
        (s: unknown): s is { slot: number; name: string | null } =>
          isRecord(s) && typeof s.slot === "number" && (typeof s.name === "string" || s.name === null),
      );
    },

    async readSlotSnapshot(slot) {
      const url = `${base}/recipe?slot=${encodeURIComponent(String(slot))}`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) return null; // 404 = слот пуст; прочие ошибки тоже трактуем как «нет снапшота»
      const json = await res.json().catch(() => null);
      const parsed = DeviceRecipeSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    },

    async listLogs() {
      const url = `${base}/log`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) return [];
      const json = await res.json().catch(() => null);
      const parsed = DeviceLogFileListSchema.safeParse(json);
      return parsed.success ? parsed.data : [];
    },

    async readLog(name) {
      const url = `${base}/log?name=${encodeURIComponent(name)}`;
      assertEgressUrlAllowed(url);
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) return null; // 404 = файла нет (мог быть вытеснен ретеншном между list/read)
      return res.text();
    },
  };
}

// =============================================================================
//  Pairing (P4/D5): доставка portal-токена НА устройство по LAN.
//  POST {base}/pair {"token": "bfd_..."} — принимается ТОЛЬКО пока устройство ещё
//  не сопряжено (device_token пуст на плате); проверка формата/владения ownership
//  уже произошла на портале (claimCode — секрет claimDevice). 409 ALREADY_PAIRED —
//  устройство уже сопряжено с (возможно, тем же) владельцем; разорвать сопряжение
//  можно ТОЛЬКО локально на самой плате (Setup → «Удалённо» → «Отвязать
//  устройство») — сетевого пути на unpair нет и не будет (CLAUDE.md).
// =============================================================================
export type PairDeviceResult =
  | { ok: true }
  | { ok: false; reason: "ALREADY_PAIRED" | "REJECTED" | "UNREACHABLE" };

/**
 * Доставить pairing-токен устройству по его LAN-адресу. Отдельная функция (не
 * метод DeviceTransport): пейринг — одноразовая операция ДО того, как токен
 * вообще можно использовать как Bearer, поэтому вызывается с «голым» baseUrl,
 * без готового транспорта/токена.
 */
export async function pairDeviceOverLan(baseUrl: string, rawToken: string): Promise<PairDeviceResult> {
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/pair`;
  try {
    assertEgressUrlAllowed(url);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    if (res.status === 409) return { ok: false, reason: "ALREADY_PAIRED" };
    if (!res.ok) return { ok: false, reason: "REJECTED" };
    const json = await res.json().catch(() => null);
    if (isRecord(json) && json.ok === true) return { ok: true };
    return { ok: false, reason: "REJECTED" };
  } catch {
    // Сеть недоступна / SSRF-гард заблокировал / устройство не отвечает — не
    // фатально для claimDevice: токен всё равно выдан пользователю один раз,
    // доставить можно вручную (провижининг-форма/повторный клейм).
    return { ok: false, reason: "UNREACHABLE" };
  }
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
