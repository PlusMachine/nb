# @nb/device-sim

Lightweight TypeScript simulator of a **BrewForge** controller. It speaks the
frozen [`@nb/brewforge-protocol`](../../packages/brewforge-protocol) contract
(`schema: 1`) so the portal's `brewforge-provider`, recipe translator and live
dashboard can be built and demoed **without the physical ESP32-S3 board**.

It holds mutable telemetry state, runs a small accelerated fake brew FSM, and
exposes the protocol over REST + WebSocket (+ SSE). Every telemetry envelope it
emits passes `TelemetrySchema.parse`; every inbound command is validated with
`CommandSchema`; recipes are validated with `DeviceRecipeSchema`.

## Run

```bash
# from repo root
npm run dev -w @nb/device-sim
# or directly
npx tsx apps/device-sim/src/main.ts --port 8080 --scenario mash
```

### Flags

| Flag           | Default     | Meaning                                            |
| -------------- | ----------- | -------------------------------------------------- |
| `--port`       | `8080`      | HTTP + WebSocket port                              |
| `--device-id`  | `bf-sim01`  | device identifier (used in envelopes + topics)     |
| `--tick-ms`    | `1000`      | real wall-clock tick interval (telemetry rate)     |
| `--tick-scale` | `60`        | brew-seconds advanced per real second (speed-up)   |
| `--scenario`   | `idle`      | `idle` \| `mash` \| `fault` startup scenario       |
| `--fw`         | `sim-0.0.0` | firmware string reported in telemetry              |

With the default `--tick-scale 60`, a 60-minute mash step completes in ~60 real
seconds.

## Endpoints

| Method | Path                | Body / Result                                  |
| ------ | ------------------- | ---------------------------------------------- |
| GET    | `/telemetry`        | current `Telemetry` snapshot                   |
| POST   | `/cmd`              | `Command` → `Ack` (200 ok / 422 nack)          |
| PUT    | `/recipe?slot=N`    | `DeviceRecipe` → `{ slot }` (422 on invalid)   |
| GET    | `/config`           | sim config, slot map, MQTT topic map           |
| GET    | `/log`              | `{ entries: LogEntry[] }`                       |
| GET    | `/events`           | SSE stream of telemetry (no client deps)       |
| GET    | `/health`           | `{ ok: true }`                                 |
| WS     | `/ws`               | telemetry stream ~1 Hz; send command → `Ack`   |

### WebSocket frames

Outbound: `{ kind: "telemetry", data: Telemetry }`, `{ kind: "ack", data: Ack }`,
`{ kind: "error", error: string }`.
Inbound: a bare `Command` JSON, or `{ "cmd": Command }`.

## Examples

```bash
# read telemetry
curl -s localhost:8080/telemetry | jq .

# push a recipe to slot 1 (must satisfy DeviceRecipeSchema)
curl -s -X PUT 'localhost:8080/recipe?slot=1' -H 'content-type: application/json' -d '{
  "schema": 1, "name": "Test IPA", "units": "C",
  "mash": { "doughInTempC": null, "pidDuringDoughIn": true,
            "steps": [{ "name": "Sacch", "tempC": 66, "timeMin": 60 }],
            "mashOut": { "tempC": 78, "timeMin": 10 } },
  "boil": { "boilTimeMin": 60, "boilTempC": null,
            "hops": [{ "name": "Citra", "amountG": 40, "atMinBeforeEnd": 10 }] },
  "hopStand": [{ "tempC": 80, "timeMin": 20 }],
  "whirlpool": "hot", "cooling": { "targetC": 20 }
}'
# → { "slot": 1 }

# start a brew on slot 1 (CommandSchema)
curl -s -X POST localhost:8080/cmd -H 'content-type: application/json' -d '{
  "id": "11111111-1111-1111-1111-111111111111",
  "ts": 0, "type": "START_BREW", "arg": { "i": 1 }
}'
# → { "ackOf": "...", "ok": true, "reason": "OK", "ts": ... }

# acknowledge the current prompt (ADD_MALT / IODINE) using promptSeq from telemetry
curl -s -X POST localhost:8080/cmd -H 'content-type: application/json' -d '{
  "id": "22222222-2222-2222-2222-222222222222",
  "ts": 0, "type": "ACK_PROMPT", "arg": { "ans": "OK", "promptSeq": 1 }
}'

# emergency stop
curl -s -X POST localhost:8080/cmd -H 'content-type: application/json' \
  -d '{ "id":"33333333-3333-3333-3333-333333333333","ts":0,"type":"ESTOP" }'
```

## Behaviors

### Brew FSM (accelerated)

`START_BREW(slot)` builds a plan from the slot recipe and walks:
`IDLE → DOUGH_IN → PROMPT_ADD_MALT → MASH_STEP×N → PROMPT_IODINE → MASH_OUT →
BOIL_RAMP → BOILING → HOP_STAND×N → COOLING → DONE`.

Timed stages auto-advance on the accelerated timer. The two **prompt** stages
(`ADD_MALT`, `IODINE`) raise a prompt (bumping `promptSeq`) and wait for an
`ACK_PROMPT` command before advancing. Temperature follows the active setpoint
via a simple thermal model; PID stages compute a proportional `heatDutyPct`,
boil stages report 85 % `boilPct`.

### Commands

`START_BREW`, `SELECT_RECIPE`, `PAUSE`, `RESUME`, `STOP`, `SKIP_STAGE`,
`ACK_PROMPT`, `ENTER_MANUAL`, `EXIT_MANUAL`, `MANUAL_SETPOINT`, `MANUAL_PWM`,
`MANUAL_HEAT`, `MANUAL_PUMP`, `START_AUTOTUNE` (stub), `ESTOP`, `CLEAR_FAULT`,
`SAVE_SETTINGS`. Invalid commands → `Ack{ ok:false, reason:"VALIDATION" }`;
starting under a fault → `REJECTED_INTERLOCK`.

### Faults / safety

`ESTOP` and the `fault` scenario set a `faultMask` (E-stop / sensor), force
`stage = FAULT`, drop all outputs and `heatingPermitted=false`. `CLEAR_FAULT`
clears the mask and returns to `IDLE`. This mirrors the firmware invariant:
fault → heat OFF.
