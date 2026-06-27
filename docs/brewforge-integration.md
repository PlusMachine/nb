# BrewForge ↔ nb — интеграция контроллера пивоварения

Подключение аппаратного контроллера **BrewForge** (ESP32-S3, прошивка в соседнем
репозитории `../brewforge`) к порталу nb: пуш рецепта на устройство, живой
мониторинг и управление варкой из **мастера рецептов → режим варки**, плюс
настройки устройства и историю.

Полный план/протокол на стороне прошивки: `../brewforge/docs/PHASE2-4_PLAN.md`.

## Архитектура

```
Устройство (ESP32-S3)  ──┬─ on-device WS/REST (LAN, напрямую)
  components/comms       │
  bf_state_get/bf_cmd    └─ MQTT-over-TLS ── Mosquitto ── apps/bridge ── Postgres
                                                              │ (@nb/db)
                                                              └─ WS → браузер
Портал (Next.js apps/web)
  features/brew-controller  — провайдер устройства (brewforgeProvider) + транслятор рецепта
  features/devices          — пайринг, токены, профили конфигурации
  features/brew-batches     — жизненный цикл варки + live-дашборд + график
  app/api/devices/*, app/api/brew-batches/[id]/{telemetry,telemetry/history,command,config}
```

- **Контракт** заморожен в пакете `@nb/brewforge-protocol` (zod: Telemetry, Command,
  Ack, DeviceRecipe, DeviceConfig; `topics(deviceId)`). Это единый источник истины
  на TS-стороне; прошивка зеркалит его в cJSON.
- **Два транспорта, один JSON.** LAN-путь (`lanTransport`) ходит на `device.localUrl`
  напрямую (REST/WS) — работает без брокера, годится для стенда и симулятора.
  Облачный путь — через `apps/bridge` (MQTT↔WS↔Postgres).
- **Безопасность управления нагревом** живёт на устройстве: интерлоки §5,
  opt-in `remote_control_enabled` + rate-limit на heat-команды, кламп safety-полей
  в `PUT /config`. Портал ничего из этого не ослабляет.

## Быстрый старт (e2e против симулятора, без железа)

```bash
# 1) Симулятор устройства (говорит замороженным протоколом по REST/WS/SSE)
npm run dev -w @nb/device-sim          # слушает http://localhost:8080, deviceId bf-sim01

# 2) Портал
docker compose up -d postgres          # БД
npm run dev                            # миграции+сид, затем Next.js (apps/web)
```

В dev (`NODE_ENV!=='production'`) SSRF-гард разрешает `localhost`, так что портал
ходит к симулятору. (Иначе выставить `BREWFORGE_ALLOW_LOOPBACK_DEVICE=1`.)

**Сценарий демо:**
1. Привязать устройство: `/app/devices` → «Привязать», `localUrl=http://localhost:8080`
   (+ claim-код, который печатает симулятор). Токен показывается один раз.
2. Открыть рецепт в мастере рецептов → **«Сварить на устройстве»** → выбрать
   устройство → подтвердить (предупреждение «включит нагрев»).
   Портал транслирует `brew_plan_v1 → §6.1`, делает `PUT /recipe`, шлёт `START_BREW`,
   и переходит на live-дашборд `/app/brew-batches/<id>`.
3. На дашборде: живые температуры/стадия/таймер/скважность/насос/интерлоки, ответы
   на промпты (Add malt / Iodine / …), а ниже — исторический график. Управление
   (Pause/Resume/Skip/**E-STOP**) идёт через `POST …/command`.

## Облачный путь (MQTT)

```bash
docker compose up -d mosquitto postgres
npm run dev -w @nb/bridge               # подписка на brewforge/+/{telemetry,status,cmd/ack,log}
```

Мост пишет телеметрию/логи/ack в Postgres и раздаёт браузеру по WS (токен —
в `Sec-WebSocket-Protocol`, не в URL; владение проверяется per-device). Устройство
аутентифицируется к брокеру per-device токеном. TLS/пароли брокера — продакшен-шаг.

## Карта файлов

| Область | Путь |
|---|---|
| Контракт протокола | `packages/brewforge-protocol/src/*` |
| Симулятор | `apps/device-sim/*` |
| Мост + брокер | `apps/bridge/*`, `infra/mosquitto/mosquitto.conf`, `docker-compose.yml` |
| Провайдер + транслятор + транспорт | `apps/web/features/brew-controller/*` |
| Пайринг/устройства/профили | `apps/web/features/devices/*` |
| Маршруты API | `apps/web/app/api/devices/*`, `apps/web/app/api/brew-batches/[id]/*` |
| Live-дашборд + график + brew-mode | `apps/web/features/brew-batches/components/*`, `app/(app)/app/brew-batches/[id]`, мастер рецептов `components/recipes/recipe-designer.tsx` |
| Настройки устройства | `app/(app)/app/devices/[id]/settings`, `features/devices/components/device-config-form.tsx` |
| Схема БД | `packages/db/src/schema.ts` (`brew_devices`, `device_pairing_tokens`, `brew_telemetry`, `brew_log_events`, `device_commands`, `device_profiles`) |

## Env-флаги (все по умолчанию безопасны)

| Флаг | Назначение |
|---|---|
| `BREWFORGE_ALLOW_LOOPBACK_DEVICE` | разрешить loopback-устройство (симулятор) вне dev |
| `BREWFORGE_LAN_TRANSPORT_DISABLED` | полностью запретить LAN-транспорт (чисто облачный деплой) |
| `BREWFORGE_ALLOW_UNVERIFIED_LAN_CLAIM` | разрешить пайринг по одному `hardwareId` без claim-кода (по умолчанию off) |
| `MQTT_URL`, `BRIDGE_WS_PORT`, `DATABASE_URL` | конфиг моста |

## Тесты / проверка

```bash
npx tsc -p apps/web/tsconfig.json --noEmit      # портал
npx tsc -p apps/bridge/tsconfig.json --noEmit   # мост
npm run typecheck -w @nb/db                      # схема
# vitest: транслятор рецепта + SSRF-гард транспорта
( cd apps/web && TMPDIR=/tmp npx vitest run features/brew-controller )
```

> БД-миграции для новых таблиц лежат в `packages/db/drizzle` (сгенерированы
> `db:generate`); применить через `npm run db:migrate` на поднятом Postgres.
