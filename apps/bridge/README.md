# @nb/bridge — BrewForge MQTT ↔ DB ↔ WebSocket мост

Длительный Node-процесс — облачный realtime-путь BrewForge. Per PRD §D это
**отдельный процесс, а НЕ обработчик запроса Next.js**: он держит постоянное
MQTT-соединение с брокером, пишет телеметрию/команды/лог в Postgres и
фан-аутит живую телеметрию владельцам устройств по WebSocket.

```
ESP32 / device-sim ──MQTT──▶ mosquitto ──▶ apps/bridge ──┬─▶ Postgres (@nb/db)
                                   ▲                       └─▶ WebSocket ──▶ браузер/портал
                                   └──────── cmd (QoS1) ───────── bridge ◀── command (WS)
```

LAN/симуляторный путь (`features/brew-controller` → `lanTransport`) работает
**без** этого моста — он нужен только для облачного realtime.

## Как запустить

```bash
# 1) Поднять брокер (и Postgres) через docker-compose из корня репо:
docker compose up -d mosquitto postgres

# 2) Применить миграции БД (если ещё не применены) — нужен Postgres:
npm run db:migrate

# 3) Запустить мост (dev, авто-перезапуск через tsx watch):
npm run dev -w @nb/bridge
# либо одноразово:
npm run start -w @nb/bridge

# 4) (для e2e) поднять симулятор устройства, говорящий по протоколу:
npm run dev -w @nb/device-sim
```

Точечный typecheck: `npx tsc -p apps/bridge/tsconfig.json --noEmit`.

## Переменные окружения

| Переменная        | Default                  | Назначение                         |
| ----------------- | ------------------------ | ---------------------------------- |
| `MQTT_URL`        | `mqtt://localhost:1883`  | URL брокера Mosquitto               |
| `BRIDGE_WS_PORT`  | `8090`                   | Порт WS-сервера для браузера/портала|
| `DATABASE_URL`    | локальный docker Postgres| Postgres (читается `@nb/db`)        |

## Топик → DB маппинг (MQTT)

Подписки (wildcard `+` = `deviceId`, он же заводской `brew_devices.hardwareId`):

| Топик                       | Валидация       | Действие в БД                                                                                                                |
| --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `brewforge/+/telemetry`     | `TelemetrySchema` | Резолв устройства по `hardwareId`. Upsert `brew_devices.{lastSeenAt=now, status="online", fw}`. INSERT lean-строки `brew_telemetry` (`deviceId, ts, seq, stage, primaryC, setpointC, heatDutyPct, payload=полный снимок`); если есть активная партия (`brew_batches.deviceId` в статусе `brewing/fermenting`) — проставляется `brewBatchId`. Фан-аут владельцам по WS. |
| `brewforge/+/status`        | мягкая (строка/объект) | UPDATE `brew_devices.status` → `online`/`offline`/`unknown` (+ `lastSeenAt`/`fw` если online).                              |
| `brewforge/+/cmd/ack`       | `AckSchema`     | UPDATE `device_commands` по `id == ack.ackOf`: `status = acked|failed`, `reason`, `ackedAt=now`. Фан-аут ack по WS.          |
| `brewforge/+/log`           | минимальная (`type`) | INSERT `brew_log_events` (`deviceId, ts, type, payload`) + `brewBatchId` активной партии.                                   |

Невалидные payload-ы **отбрасываются** — процесс никогда не падает (всё в
try/catch, ошибки логируются). Аутентификация **устройств** — на брокере
(per-device bearer); мост доверяет топикам, прошедшим аутентификацию брокера.

## WS-контракт и модель auth/ownership

Сервер: `ws://localhost:${BRIDGE_WS_PORT}/`.

**Auth (хендшейк):** клиент передаёт сырой токен сессии портала (значение
HTTP-only cookie `nb_session`) **в заголовке `Sec-WebSocket-Protocol`, НЕ в URL**
— иначе токен утекает в access/proxy-логи и Referer. В браузере это делается
через аргумент `protocols` конструктора WebSocket, двумя суб-протоколами:

```js
new WebSocket(`ws://host:${PORT}/`, ["nb-bridge-v1", rawNbSession]);
```

Мост выбирает к эхо-ответу `Sec-WebSocket-Protocol` ТОЛЬКО `nb-bridge-v1`
(никогда сам токен), берёт второй offered-протокол как токен, хэширует его
sha256 (схема `@nb/auth.hashToken`) и ищет живую сессию в `sessions → users` →
`userId`. Нет токена / просрочена сессия → закрытие с кодом `4401`. Токен нигде
не логируется.

> Альтернатива (prod-friendly): вместо длинноживущего `nb_session` выдавать
> короткоживущий одноразовый bridge-ticket тем же механизмом суб-протокола.

**Ownership:** подписка и команда на устройство разрешены, только если
`brew_devices.userId == userId` сессии (проверка на **каждое** действие, не
доверяем подписке). Чужую телеметрию клиент не получает в принципе.

**Команды:** на клиента — sliding-window rate-limit (10 команд / 10 с). Принятая
команда (`CommandSchema`) пишется строкой аудита `device_commands` (`status=sent`)
и публикуется в `brewforge/<id>/cmd` (QoS1). Ack из `.../cmd/ack` переводит строку
в `acked/failed`.

Сообщения (JSON):

```jsonc
// client → bridge
{ "type": "subscribe",   "deviceId": "bf-xxxx" }
{ "type": "unsubscribe", "deviceId": "bf-xxxx" }
{ "type": "command",     "deviceId": "bf-xxxx", "command": { /* Command */ } }

// bridge → client
{ "type": "ready" }
{ "type": "subscribed"  , "deviceId": "bf-xxxx" }
{ "type": "unsubscribed", "deviceId": "bf-xxxx" }
{ "type": "telemetry",   "deviceId": "bf-xxxx", "data": { /* Telemetry */ } }
{ "type": "ack",         "deviceId": "bf-xxxx", "data": { /* Ack */ } }
{ "type": "command-accepted", "deviceId": "bf-xxxx", "commandId": "<uuid>" }
{ "type": "error", "error": "<reason>" }
```

> Production follow-up: брокер сейчас anonymous + без TLS
> (`infra/mosquitto/mosquitto.conf`). Для прода — TLS (8883), per-device
> логины/mTLS и топик-ACL `brewforge/<deviceId>/#`. WS-токен — короткоживущий.
