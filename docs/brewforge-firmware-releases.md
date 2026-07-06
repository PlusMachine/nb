# BrewForge: версии прошивки, релизы и OTA-обновления

Спека системы версионирования и доставки обновлений прошивки BrewForge.
Портальная сторона — этот репозиторий (`nb`), прошивочная — `../brewforge`.
Правила версионирования и релизный процесс прошивки — `../brewforge/docs/RELEASE.md` (источник истины для той стороны).

Статус: спека принята 2026-07-06; фазы F1–F3 РЕАЛИЗОВАНЫ 2026-07-06 (обе стороны, сборка/тесты зелёные; живой OTA-прогон на плате не делался — обязателен перед первым релизом).

---

## 1. Что уже есть (фундамент)

Прошивка (ESP-IDF, ESP32-S3):
- A/B OTA-партиции `ota_0`/`ota_1` по 4 МБ (`partitions.csv`), офсеты заморожены.
- `esp_https_ota` с подписью образа (Secure Boot V2 signed-app-on-update, dev-ключ `secure_boot_signing_key.pem`), rollback + self-test (`bf_ota_mark_valid_if_pending`).
- Гейт безопасности: OTA стартует и продолжается только в `BF_STAGE_IDLE`.
- Триггер: `POST /ota {"url":"https://..."}` (только LAN). Прогресс — в MQTT `.../log` (`{"ota":"begin|write|done|failed|verified|rollback",...}`).

Портал:
- `brew_devices.fw` — текущая версия устройства (строка), приходит в конверте телеметрии и в retained `.../status`, отображается на странице настроек устройства.
- Пуш-инфраструктура: `@nb/push` (`sendPushToUser`), детекторы в `apps/bridge`.
- MQTT-мост `apps/bridge` с доступом к Postgres.

Чего не было: единого источника версии, реестра релизов, раздачи `.bin`, облачного триггера OTA, проверки обновлений и уведомлений.

## 2. Версия прошивки: единый источник

- **Источник истины — `version.txt` в корне `../brewforge`** (semver, например `2.1.0` или `2.1.0-dev`).
- Корневой `CMakeLists.txt` читает его в `PROJECT_VER` → версия попадает в `esp_app_desc_t.version` (то, что проверяет OTA/rollback).
- `BF_FW_VERSION`-хардкод в `bf_proto.h` упразднён: поле `fw` в телеметрии/статусе/HTTP берётся из `esp_app_get_description()->version`.
- Инвариант: **строка `fw`, которую видит портал ≡ версия образа, которую проверяет OTA.**
- Оси версий не смешивать:
  - `fw` (semver) — версия прошивки, двигается каждым релизом;
  - `schema` (`BF_PROTO_SCHEMA`, сейчас 1) — версия JSON-протокола, bump только при ломающем изменении сообщений; добавление нового топика/поля — НЕ bump;
  - `BF_CONFIG_VERSION` / `BF_NET_CFG_VERSION` / `BF_SNAPSHOT_VERSION` — версии структур в NVS/SPIFFS со своими миграциями.

Semver-семантика и релизный чеклист — в `../brewforge/docs/RELEASE.md`.

## 3. Реестр релизов (портал)

Таблица `firmware_releases` (`packages/db/src/schema.ts`):

| поле | тип | назначение |
|---|---|---|
| `id` | uuid pk | |
| `providerId` | text, default `brewforge` | под будущие ревизии железа |
| `version` | text | semver; uniq вместе с `providerId` |
| `channel` | text enum `stable\|beta` | MVP публикует в `stable` |
| `protocolSchema` | int | значение `schema`, с которым собран релиз |
| `notes` | text | changelog по-русски, показывается пользователю |
| `fileName`, `fileSize`, `fileSha256` | text/int/text | атрибуты `.bin` |
| `storagePath` | text | путь к файлу относительно `FIRMWARE_STORAGE_DIR` |
| `publishedAt` | timestamp | null = черновик, не раздаётся |
| `yankedAt` | timestamp null | отзыв битого релиза |
| `createdAt` | timestamp | |

Бинарники лежат на диске: `FIRMWARE_STORAGE_DIR` (env, дефолт `<repo>/storage/firmware`), файл `<version>/brewforge-<version>.bin`. Каталог в `.gitignore`.

Сравнение версий — semver-компаратор в `apps/web/features/firmware/versions.ts` (чистая функция, поддерживает `-dev`/`-beta` суффиксы: prerelease < release).

## 4. Публикация релиза

CLI-скрипт (по образцу остальных dev-утилит):

```
npm run firmware:publish -- --file ../brewforge/build/brewforge.bin \
  --version 2.1.0 --notes "Что нового..." [--channel stable] [--schema 1]
```

Скрипт: валидирует semver, считает sha256/size, копирует файл в стор, создаёт запись с `publishedAt=now`. Повторная публикация той же версии — ошибка (защита от подмены бинарника под тем же номером); отзыв — `--yank --version X.Y.Z`.

Admin-UI загрузки релизов — v2, пока хватает CLI.

## 5. Раздача и проверка обновлений (контракт устройство↔портал)

### 5.1 Скачивание образа
`GET /api/firmware/download/<version>` — стримит `.bin`.
Авторизация: `Authorization: Bearer <device-token>` (тот же per-device токен, что для LAN/MQTT). Отдаёт только опубликованные, не отозванные релизы.

### 5.2 Манифест (pull-проверка)
`GET /api/firmware/manifest?current=<ver>` — авторизация device-токеном. Ответ:

```json
{ "schema": 1, "updateAvailable": true,
  "latest": { "version": "2.1.0", "url": "https://…/api/firmware/download/2.1.0",
              "sha256": "…", "size": 1234567, "protocolSchema": 1, "notes": "…" } }
```

### 5.3 Push-оповещение устройства (основной канал)
Новый retained-топик `brewforge/<deviceId>/update` (портал → устройство), схема в `@nb/brewforge-protocol`:

```json
{ "schema": 1, "version": "2.1.0", "url": "https://…", "sha256": "…",
  "size": 1234567, "protocolSchema": 1, "notes": "…" }
```

- Публикует **мост**: увидев телеметрию/статус устройства с `fw` старше последнего stable-релиза, публикует retained update (once per (device, version)). Когда устройство догнало latest — публикует пустой retained (очистка).
- Устройство: подписано на `.../update`, хранит «доступно обновление X» в состоянии comms, показывает read-only бейдж на LCD (Настройки → «Удалённо») и отдаёт аддитивным полем `"update":{"version":…}|null` в `GET /config` (эндпоинта `/status` у устройства нет). Retained ⇒ устройство узнаёт об обновлении сразу при подключении — это и есть «проверка обновлений на самой автоматике» без polling.
- Добавление топика — аддитивно, `schema` остаётся 1.

### 5.4 Запуск OTA
- LAN: существующий `POST /ota {"url": …}` (без изменений).
- Облако: новая команда в `.../cmd`: `{"cmd":"ota","url":"https://…"}` → прошивка зовёт `bf_ota_start(url)`, ack в `.../cmd/ack`. Все гейты (IDLE-only, подпись, rollback) — без изменений.
- Скачивая образ, прошивка передаёт свой bearer-токен в `Authorization` (расширение `bf_ota_start` заголовком).
- Прогресс наружу — как раньше, через `.../log`; мост складывает в `brew_log_events`.

## 6. Уведомления пользователю

- **UI-бейдж**: страница настроек устройства (`/app/devices/[id]/settings`) — блок «Прошивка»: текущая версия, доступная версия, changelog, кнопка «Обновить» (шлёт команду `ota` по облаку или `POST /ota` по LAN — через существующий транспортный слой). Кнопка недоступна, когда устройство не в IDLE или офлайн.
- **Web-push**: мост при первом обнаружении пары (device, newer-release) шлёт владельцу пуш «Доступно обновление BrewForge X.Y.Z», `url` → страница настроек устройства. Дедуп — колонка `brew_devices.updateNotifiedFw` (последняя версия, о которой уведомляли).

## 7. Автообновление (v2, не реализовано)

Пер-девайс тумблер «обновлять автоматически»: устройство, имея retained update и флаг, само запускает OTA после N минут непрерывного IDLE. Требует bump `BF_CONFIG_VERSION` (новое поле конфига) + миграцию + поле в форме конфига портала. Сознательно отложено: сначала прогнать ручной OTA-путь вживую на плате.

## 8. Правила совместимости для агентов (обязательные)

Продублированы в `CLAUDE.md` обоих репо. Суть: правки, затрагивающие любую из осей ниже, требуют **явно остановиться и спросить пользователя** про совместимость и bump версий, а не молча менять:

- JSON-контракт (`@nb/brewforge-protocol` ↔ `bf_proto.*`, топики MQTT, HTTP-эндпоинты устройства, pairing);
- `BF_PROTO_SCHEMA` (ломающее изменение сообщений);
- `BF_CONFIG_VERSION` / `BF_NET_CFG_VERSION` / `BF_SNAPSHOT_VERSION` (структуры NVS/SPIFFS — нужна миграция);
- `partitions.csv` (смена офсетов = кирпич для OTA, только USB-перепрошивка);
- ключ подписи OTA (новый ключ ⇒ старые устройства не примут образ).

Релиз без изменения `version.txt` не собирается в паблик: публикация той же версии повторно запрещена реестром.

## 9. Фазы реализации

- **F1 — версия как артефакт** (прошивка): `version.txt` → `PROJECT_VER` → `fw`; `docs/RELEASE.md`; правила в `CLAUDE.md`.
- **F2 — реестр и раздача** (портал): таблица+миграция, `features/firmware/*`, `firmware:publish`, download/manifest эндпоинты.
- **F3 — доставка и уведомления**: топик `update` + команда `ota` в протоколе и прошивке, детектор в мосте + пуш, блок «Прошивка» в настройках устройства.
- **v2 (отложено)**: автообновление по флагу, admin-UI релизов, CI-сборка (GitHub Actions + espressif/idf, подпись прод-ключом из секрета), канал `beta`, поддержка hw-ревизий через `providerId`.

⚠️ OTA-механика прошивки собрана и покрыта self-test/rollback-логикой, но **живое обновление на плате ещё не прогонялось** — первый прод-релиз делать только после стендового прогона полного цикла (publish → пуш → кнопка → OTA → rollback-сценарий).
