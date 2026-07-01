// =============================================================================
//  @nb/device-sim — sim-device.ts
//  Симулированный контроллер BrewForge: изменяемое состояние телеметрии +
//  упрощённый конечный автомат варки. Говорит на замороженном протоколе
//  @nb/brewforge-protocol (schema:1). Железо не требуется.
//
//  Время варки УСКОРЕНО: на каждый реальный тик (tickMs) проходит
//  tickScale «варочных» секунд. Так 60-минутный шаг затирания пролетает
//  за секунды и фронт/мост можно гонять против живой телеметрии.
// =============================================================================
import {
  PROTOCOL_SCHEMA_VERSION,
  STAGE_NUM,
  HEAT_MODE_NUM,
  PROMPT_NUM,
  FAULT_BITS,
  FAULT_NAMES,
  stageName,
  decodeFaults,
  CommandSchema,
  DeviceRecipeSchema,
  TelemetrySchema,
  DeviceConfigSchema,
  DeviceConfigPatchSchema,
  CONFIG_FIELD_RANGES,
  type Stage,
  type HeatMode,
  type Prompt,
  type Telemetry,
  type Command,
  type Ack,
  type AckReason,
  type DeviceRecipe,
  type Fault,
  type DeviceConfig,
  type DeviceConfigPatch,
  type ConfigFieldKey,
} from "@nb/brewforge-protocol";

// ----------------------------- Конфигурация --------------------------------
export interface SimConfig {
  deviceId: string;
  fw: string;
  /** Интервал реального тика, мс (как часто пересчитываем и шлём телеметрию). */
  tickMs: number;
  /** Сколько «варочных» секунд проходит за одну реальную секунду (ускорение). */
  tickScale: number;
  /** Стартовый сценарий: простой / сразу затирание / отказ датчика. */
  scenario: Scenario;
}

export type Scenario = "idle" | "mash" | "fault";

export interface LogEntry {
  ts: number;
  seq: number;
  level: "info" | "warn" | "error";
  msg: string;
}

type TelemetryListener = (t: Telemetry) => void;

// ----------------------------- План варки ----------------------------------
// Каждый шаг FSM описывается так. duration=0 + prompt → ждём ACK_PROMPT.
interface PlanStep {
  stage: Stage;
  durationSec: number; // варочные секунды; 0 = бессрочно (промпт/ожидание)
  setpointC: number;
  heatMode: HeatMode;
  prompt?: Prompt; // если шаг ждёт подтверждения промпта
  pump: boolean;
  spargeHeat?: boolean;
  boil?: boolean; // стадия кипения (boilPct активен)
  mashStepIndex: number; // -1 если неприменимо
  hopStandIndex: number; // -1 если неприменимо
  status: string;
}

const AMBIENT_C = 20;
// Тепловая модель демо (на «варочную» секунду): dT/dt = K_HEAT·duty − K_LOSS·(T−amb).
// Связывает мощность (heatDutyPct) с реальным нагревом — инерция, недогрев, overshoot,
// плато кипения, охлаждение. Раньше темп «волшебно» тянулась к уставке мимо мощности.
const K_HEAT = 0.05; // полный нагрев при duty=100%, °C/варочную-сек
const K_LOSS = 0.0004; // ньютоновские потери к окружающей
const K_COOL = 0.02; // активное охлаждение (стадия COOLING)
const BOIL_PLATEAU_C = 100; // плато кипения: лишняя мощность идёт в пар, не в температуру
// Sim dead-man (паритет безопасности с firmware-контрактом, §docs/brewery-command-center.md):
// ручной нагрев гаснет на «плате» при потере heartbeat командного источника и по max-длительности.
// Для Phase 0 любой принятый command = heartbeat; выделенная heartbeat-команда — Phase 3 с прошивкой.
const MANUAL_HEAT_TTL_MS = 45_000; // нет команд >45с в Manual с нагревом → нагрев OFF
const MANUAL_HEAT_MAX_MS = 30 * 60_000; // суммарно >30 мин MANUAL_HEAT → авто-OFF + выход
// Ленивое (pull-driven) продвижение sim в веб-рантайме БЕЗ фонового таймера
// (advanceToNow): разовый catch-up ограничен, чтобы после простоя (никто не смотрел)
// варка не «телепортировалась» на часы вперёд. Реальный опрос идёт чаще этого порога.
const MAX_CATCHUP_MS = 5_000;
const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

// ----------------------------- Конфиг §6.3 (round-trip) ---------------------
// Дефолт = точный JSON прошивки (см. packages/brewforge-protocol/src/config.test.ts,
// BF_MAX_SENSORS=5), чтобы sim был неотличим от платы по форме и стартовым значениям.
const DEFAULT_DEVICE_CONFIG: DeviceConfig = DeviceConfigSchema.parse({
  units: 0,
  pid: { kp: 100, ki: 0.4, kd: 100, sampleMs: 3000, windowMs: 5000, pidStartBandC: 2, ponMeasurement: false },
  pump: { cycleMin: 10, restMin: 1, stopTempC: 92, primeCycles: 2, paddleMode: false, heatDuringRest: false },
  boil: { tempC: 100, heatPct: 70 },
  safety: { overshootCutC: 5, absMaxC: 105, maxDtPerSec: 2, sensorFaultCycles: 3, stageTimeoutMin: 120 },
  filterBeta: 1.0,
  interHeaterDelayMs: 10,
  buzzer: true,
  spargeHeating: false,
  iodineTest: true,
  removeMaltPrompt: true,
  sensorCal: [
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
    { scale: 1, offset: 0 },
  ],
});

/** Клампит числовое поле в диапазон CONFIG_FIELD_RANGES (паритет с bf_config_parse_json_clamped). */
const clampField = (path: ConfigFieldKey, v: number): number => {
  const desc = CONFIG_FIELD_RANGES[path];
  return desc.kind === "number" ? clamp(v, desc.min, desc.max) : v;
};

/**
 * Слить патч §6.3 в текущий конфиг: присутствующие поля клампятся в безопасный
 * диапазон (как bf_config_parse_json_clamped на устройстве), отсутствующие —
 * не трогаются. sensorCal — патч по индексу (короче массива — трогает только
 * указанные элементы).
 */
function mergeDeviceConfig(cur: DeviceConfig, patch: DeviceConfigPatch): DeviceConfig {
  const next: DeviceConfig = { ...cur };

  if (patch.units !== undefined) next.units = patch.units;

  if (patch.pid) {
    next.pid = { ...cur.pid, ...patch.pid };
    if (patch.pid.kp !== undefined) next.pid.kp = clampField("pid.kp", patch.pid.kp);
    if (patch.pid.ki !== undefined) next.pid.ki = clampField("pid.ki", patch.pid.ki);
    if (patch.pid.kd !== undefined) next.pid.kd = clampField("pid.kd", patch.pid.kd);
    if (patch.pid.sampleMs !== undefined) next.pid.sampleMs = clampField("pid.sampleMs", patch.pid.sampleMs);
    if (patch.pid.windowMs !== undefined) next.pid.windowMs = clampField("pid.windowMs", patch.pid.windowMs);
    if (patch.pid.pidStartBandC !== undefined) {
      next.pid.pidStartBandC = clampField("pid.pidStartBandC", patch.pid.pidStartBandC);
    }
  }

  if (patch.pump) {
    next.pump = { ...cur.pump, ...patch.pump };
    if (patch.pump.cycleMin !== undefined) next.pump.cycleMin = clampField("pump.cycleMin", patch.pump.cycleMin);
    if (patch.pump.restMin !== undefined) next.pump.restMin = clampField("pump.restMin", patch.pump.restMin);
    if (patch.pump.stopTempC !== undefined) next.pump.stopTempC = clampField("pump.stopTempC", patch.pump.stopTempC);
    if (patch.pump.primeCycles !== undefined) {
      next.pump.primeCycles = clampField("pump.primeCycles", patch.pump.primeCycles);
    }
  }

  if (patch.boil) {
    next.boil = { ...cur.boil, ...patch.boil };
    if (patch.boil.tempC !== undefined) next.boil.tempC = clampField("boil.tempC", patch.boil.tempC);
    if (patch.boil.heatPct !== undefined) next.boil.heatPct = clampField("boil.heatPct", patch.boil.heatPct);
  }

  if (patch.safety) {
    next.safety = { ...cur.safety, ...patch.safety };
    if (patch.safety.overshootCutC !== undefined) {
      next.safety.overshootCutC = clampField("safety.overshootCutC", patch.safety.overshootCutC);
    }
    if (patch.safety.absMaxC !== undefined) next.safety.absMaxC = clampField("safety.absMaxC", patch.safety.absMaxC);
    if (patch.safety.maxDtPerSec !== undefined) {
      next.safety.maxDtPerSec = clampField("safety.maxDtPerSec", patch.safety.maxDtPerSec);
    }
    if (patch.safety.sensorFaultCycles !== undefined) {
      next.safety.sensorFaultCycles = clampField("safety.sensorFaultCycles", patch.safety.sensorFaultCycles);
    }
    if (patch.safety.stageTimeoutMin !== undefined) {
      next.safety.stageTimeoutMin = clampField("safety.stageTimeoutMin", patch.safety.stageTimeoutMin);
    }
  }

  if (patch.filterBeta !== undefined) next.filterBeta = clampField("filterBeta", patch.filterBeta);
  if (patch.interHeaterDelayMs !== undefined) {
    next.interHeaterDelayMs = clampField("interHeaterDelayMs", patch.interHeaterDelayMs);
  }
  if (patch.buzzer !== undefined) next.buzzer = patch.buzzer;
  if (patch.spargeHeating !== undefined) next.spargeHeating = patch.spargeHeating;
  if (patch.iodineTest !== undefined) next.iodineTest = patch.iodineTest;
  if (patch.removeMaltPrompt !== undefined) next.removeMaltPrompt = patch.removeMaltPrompt;

  if (patch.sensorCal) {
    next.sensorCal = cur.sensorCal.map((sensor, i) => {
      const p = patch.sensorCal?.[i];
      if (!p) return sensor;
      return {
        ...sensor,
        scale: p.scale !== undefined ? clampField("sensorCal.scale", p.scale) : sensor.scale,
        offset: p.offset !== undefined ? clampField("sensorCal.offset", p.offset) : sensor.offset,
      };
    });
  }

  return next;
}

// ----------------------------- Встроенный рецепт ---------------------------
// Валидный DeviceRecipe для слота 0 (демо «American Pale Ale»).
function defaultRecipe(): DeviceRecipe {
  return DeviceRecipeSchema.parse({
    schema: PROTOCOL_SCHEMA_VERSION,
    name: "Demo Pale Ale",
    units: "C",
    mash: {
      doughInTempC: null, // устройство вычислит
      pidDuringDoughIn: true,
      steps: [
        { name: "Beta", tempC: 64, timeMin: 45 },
        { name: "Alpha", tempC: 72, timeMin: 15 },
      ],
      mashOut: { tempC: 78, timeMin: 10 },
    },
    boil: {
      boilTimeMin: 60,
      boilTempC: null,
      hops: [
        { name: "Magnum", amountG: 30, atMinBeforeEnd: 60 },
        { name: "Cascade", amountG: 25, atMinBeforeEnd: 15 },
        { name: "Citra", amountG: 25, atMinBeforeEnd: 0 },
      ],
    },
    hopStand: [{ tempC: 80, timeMin: 20 }],
    whirlpool: "hot",
    cooling: { targetC: 20 },
  });
}

// =============================================================================
//  SimDevice
// =============================================================================
export class SimDevice {
  readonly cfg: SimConfig;

  // --- слоты рецептов (0..7) ---
  private readonly slots: (DeviceRecipe | null)[] = new Array(8).fill(null);

  // --- изменяемое состояние ---
  private seq = 0;
  private promptSeq = 0;
  private uptimeSec = 0;

  private stage: Stage = "IDLE";
  private pausedFrom: Stage = "IDLE";
  private faultMask = 0;

  private setpointC = 0;
  private heatMode: HeatMode = "OFF";
  private heatDutyPct = 0;
  private heatOn = false;
  private spargeHeatOn = false;
  private pumpOn = false;
  private boilPct = 0;

  private primaryC = AMBIENT_C;

  private activeRecipe = -1;
  private recipeName = "";
  private statusLine = "Готов";

  private manualPwm = 0;
  private manualSetpoint = 65;

  // --- конфиг §6.3 (настраиваемый, несекретный; round-trip GET/PUT /config) ---
  private deviceConfig: DeviceConfig = structuredClone(DEFAULT_DEVICE_CONFIG);

  // --- sim dead-man (паритет с firmware safety-контрактом) ---
  private lastCmdAt = Date.now(); // последний принятый command = heartbeat
  private manualHeatSince = 0; // когда включён MANUAL-нагрев (0 = выкл)

  // --- план варки ---
  private plan: PlanStep[] = [];
  private stepIdx = 0;
  private stageElapsed = 0; // варочные секунды в текущем шаге
  private waitingAck = false;
  private activePrompt: Prompt = "NONE";

  private readonly log: LogEntry[] = [];
  private readonly listeners = new Set<TelemetryListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  // --- ленивое продвижение (веб-встраивание без setInterval) ---
  private pendingMs = 0; // накопитель дробного реального времени между advanceToNow
  private lastRealAt = Date.now(); // метка последнего продвижения (wall-clock, мс)

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.slots[0] = defaultRecipe();
    this.applyScenario(cfg.scenario);
  }

  // ----------------------------- жизненный цикл ----------------------------
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.cfg.tickMs);
    this.addLog("info", `Симулятор запущен (${this.cfg.deviceId}, fw=${this.cfg.fw})`);
  }

  stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Ленивое продвижение симуляции по реальному времени — для встраивания в
   * pull-рантайм (веб-стаб демо) БЕЗ фонового setInterval. Догоняет прошедшее
   * время целыми тиками (dt = cfg.tickMs), копит дробный остаток. Разовый catch-up
   * ограничен MAX_CATCHUP_MS: после долгого простоя (никто не смотрел) варка не
   * «прыгает» на часы вперёд — при этом dead-man остаётся корректным (сверяет
   * реальные Date.now() с lastCmdAt при первом же тике). Вызывать перед snapshot()/
   * handleCommand(), чтобы состояние было актуальным на момент обращения.
   */
  advanceToNow(nowMs = Date.now()): void {
    const elapsed = clamp(nowMs - this.lastRealAt, 0, MAX_CATCHUP_MS);
    this.lastRealAt = nowMs;
    this.pendingMs += elapsed;
    const step = this.cfg.tickMs > 0 ? this.cfg.tickMs : 1000;
    let guard = 0;
    while (this.pendingMs >= step && guard < 10_000) {
      this.tick();
      this.pendingMs -= step;
      guard++;
    }
  }

  onTelemetry(fn: TelemetryListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getLog(): LogEntry[] {
    return this.log.slice(-200);
  }

  config(): {
    deviceId: string;
    fw: string;
    tickMs: number;
    tickScale: number;
    scenario: Scenario;
    schema: number;
    slots: { slot: number; name: string | null }[];
  } {
    return {
      deviceId: this.cfg.deviceId,
      fw: this.cfg.fw,
      tickMs: this.cfg.tickMs,
      tickScale: this.cfg.tickScale,
      scenario: this.cfg.scenario,
      schema: PROTOCOL_SCHEMA_VERSION,
      slots: this.listSlots(),
    };
  }

  /** Карта слотов (номер + имя рецепта, если занят) — для listSlots провайдера. */
  listSlots(): { slot: number; name: string | null }[] {
    return this.slots.map((r, i) => ({ slot: i, name: r ? r.name : null }));
  }

  /** Read-only снапшот рецепта слота («что лежит на плате»), либо null если слот пуст. */
  readSlot(slot: number): DeviceRecipe | null {
    if (slot < 0 || slot >= this.slots.length) {
      throw new Error(`Слот вне диапазона 0..${this.slots.length - 1}`);
    }
    return this.slots[slot] ?? null;
  }

  // ----------------------------- конфиг §6.3 --------------------------------
  /** Прочитать текущий эффективный (клампнутый) конфиг устройства. */
  readConfig(): DeviceConfig {
    return this.deviceConfig;
  }

  /**
   * Записать патч конфига §6.3: сливает присутствующие поля в текущий конфиг,
   * клампит по CONFIG_FIELD_RANGES (паритет с bf_config_parse_json_clamped на
   * устройстве) и возвращает эффективный конфиг. Бросает ZodError при невалидной форме.
   */
  writeConfig(raw: unknown): DeviceConfig {
    const patch = DeviceConfigPatchSchema.parse(raw); // бросит ZodError при невалидности
    this.deviceConfig = mergeDeviceConfig(this.deviceConfig, patch);
    this.addLog("info", "Конфиг обновлён (§6.3)");
    return this.deviceConfig;
  }

  // ----------------------------- приём рецепта -----------------------------
  /** Записать рецепт в слот. Возвращает индекс слота или бросает при невалидности. */
  putRecipe(raw: unknown, slot = 0): number {
    const recipe = DeviceRecipeSchema.parse(raw); // бросит ZodError при невалидности
    if (slot < 0 || slot >= this.slots.length) {
      throw new Error(`Слот вне диапазона 0..${this.slots.length - 1}`);
    }
    this.slots[slot] = recipe;
    this.addLog("info", `Рецепт «${recipe.name}» записан в слот ${slot}`);
    return slot;
  }

  // ----------------------------- приём команды -----------------------------
  /** Валидирует команду и применяет её. Всегда возвращает Ack. */
  handleCommand(raw: unknown): Ack {
    const parsed = CommandSchema.safeParse(raw);
    if (!parsed.success) {
      const id = typeof (raw as { id?: unknown })?.id === "string"
        ? (raw as { id: string }).id
        : "?";
      this.addLog("warn", `Команда отклонена (валидация): ${parsed.error.issues[0]?.message ?? "?"}`);
      return this.ack(id, false, "VALIDATION");
    }
    const cmd = parsed.data;
    this.lastCmdAt = Date.now(); // любой принятый command = heartbeat для dead-man
    const reason = this.apply(cmd);
    return this.ack(cmd.id, reason === "OK", reason);
  }

  private apply(cmd: Command): AckReason {
    switch (cmd.type) {
      case "START_BREW": {
        const slot = cmd.arg?.i ?? 0;
        const recipe = this.slots[slot];
        if (!recipe) return "VALIDATION";
        if (this.faultMask !== 0) return "REJECTED_INTERLOCK";
        this.beginBrew(slot, recipe);
        return "OK";
      }
      case "SELECT_RECIPE": {
        const slot = cmd.arg?.i ?? 0;
        const recipe = this.slots[slot];
        if (!recipe) return "VALIDATION";
        this.activeRecipe = slot;
        this.recipeName = recipe.name;
        this.statusLine = `Выбран рецепт: ${recipe.name}`;
        return "OK";
      }
      case "PAUSE": {
        if (this.stage === "PAUSED" || !this.isBrewing()) return "OK";
        this.pausedFrom = this.stage;
        this.stage = "PAUSED";
        this.heatMode = "OFF";
        this.statusLine = "Пауза";
        this.addLog("info", "Пауза");
        return "OK";
      }
      case "RESUME": {
        if (this.stage !== "PAUSED") return "OK";
        this.stage = this.pausedFrom;
        this.applyStepOutputs(this.plan[this.stepIdx]);
        this.statusLine = "Возобновлено";
        this.addLog("info", "Возобновлено");
        return "OK";
      }
      case "STOP": {
        this.reset("Остановлено пользователем");
        return "OK";
      }
      case "SKIP_STAGE": {
        if (!this.isBrewing()) return "OK";
        this.advanceStep("Шаг пропущен");
        return "OK";
      }
      case "ACK_PROMPT": {
        if (!this.waitingAck) return "OK"; // нечего подтверждать — идемпотентно
        const seq = cmd.arg?.promptSeq;
        if (seq !== undefined && seq !== this.promptSeq) {
          // ack для устаревшего промпта — игнорируем, но это не ошибка
          return "OK";
        }
        this.addLog("info", `Промпт ${this.activePrompt} подтверждён (${cmd.arg?.ans ?? "?"})`);
        this.waitingAck = false;
        this.activePrompt = "NONE";
        this.advanceStep("Промпт подтверждён");
        return "OK";
      }
      case "ENTER_MANUAL": {
        this.reset("Ручной режим");
        this.stage = "MANUAL";
        this.heatMode = "MANUAL_PWM";
        this.setpointC = this.manualSetpoint;
        this.heatDutyPct = this.manualPwm;
        this.manualHeatSince = this.manualPwm > 0 ? Date.now() : 0;
        return "OK";
      }
      case "EXIT_MANUAL": {
        if (this.stage === "MANUAL") this.reset("Выход из ручного режима");
        return "OK";
      }
      case "MANUAL_SETPOINT": {
        this.manualSetpoint = cmd.arg?.f ?? this.manualSetpoint;
        this.setpointC = this.manualSetpoint;
        return "OK";
      }
      case "MANUAL_PWM": {
        this.manualPwm = clamp(Math.round(cmd.arg?.i ?? 0), 0, 100);
        this.heatDutyPct = this.manualPwm;
        if (this.stage === "MANUAL") this.heatMode = "MANUAL_PWM";
        return "OK";
      }
      case "MANUAL_HEAT": {
        const on = cmd.arg?.b ?? false;
        this.heatMode = on ? "MANUAL_PWM" : "OFF";
        if (!on) this.heatDutyPct = 0;
        this.manualHeatSince = on ? Date.now() : 0;
        return "OK";
      }
      case "MANUAL_PUMP": {
        this.pumpOn = cmd.arg?.b ?? false;
        return "OK";
      }
      case "START_AUTOTUNE": {
        this.statusLine = "AutoTune (заглушка)";
        this.addLog("info", "AutoTune запрошен (заглушка)");
        return "OK";
      }
      case "ESTOP": {
        this.raiseFault(FAULT_BITS.ESTOP, "АВАРИЙНЫЙ СТОП (E-stop)");
        return "OK";
      }
      case "CLEAR_FAULT": {
        if (this.faultMask === 0) return "OK";
        this.faultMask = 0;
        this.reset("Отказ сброшен");
        return "OK";
      }
      case "SAVE_SETTINGS": {
        this.addLog("info", "Настройки сохранены (NVS-заглушка)");
        return "OK";
      }
      default:
        return "VALIDATION";
    }
  }

  // ----------------------------- FSM варки ---------------------------------
  private beginBrew(slot: number, recipe: DeviceRecipe): void {
    this.activeRecipe = slot;
    this.recipeName = recipe.name;
    this.plan = this.buildPlan(recipe);
    this.stepIdx = 0;
    this.stageElapsed = 0;
    this.faultMask = 0;
    this.enterStep();
    this.addLog("info", `Старт варки «${recipe.name}» (слот ${slot})`);
  }

  /** Собрать линейный план FSM из рецепта (упрощённо относительно §3). */
  private buildPlan(r: DeviceRecipe): PlanStep[] {
    const steps: PlanStep[] = [];
    const firstMashTemp = r.mash.steps[0]?.tempC ?? 65;
    const doughIn = r.mash.doughInTempC ?? firstMashTemp - 2;

    // DOUGH_IN
    steps.push({
      stage: "DOUGH_IN",
      durationSec: 120,
      setpointC: doughIn,
      heatMode: r.mash.pidDuringDoughIn ? "PID" : "OFF",
      pump: true,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: "Нагрев воды для засыпи",
    });
    // PROMPT ADD_MALT
    steps.push({
      stage: "PROMPT_ADD_MALT",
      durationSec: 0,
      setpointC: doughIn,
      heatMode: "OFF",
      prompt: "ADD_MALT",
      pump: false,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: "Засыпьте солод и подтвердите",
    });
    // MASH_STEP * N
    r.mash.steps.forEach((s, i) => {
      steps.push({
        stage: "MASH_STEP",
        durationSec: s.timeMin * 60,
        setpointC: s.tempC,
        heatMode: "PID",
        pump: true,
        mashStepIndex: i,
        hopStandIndex: -1,
        status: `Затирание: ${s.name} ${s.tempC}°C`,
      });
    });
    // PROMPT IODINE
    steps.push({
      stage: "PROMPT_IODINE",
      durationSec: 0,
      setpointC: r.mash.steps[r.mash.steps.length - 1]?.tempC ?? firstMashTemp,
      heatMode: "OFF",
      prompt: "IODINE",
      pump: false,
      mashStepIndex: r.mash.steps.length - 1,
      hopStandIndex: -1,
      status: "Йодная проба — подтвердите осахаривание",
    });
    // MASH_OUT
    if (r.mash.mashOut) {
      const mo = r.mash.mashOut;
      steps.push({
        stage: "MASH_OUT",
        durationSec: mo.timeMin * 60,
        setpointC: mo.tempC ?? 78,
        heatMode: "PID",
        pump: true,
        spargeHeat: true,
        mashStepIndex: -1,
        hopStandIndex: -1,
        status: "Мэш-аут / промывка",
      });
    }
    // BOIL_RAMP
    steps.push({
      stage: "BOIL_RAMP",
      durationSec: 180,
      setpointC: r.boil.boilTempC ?? 100,
      heatMode: "BOIL",
      pump: false,
      boil: true,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: "Разогрев до кипения",
    });
    // BOILING
    steps.push({
      stage: "BOILING",
      durationSec: r.boil.boilTimeMin * 60,
      setpointC: r.boil.boilTempC ?? 100,
      heatMode: "BOIL",
      pump: false,
      boil: true,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: `Кипячение ${r.boil.boilTimeMin} мин`,
    });
    // HOP_STAND * N
    r.hopStand.forEach((hs, i) => {
      steps.push({
        stage: "HOP_STAND",
        durationSec: hs.timeMin * 60,
        setpointC: hs.tempC,
        heatMode: "PID",
        pump: true,
        mashStepIndex: -1,
        hopStandIndex: i,
        status: `Хмелевая пауза ${hs.tempC}°C`,
      });
    });
    // COOLING
    steps.push({
      stage: "COOLING",
      durationSec: 300,
      setpointC: r.cooling.targetC,
      heatMode: "OFF",
      pump: true,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: `Охлаждение до ${r.cooling.targetC}°C`,
    });
    // DONE
    steps.push({
      stage: "DONE",
      durationSec: 0,
      setpointC: AMBIENT_C,
      heatMode: "OFF",
      pump: false,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: "Варка завершена",
    });
    return steps;
  }

  private enterStep(): void {
    const step = this.plan[this.stepIdx];
    if (!step) {
      this.reset("План пуст");
      return;
    }
    this.stage = step.stage;
    this.stageElapsed = 0;
    this.statusLine = step.status;
    this.applyStepOutputs(step);

    if (step.prompt) {
      // поднимаем новый промпт: бампим promptSeq, ждём ACK
      this.activePrompt = step.prompt;
      this.promptSeq += 1;
      this.waitingAck = true;
      this.addLog("info", `Промпт: ${step.prompt} (promptSeq=${this.promptSeq})`);
    } else {
      this.activePrompt = "NONE";
      this.waitingAck = false;
    }
  }

  private applyStepOutputs(step: PlanStep | undefined): void {
    if (!step) return;
    this.setpointC = step.setpointC;
    this.heatMode = step.heatMode;
    this.pumpOn = step.pump;
    this.spargeHeatOn = step.spargeHeat ?? false;
  }

  private advanceStep(reason: string): void {
    if (this.stepIdx >= this.plan.length - 1) {
      this.addLog("info", `Конец плана (${reason})`);
      return;
    }
    this.stepIdx += 1;
    this.addLog("info", `→ следующий шаг (${reason})`);
    this.enterStep();
  }

  private isBrewing(): boolean {
    return (
      this.plan.length > 0 &&
      this.stage !== "IDLE" &&
      this.stage !== "DONE" &&
      this.stage !== "FAULT" &&
      this.stage !== "MANUAL"
    );
  }

  private reset(status: string): void {
    this.plan = [];
    this.stepIdx = 0;
    this.stageElapsed = 0;
    this.stage = "IDLE";
    this.pausedFrom = "IDLE";
    this.heatMode = "OFF";
    this.heatDutyPct = 0;
    this.heatOn = false;
    this.spargeHeatOn = false;
    this.pumpOn = false;
    this.boilPct = 0;
    this.waitingAck = false;
    this.activePrompt = "NONE";
    this.setpointC = 0;
    this.statusLine = status;
    this.addLog("info", status);
  }

  // ----------------------------- демо: инжект аварий -----------------------
  // Dev/demo-only capability симулятора (НЕ часть протокола прошивки — реальная
  // плата не умеет «притвориться» аварией). Нужна для тестирования AlarmsPanel/
  // UX аварий без физического обрыва датчика/перегрева. См. docs/brewery-command-center.md.
  /** Список имён аварий, доступных для демо-инжекта (см. FAULT_BITS). */
  static readonly injectableFaults: readonly Fault[] = FAULT_NAMES;

  /** Поднять произвольную аварию по имени — как раскодированный faultMask, так и переход в FAULT. */
  injectFault(name: Fault): void {
    this.raiseFault(FAULT_BITS[name], `Инжект аварии (демо): ${name}`);
  }

  /** Сбросить все аварии (в т.ч. инжектированные) — как реальная команда CLEAR_FAULT. */
  clearFaults(): void {
    if (this.faultMask === 0) return;
    this.faultMask = 0;
    this.reset("Аварии сброшены (демо)");
  }

  private raiseFault(bit: number, status: string): void {
    this.faultMask |= bit;
    this.stage = "FAULT";
    this.heatMode = "OFF";
    this.heatDutyPct = 0;
    this.heatOn = false;
    this.spargeHeatOn = false;
    this.pumpOn = false;
    this.boilPct = 0;
    this.waitingAck = false;
    this.activePrompt = "NONE";
    this.statusLine = status;
    this.addLog("error", status);
  }

  // ----------------------------- тик симуляции -----------------------------
  private tick(): void {
    const dtReal = this.cfg.tickMs / 1000;
    this.uptimeSec += dtReal;

    const running = this.isBrewing();
    if (running && !this.waitingAck) {
      const dtBrew = this.cfg.tickScale * dtReal;
      this.stageElapsed += dtBrew;
      const step = this.plan[this.stepIdx];
      if (step && step.durationSec > 0 && this.stageElapsed >= step.durationSec) {
        this.advanceStep("таймер шага истёк");
      }
    }

    this.applyDeadMan(); // sim dead-man: гасим брошенный ручной нагрев ДО расчёта мощности
    this.updateOutputs(); // мощность (duty) из режима/PID
    this.updateThermal(dtReal); // физика нагрева от duty
    this.emit();
  }

  /** Sim dead-man: ручной нагрев на «плате» гаснет при потере heartbeat командного
   *  источника (нет команд >TTL) и по max-длительности MANUAL_HEAT — паритет с
   *  firmware-контрактом (безопасность «варки откуда угодно» не зависит от облака). */
  private applyDeadMan(): void {
    if (this.stage !== "MANUAL" || this.heatMode === "OFF" || this.manualHeatSince === 0) return;
    const now = Date.now();
    const stale = now - this.lastCmdAt > MANUAL_HEAT_TTL_MS;
    const tooLong = now - this.manualHeatSince > MANUAL_HEAT_MAX_MS;
    if (!stale && !tooLong) return;
    this.heatMode = "OFF";
    this.heatDutyPct = 0;
    this.heatOn = false;
    this.manualHeatSince = 0;
    this.addLog(
      "warn",
      stale
        ? "Dead-man: потерян heartbeat командного источника — ручной нагрев ВЫКЛ"
        : "Dead-man: превышено макс. время ручного нагрева — ВЫКЛ + выход из ручного",
    );
    if (tooLong) this.reset("Dead-man: авто-выход из ручного режима");
  }

  /** Физическая тепловая модель: dT/dt = K_HEAT·duty − K_LOSS·(T−amb), с плато
   *  кипения и активным охлаждением. Нагрев реально следует за мощностью (heatDutyPct):
   *  инерция, недогрев при малом duty, overshoot, плато при кипении. */
  private updateThermal(dtReal: number): void {
    const dtBrew = this.cfg.tickScale * dtReal; // «варочных» секунд за тик
    const fault = this.faultMask !== 0;

    if (this.stage === "COOLING") {
      // активное охлаждение (чиллер) к целевой — быстрее пассивных потерь
      const k = clamp(K_COOL * dtBrew, 0, 0.5);
      this.primaryC += (this.setpointC - this.primaryC) * k;
    } else {
      const duty = !fault && this.heatOn ? this.heatDutyPct / 100 : 0;
      let dT = (K_HEAT * duty - K_LOSS * (this.primaryC - AMBIENT_C)) * dtBrew;
      // плато кипения: у точки кипения лишняя мощность испаряет воду, а не греет
      if (duty > 0 && this.primaryC >= BOIL_PLATEAU_C - 0.5) {
        dT = Math.min(dT, BOIL_PLATEAU_C - this.primaryC);
      }
      dT = clamp(dT, -8, 8); // устойчивость Эйлера при большом tickScale
      this.primaryC += dT;
    }
    this.primaryC += (Math.random() - 0.5) * 0.03; // лёгкий шум датчика
    this.primaryC = clamp(this.primaryC, -5, 130);
  }

  private updateOutputs(): void {
    const permitted = this.faultMask === 0;

    if (!permitted) {
      this.heatDutyPct = 0;
      this.heatOn = false;
      this.boilPct = 0;
      return;
    }

    const step = this.plan[this.stepIdx];
    const boilStage = (step?.boil ?? false) && this.isBrewing();

    if (this.heatMode === "OFF") {
      this.heatDutyPct = 0;
      this.heatOn = false;
    } else if (this.heatMode === "BOIL") {
      this.heatDutyPct = 85; // boil-PWM по умолчанию (см. bf_config)
      this.heatOn = true;
    } else if (this.heatMode === "MANUAL_PWM") {
      this.heatDutyPct = this.manualPwm;
      this.heatOn = this.manualPwm > 0;
    } else {
      // PID: пропорционально ошибке до уставки
      const err = this.setpointC - this.primaryC;
      this.heatDutyPct = clamp(Math.round(err * 25), 0, 100);
      this.heatOn = this.heatDutyPct > 0;
    }

    this.boilPct = boilStage ? 85 : 0;
  }

  // ----------------------------- телеметрия --------------------------------
  private buildTelemetry(): Telemetry {
    const step = this.plan[this.stepIdx];
    const remaining =
      this.isBrewing() && step && step.durationSec > 0
        ? Math.max(0, Math.round(step.durationSec - this.stageElapsed))
        : 0;

    const nMashSteps =
      this.activeRecipe >= 0 && this.slots[this.activeRecipe]
        ? this.slots[this.activeRecipe]!.mash.steps.length
        : 0;

    const sensor0 = round1(this.primaryC);
    const sensor1 = round1(this.primaryC - 1.5);
    const sensorsValid = (this.faultMask & FAULT_BITS.SENSOR) === 0;

    return {
      schema: PROTOCOL_SCHEMA_VERSION,
      deviceId: this.cfg.deviceId,
      fw: this.cfg.fw,
      ts: Math.floor(Date.now() / 1000),
      seq: this.seq,
      uptime: Math.floor(this.uptimeSec),

      stage: STAGE_NUM[this.stage],
      stageName: stageName(STAGE_NUM[this.stage]),
      pausedFrom: STAGE_NUM[this.pausedFrom],
      faultMask: this.faultMask,
      faults: decodeFaults(this.faultMask),
      heatingPermitted: this.faultMask === 0 && this.heatMode !== "OFF",

      sensors: [
        { i: 0, c: sensor0, valid: sensorsValid },
        { i: 1, c: sensor1, valid: sensorsValid },
      ],
      primary: { c: sensor0, valid: sensorsValid },

      setpointC: round1(this.setpointC),
      heatMode: HEAT_MODE_NUM[this.heatMode],
      heatDutyPct: this.heatDutyPct,
      heatOn: this.heatOn,
      spargeHeatOn: this.spargeHeatOn,
      pumpOn: this.pumpOn,
      boilPct: this.boilPct,

      stageRemainingSec: remaining,
      stageElapsedSec: Math.round(this.stageElapsed),
      mashStepIndex: step?.mashStepIndex ?? -1,
      nMashSteps,
      hopStandIndex: step?.hopStandIndex ?? -1,

      prompt: PROMPT_NUM[this.activePrompt],
      promptSeq: this.promptSeq,
      nextHopAlert: false,

      activeRecipe: this.activeRecipe,
      recipeName: this.recipeName,
      statusLine: this.statusLine,
    };
  }

  /** Текущий снимок (всегда проходит TelemetrySchema). */
  snapshot(): Telemetry {
    return TelemetrySchema.parse(this.buildTelemetry());
  }

  private emit(): void {
    this.seq += 1;
    let t: Telemetry;
    try {
      t = TelemetrySchema.parse(this.buildTelemetry());
    } catch (e) {
      // не должно происходить; логируем для разработки, но не валим симулятор
      this.addLog("error", `Невалидная телеметрия: ${(e as Error).message}`);
      return;
    }
    for (const fn of this.listeners) fn(t);
  }

  // ----------------------------- утилиты -----------------------------------
  private ack(ackOf: string, ok: boolean, reason: AckReason): Ack {
    return { ackOf, ok, reason, ts: Math.floor(Date.now() / 1000) };
  }

  private addLog(level: LogEntry["level"], msg: string): void {
    this.log.push({ ts: Math.floor(Date.now() / 1000), seq: this.seq, level, msg });
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
  }

  private applyScenario(s: Scenario): void {
    switch (s) {
      case "idle":
        this.statusLine = "Готов";
        break;
      case "mash": {
        const recipe = this.slots[0]!;
        this.beginBrew(0, recipe);
        // перескочим к первому шагу затирания (минуем dough-in и промпт)
        while (this.stepIdx < this.plan.length - 1 && this.stage !== "MASH_STEP") {
          this.waitingAck = false;
          this.activePrompt = "NONE";
          this.stepIdx += 1;
          this.enterStep();
        }
        this.statusLine = "Затирание (сценарий mash)";
        break;
      }
      case "fault":
        this.raiseFault(FAULT_BITS.SENSOR, "Отказ датчика (сценарий fault)");
        break;
    }
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
