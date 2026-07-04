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
  APP_MODE_NUM,
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
  type AppMode,
  type FermentConfig,
  type DistillConfig,
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

export type Scenario = "idle" | "mash" | "fault" | "ferment" | "distill";

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

// ----------------------------- ferment{} — профиль брожения (§8, §13) ------
// FermentConfigSchema/FermentStepSchema уже типизированы в @nb/brewforge-protocol
// (config.ts) — deviceConfig.ferment: FermentConfig | undefined, клампы диапазонов
// (hysteresisC∈[0.1,5], nSteps∈[1,6], steps[].tempC∈[-2,40] и т.д.) уже встроены в
// сам Zod-схему (не в CONFIG_FIELD_RANGES, как pid/pump/…) — DeviceConfigPatchSchema.
// parse() в writeConfig() отклонит невалидный патч ДО mergeDeviceConfig, отдельный
// clampField для ferment.* здесь не нужен. steps — ВСЕГДА 6 слотов (bf_proto.c
// сериализует весь массив независимо от nSteps); nSteps выбирает, сколько первых
// слотов активны — см. activeFermentSteps().
const DEFAULT_FERMENT_CONFIG: FermentConfig = {
  hysteresisC: 0.5,
  compMinOffS: 300,
  compMinOnS: 60,
  heatEnabled: true,
  nSteps: 3,
  steps: [
    { tempC: 18, hours: 168 }, // главное брожение — 7 дн
    { tempC: 20, hours: 48 }, // диацетильная пауза — 2 дн
    { tempC: 2, hours: 0 }, // холодная выдержка — держать до ручного перехода
    { tempC: 2, hours: 0 }, // неактивные слоты (nSteps=3) — заполнитель
    { tempC: 2, hours: 0 },
    { tempC: 2, hours: 0 },
  ],
};

/** Текущий эффективный ferment{} (или дефолт, если ключ ещё не установлен). */
function fermentConfig(cfg: DeviceConfig): FermentConfig {
  return cfg.ferment ?? DEFAULT_FERMENT_CONFIG;
}

/** Первые nSteps слотов ferment.steps — актуальный план ступеней брожения. */
function activeFermentSteps(ferment: FermentConfig): FermentConfig["steps"] {
  const n = clamp(Math.round(ferment.nSteps), 0, ferment.steps.length);
  return ferment.steps.slice(0, n);
}

// ----------------------------- distill{} — профиль дистилляции (§7, §13) ---
// DistillConfigSchema уже типизирован в @nb/brewforge-protocol (config.ts):
// диапазоны (headsPct/heartsPct/tailsPct∈[0,100], t*C∈[30,110], *Reflux∈[0,30],
// refluxWindowS∈[5,300]) встроены в саму Zod-схему (как и ferment{} — см.
// комментарий у DEFAULT_FERMENT_CONFIG), отдельный clampField здесь не нужен.
// Дефолты — типичный профиль кубового аппарата с дефлегматором: преднагрев
// полной мощностью до tHeadsC (начало отбора голов), дальше фиксированная (НЕ
// PID) скважность по фракции, авто-стоп по tEndC — паритет с защитой от
// сухого хода bf_process.c:1046-1049. headsReflux/heartsReflux/tailsReflux/
// refluxWindowS лежат в конфиге для round-trip и будущего пакета (реальная
// прошивка ШИМит клапан отбора этим окном — v1 сима упрощает до valveOn=bool,
// см. updateDistillControl).
const DEFAULT_DISTILL_CONFIG: DistillConfig = {
  headsPct: 40, // головы — щадящая медленная отгонка
  heartsPct: 65, // тело — основной отбор
  tailsPct: 75, // хвосты — гоним быстрее, качество продукта уже не критично
  tHeadsC: 78, // ≈ точка кипения этанольно-водной смеси — старт отбора голов
  tHeartsC: 82, // головы почти сошли — переход на тело
  tTailsC: 90, // крепость упала — переход на хвосты
  tEndC: 98, // почти вода — авто-стоп (защита от сухого хода)
  headsReflux: 5, // выше флегма — тщательнее отсекаем голову
  heartsReflux: 3,
  tailsReflux: 1, // ниже флегма — хвосты гоним быстрее
  refluxWindowS: 30,
};

/** Текущий эффективный distill{} (или дефолт, если ключ ещё не установлен). */
function distillConfig(cfg: DeviceConfig): DistillConfig {
  return cfg.distill ?? DEFAULT_DISTILL_CONFIG;
}

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
  ferment: DEFAULT_FERMENT_CONFIG,
  distill: DEFAULT_DISTILL_CONFIG,
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

  // ferment{} — скалярные поля сливаются как pid/pump/boil выше (клампы уже в
  // самой Zod-схеме FermentConfigSchema — см. комментарий у DEFAULT_FERMENT_CONFIG,
  // отдельный clampField не нужен). steps — патч ПО ИНДЕКСУ (паритет с sensorCal):
  // короче массива/пропуски трогают только указанные слоты, длина остаётся 6.
  if (patch.ferment) {
    const pf = patch.ferment;
    const curFerment = fermentConfig(cur);
    const mergedFerment: FermentConfig = { ...curFerment, ...pf, steps: curFerment.steps };
    if (pf.steps) {
      mergedFerment.steps = curFerment.steps.map((s, i) => {
        const p = pf.steps?.[i];
        if (!p) return s;
        return {
          tempC: p.tempC ?? s.tempC,
          hours: p.hours ?? s.hours,
        };
      });
    }
    next.ferment = mergedFerment;
  }

  // distill{} — скалярные поля, клампы уже в самой Zod-схеме DistillConfigSchema
  // (см. комментарий у DEFAULT_DISTILL_CONFIG) — простой merge, паритет с ferment{}.
  if (patch.distill) {
    next.distill = { ...distillConfig(cur), ...patch.distill };
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

  // --- слоты рецептов (сверка контракта, пакет 4-B): BF_MAX_RECIPES=26 на
  // реальном железе — слоты 0..BUILTIN_SLOT_COUNT-1 «встроенные» (ROM, read-only,
  // никогда не выбираются автовыбором/не перезаписываются адресным пушем), слоты
  // BUILTIN_SLOT_COUNT..25 — записываемые (NVS). Симулятор не хранит все 6 ROM-
  // рецептов (только демо в слоте 0, см. defaultRecipe) — это осознанное упрощение
  // (сим — не полная копия прошивки), но ГРАНИЦА диапазонов воспроизведена точно,
  // т.к. именно она определяет поведение listSlots/putRecipe(без slot)/?slot=. ---
  private static readonly BUILTIN_SLOT_COUNT = 6; // bf_recipes_count()
  private static readonly MAX_RECIPES = 26; // BF_MAX_RECIPES
  private readonly slots: (DeviceRecipe | null)[] = new Array(SimDevice.MAX_RECIPES).fill(null);

  // --- pairing/MQTT (пакет 4-B, D5/D6 паритет): в памяти, без NVS-персиста — сим
  // эфемерен по конструкции (перезапуск = чистое состояние, как «заводской сброс»). ---
  private deviceToken: string | null = null; // паритет с bf_net_cfg_t.device_token
  private mqttUri = ""; // паритет с bf_net_cfg_t.mqtt_uri ("" = MQTT выключен)

  // --- изменяемое состояние ---
  private seq = 0;
  private promptSeq = 0;
  private uptimeSec = 0;

  private stage: Stage = "IDLE";
  private pausedFrom: Stage = "IDLE";
  private faultMask = 0;

  // Режим прибора (bf_app_mode_t) — фиксируется сценарием на весь срок жизни
  // инстанса (§2 спеки: смена режима — только на устройстве/пересборкой,
  // сеть его не переключает; наш командный switch и не содержит SET_APP_MODE).
  private appMode: AppMode = "brew";

  private setpointC = 0;
  private heatMode: HeatMode = "OFF";
  private heatDutyPct = 0;
  private heatOn = false;
  private spargeHeatOn = false;
  private pumpOn = false;
  private boilPct = 0;

  // --- ферментация (§8, только когда appMode==="ferment") ---
  private coolOn = false; // охлаждение (роль COOLER) — компрессор/чиллер камеры
  private coolLockRemainingSec = 0; // анти-короткий-цикл: «варочные» секунды до разрешения coolOn

  // --- дистилляция (§7, только когда appMode==="distill") ---
  private valveOn = false; // клапан отбора (флегма) — открыт во время HEADS/HEARTS/TAILS
  private distillReady = false; // «пора сменить приёмную ёмкость» — паритет distill_ready прошивки

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

  /**
   * Карта ЗАПИСЫВАЕМЫХ слотов (номер + имя рецепта, если занят) — для listSlots
   * провайдера / GET /recipes. Паритет с прошивкой (D1, bf_comms.c h_recipes):
   * встроенные ROM-слоты (0..BUILTIN_SLOT_COUNT-1) сюда НЕ входят — это read-only
   * библиотека, не адресуемые push-слоты «рецептов на борту».
   */
  listSlots(): { slot: number; name: string | null }[] {
    const out: { slot: number; name: string | null }[] = [];
    for (let i = SimDevice.BUILTIN_SLOT_COUNT; i < this.slots.length; i++) {
      out.push({ slot: i, name: this.slots[i] ? this.slots[i]!.name : null });
    }
    return out;
  }

  /**
   * Read-only снапшот рецепта слота («что лежит на плате»), либо null если слот
   * пуст. В отличие от listSlots — читает ЛЮБОЙ слот 0..25 (паритет с GET
   * /recipe?slot=N на прошивке, который тоже не ограничен записываемым диапазоном).
   */
  readSlot(slot: number): DeviceRecipe | null {
    if (slot < 0 || slot >= this.slots.length) {
      throw new Error(`Слот вне диапазона 0..${this.slots.length - 1}`);
    }
    return this.slots[slot] ?? null;
  }

  /** true, если slot — в ЗАПИСЫВАЕМОМ диапазоне (паритет с recipe_slot_writable в bf_proto.c). */
  private isWritableSlot(slot: number): boolean {
    return slot >= SimDevice.BUILTIN_SLOT_COUNT && slot < this.slots.length;
  }

  /** Первый свободный записываемый слот, либо undefined (весь диапазон занят). Паритет с pick_recipe_slot(). */
  private firstFreeWritableSlot(): number | undefined {
    for (let i = SimDevice.BUILTIN_SLOT_COUNT; i < this.slots.length; i++) {
      if (!this.slots[i]) return i;
    }
    return undefined;
  }

  // ----------------------------- pairing/MQTT (D5/D6) -----------------------
  /** true — уже «сопряжено» (device_token задан). Паритет с bf_comms_paired(). */
  isPaired(): boolean {
    return this.deviceToken !== null;
  }

  /**
   * POST /pair — паритет с h_pair (bf_comms.c): принимает токен ТОЛЬКО пока не
   * сопряжено; формат — префикс "bfd_" + разумная минимальная длина (паритет с
   * bf_proto_pair_token_valid, BF_PAIR_TOKEN_MIN_LEN=16). Уже сопряжённое — 409-
   * образная ошибка (см. server.ts): разрыв только через unpair() (dev-утилита,
   * паритет с bf_comms_unpair — на реальном железе доступно ТОЛЬКО локально с экрана).
   */
  pair(token: unknown): { ok: true } | { ok: false; reason: "BAD_TOKEN" | "ALREADY_PAIRED" } {
    if (this.deviceToken !== null) return { ok: false, reason: "ALREADY_PAIRED" };
    if (typeof token !== "string" || !token.startsWith("bfd_") || token.length < 16) {
      return { ok: false, reason: "BAD_TOKEN" };
    }
    this.deviceToken = token;
    this.addLog("info", "Устройство сопряжено (POST /pair)");
    return { ok: true };
  }

  /** Dev-утилита: разорвать сопряжение (паритет с локальным bf_comms_unpair, нет сетевого эквивалента на реальном железе). */
  unpair(): void {
    this.deviceToken = null;
  }

  /**
   * POST /mqtt {"uri":"mqtt(s)://..."|""} — паритет с h_mqtt_set (bf_comms.c):
   * пусто = MQTT явно выключен (валидно), иначе схема ровно mqtt:// или mqtts://.
   */
  setMqttUri(uri: unknown): { ok: true } | { ok: false; reason: "BAD_URI" } {
    if (typeof uri !== "string") return { ok: false, reason: "BAD_URI" };
    if (uri !== "" && !uri.startsWith("mqtt://") && !uri.startsWith("mqtts://")) {
      return { ok: false, reason: "BAD_URI" };
    }
    this.mqttUri = uri;
    this.addLog("info", `mqtt_uri обновлён (sim): ${uri || "(выкл)"}`);
    return { ok: true };
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
  /**
   * Записать рецепт в слот. Возвращает индекс слота или бросает при невалидности.
   * БЕЗ `slot` — автовыбор первого свободного ЗАПИСЫВАЕМОГО слота (паритет с
   * pick_recipe_slot() прошивки: диапазон 6..25, НЕ 0 — слот 0 «встроенный»).
   * С явным `slot` — тот же записываемый диапазон, лежащий вне него слот (в т.ч.
   * 0..5, «встроенные») отклоняется — паритет с BF_PROTO_ERR_BAD_SLOT (D2).
   */
  putRecipe(raw: unknown, slot?: number): number {
    const recipe = DeviceRecipeSchema.parse(raw); // бросит ZodError при невалидности
    let target: number;
    if (slot === undefined) {
      const free = this.firstFreeWritableSlot();
      if (free === undefined) {
        throw new Error(
          `Нет свободных слотов (${SimDevice.BUILTIN_SLOT_COUNT}..${this.slots.length - 1} заняты)`,
        );
      }
      target = free;
    } else {
      if (!this.isWritableSlot(slot)) {
        throw new Error(
          `Слот ${slot} вне записываемого диапазона ${SimDevice.BUILTIN_SLOT_COUNT}..${this.slots.length - 1}`,
        );
      }
      target = slot;
    }
    this.slots[target] = recipe;
    this.addLog("info", `Рецепт «${recipe.name}» записан в слот ${target}`);
    return target;
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
        this.coolOn = false; // компрессор гасим сразу же, не дожидаясь следующего тика
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

  /**
   * Собрать план FERMENT из активных ступеней ferment.steps (§8, §13): каждая
   * ступень — PlanStep с durationSec = hours×3600 (0 = бессрочно, держим до
   * SKIP_STAGE/портала — уже поддержано общей FSM: таймер не срабатывает на
   * durationSec=0). mashStepIndex зеркалит индекс ступени брожения (§13-№6:
   * «переиспользуется ли mashStepIndex» — да). Плюс завершающий DONE-шаг —
   * тем же приёмом, что и buildPlan(), это даёт SKIP_STAGE «последняя →
   * DONE» и isBrewing()===false на DONE бесплатно, без отдельной ветки.
   */
  private beginFerment(): void {
    const ferment = fermentConfig(this.deviceConfig);
    const steps = activeFermentSteps(ferment);
    this.plan = steps.map(
      (s, i): PlanStep => ({
        stage: "FERMENT",
        durationSec: s.hours * 3600,
        setpointC: s.tempC,
        heatMode: "OFF", // пересчитывается каждый тик в updateFermentControl
        pump: false,
        mashStepIndex: i,
        hopStandIndex: -1,
        status: `Брожение · ступень ${i + 1} из ${steps.length} · ${s.tempC}°C`,
      }),
    );
    this.plan.push({
      stage: "DONE",
      durationSec: 0,
      setpointC: AMBIENT_C,
      heatMode: "OFF",
      pump: false,
      mashStepIndex: -1,
      hopStandIndex: -1,
      status: "Ферментация завершена",
    });
    this.stepIdx = 0;
    this.stageElapsed = 0;
    this.faultMask = 0;
    this.coolOn = false;
    this.coolLockRemainingSec = 0;
    this.enterStep();
    this.addLog("info", `Старт ферментации: ${steps.length} ступеней`);
  }

  /**
   * Собрать план DISTILL (§7, §13): PREHEAT→HEADS→HEARTS→TAILS→DONE, все шаги
   * durationSec=0 — переходы НЕ по таймеру (в отличие от FERMENT), а по порогу
   * температуры/SKIP_STAGE (updateDistillControl + общий обработчик SKIP_STAGE
   * уже делает advanceStep() для любой isBrewing()-стадии — паритет с
   * bf_process.c:607-619, где SKIP_STAGE продвигает срез без гейтов). setpointC
   * каждого шага — информационный (реально читается ЖИВЫМ из distill{} конфига
   * в updateDistillControl каждый тик, как ferment.steps[i].tempC у брожения).
   */
  private beginDistill(): void {
    const d = distillConfig(this.deviceConfig);
    this.plan = [
      {
        stage: "DISTILL_PREHEAT",
        durationSec: 0,
        setpointC: d.tHeadsC,
        heatMode: "OFF", // пересчитывается каждый тик в updateDistillControl
        pump: false,
        mashStepIndex: -1,
        hopStandIndex: -1,
        status: "Преднагрев — полная мощность до старта отбора голов",
      },
      {
        stage: "DISTILL_HEADS",
        durationSec: 0,
        setpointC: d.tHeartsC,
        heatMode: "OFF",
        pump: false,
        mashStepIndex: -1,
        hopStandIndex: -1,
        status: "Отбор голов",
      },
      {
        stage: "DISTILL_HEARTS",
        durationSec: 0,
        setpointC: d.tTailsC,
        heatMode: "OFF",
        pump: false,
        mashStepIndex: -1,
        hopStandIndex: -1,
        status: "Отбор тела",
      },
      {
        stage: "DISTILL_TAILS",
        durationSec: 0,
        setpointC: d.tEndC,
        heatMode: "OFF",
        pump: false,
        mashStepIndex: -1,
        hopStandIndex: -1,
        status: "Отбор хвостов",
      },
      {
        stage: "DONE",
        durationSec: 0,
        setpointC: AMBIENT_C,
        heatMode: "OFF",
        pump: false,
        mashStepIndex: -1,
        hopStandIndex: -1,
        status: "Дистилляция завершена",
      },
    ];
    this.stepIdx = 0;
    this.stageElapsed = 0;
    this.faultMask = 0;
    this.valveOn = false;
    this.distillReady = false;
    this.enterStep();
    this.addLog("info", "Старт дистилляции: преднагрев");
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
    // «Пора сменить ёмкость» гасится на КАЖДОМ переходе стадии — паритет с
    // go() прошивки (bf_process.c: `s_ctx.distill_ready = false;` в go(),
    // безусловно, а не по локальной кнопке/таймеру). Вне distill-сценария
    // поле просто не эмитится в телеметрию — сброс здесь безвреден.
    this.distillReady = false;

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
    this.coolOn = false;
    this.coolLockRemainingSec = 0;
    this.valveOn = false;
    this.distillReady = false;
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
    this.coolOn = false; // компрессор гасим сразу — tick() перестаёт звать updateFermentControl (stage≠FERMENT)
    this.valveOn = false; // клапан отбора гасим сразу — tick() перестаёт звать updateDistillControl (stage≠DISTILL_*)
    this.distillReady = false;
    this.waitingAck = false;
    this.activePrompt = "NONE";
    this.statusLine = status;
    this.addLog("error", status);
  }

  // ----------------------------- тик симуляции -----------------------------
  private tick(): void {
    const dtReal = this.cfg.tickMs / 1000;
    this.uptimeSec += dtReal;
    const dtBrew = this.cfg.tickScale * dtReal; // «варочных» секунд за тик (общие часы шага И ферментации)

    const running = this.isBrewing();
    if (running && !this.waitingAck) {
      this.stageElapsed += dtBrew;
      const step = this.plan[this.stepIdx];
      if (step && step.durationSec > 0 && this.stageElapsed >= step.durationSec) {
        this.advanceStep("таймер шага истёк");
      }
    }

    this.applyDeadMan(); // sim dead-man: гасим брошенный ручной нагрев ДО расчёта мощности
    if (this.stage === "FERMENT") {
      this.updateFermentControl(dtBrew); // гистерезис компрессора/нагрева + анти-короткий-цикл
    } else if (this.isDistillStage()) {
      this.updateDistillControl(); // фиксированная скважность по фракции + пороги переходов
    } else {
      this.updateOutputs(); // мощность (duty) из режима/PID
    }
    this.updateThermal(dtReal); // физика нагрева от duty
    this.emit();
  }

  /** true — текущая стадия одна из DISTILL_PREHEAT/HEADS/HEARTS/TAILS (§7). */
  private isDistillStage(): boolean {
    return (
      this.stage === "DISTILL_PREHEAT" ||
      this.stage === "DISTILL_HEADS" ||
      this.stage === "DISTILL_HEARTS" ||
      this.stage === "DISTILL_TAILS"
    );
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

    if (this.stage === "COOLING" || (this.stage === "FERMENT" && !fault && this.coolOn)) {
      // активное охлаждение к целевой (варка: чиллер после кипячения; ферментация: компрессор камеры)
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
    this.coolOn = false; // компрессор только в FERMENT (updateFermentControl) — везде иначе форс-выкл
    this.valveOn = false; // клапан отбора только в DISTILL_* (updateDistillControl) — везде иначе форс-выкл

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

  /**
   * Управление ферментацией (§8 спеки): простой bang-bang вокруг уставки
   * текущей ступени (steps[i].tempC), решение КАЖДЫЙ тик, без «залипания»
   * внутри полосы — выше setpoint+hysteresisC включаем компрессор, ниже
   * setpoint−hysteresisC включаем нагрев (если heatEnabled), иначе оба
   * выключены. Анти-короткий-цикл компрессора: после выключения coolOn
   * не включать его compMinOffS «варочных» секунд — coolLockRemainingSec
   * отсчитывает остаток (coolLockS в телеметрии, только appMode="ferment").
   */
  private updateFermentControl(dtBrewSec: number): void {
    const ferment = fermentConfig(this.deviceConfig);
    const step = this.plan[this.stepIdx];
    // §13: «правка уставки текущей ступени = PUT /config (ferment.steps[i].tempC),
    // НЕ MANUAL_SETPOINT» — уставка читается из ЖИВОГО конфига по индексу текущей
    // ступени (не из замороженного PlanStep.setpointC), чтобы PUT /config применялся
    // немедленно, без ре-старта ферментации. Остальная форма шага (длительность —
    // §13 хранит только tempC/hours, длительность и так замороженный durationSec)
    // берётся из плана, как и раньше.
    this.setpointC = ferment.steps[this.stepIdx]?.tempC ?? step?.setpointC ?? this.setpointC;

    if (this.coolLockRemainingSec > 0) {
      this.coolLockRemainingSec = Math.max(0, this.coolLockRemainingSec - dtBrewSec);
    }

    if (this.faultMask !== 0) {
      this.coolOn = false;
      this.heatOn = false;
      this.heatDutyPct = 0;
      this.heatMode = "OFF";
      this.pumpOn = false;
      this.boilPct = 0;
      return;
    }

    const diff = this.primaryC - this.setpointC;
    const wantCool = diff > ferment.hysteresisC;
    const wantHeat = diff < -ferment.hysteresisC && ferment.heatEnabled;

    if (wantCool) {
      if (this.coolLockRemainingSec <= 0) this.coolOn = true; // ещё заблокирован — остаётся выключен
    } else if (this.coolOn) {
      this.coolOn = false;
      this.coolLockRemainingSec = ferment.compMinOffS;
    }

    this.heatOn = wantHeat && !this.coolOn;
    this.heatDutyPct = this.heatOn ? 100 : 0;
    this.heatMode = this.heatOn ? "MANUAL_PWM" : "OFF"; // простое реле, не PID/BOIL-закон
    this.pumpOn = false;
    this.boilPct = 0;
  }

  /**
   * Управление дистилляцией (§7 спеки, паритет с bf_process.c:1014-1050):
   * преднагрев полной мощностью (BF_HEAT_BOIL-аналог) до distill.tHeadsC —
   * ЭТО порог, а не таймер; дальше по фракции — фиксированная (НЕ PID)
   * скважность headsPct/heartsPct/tailsPct. Клапан отбора (valveOn) открыт
   * всё время HEADS/HEARTS/TAILS — упрощение относительно реальной прошивки
   * (та ещё и ШИМит клапан в окне distill.refluxWindowS долей
   * reflux_takeoff_pct=100/(R+1) — флегмовый цикл вне рамок этой итерации,
   * headsReflux/heartsReflux/tailsReflux/refluxWindowS в конфиге — задел).
   *
   * Пороги/скважность читаются из ЖИВОГО distill{} конфига каждый тик (как
   * ferment.steps[i].tempC у брожения) — PUT /config применяется немедленно.
   *
   * Порядок здесь важен: сначала проверяем автопереходы и взводим actionReady
   * ПО ТЕКУЩЕЙ (ещё не изменившейся) стадии, потом считаем выходы по итоговой
   * this.stage — так кадр телеметрии этого же тика уже отражает новую стадию
   * без «лага» на один тик.
   *
   * actionReady («пора сменить приёмную ёмкость», distill_ready на устройстве):
   * взводится РОВНО ОДИН РАЗ за фракцию при первом достижении температуры
   * следующего среза внутри HEADS/HEARTS (!distillReady-гейт — паритет с
   * bf_process.c:1028/1037), СБРАСЫВАЕТСЯ переходом стадии — см. enterStep().
   * Прошивка гасит его НА КАЖДОЙ смене стадии внутри go(), НЕ по локальной
   * кнопке и НЕ по таймеру (сверено grep'ом по bf_process.c/bf_proto.c — там
   * нет отдельной команды ACK для action_ready) — воспроизведено 1:1, поэтому
   * здесь снятие ТОЖЕ идёт через переход стадии (SKIP_STAGE), а не таймер.
   * TAILS флаг не поднимает — переход TAILS→DONE у tEndC полностью
   * автоматический (защита от сухого хода), подтверждение оператора не нужно.
   */
  private updateDistillControl(): void {
    const distill = distillConfig(this.deviceConfig);

    if (this.faultMask !== 0) {
      this.heatDutyPct = 0;
      this.heatOn = false;
      this.valveOn = false;
      this.pumpOn = false;
      this.boilPct = 0;
      return;
    }

    // 1) автопереходы по порогу температуры (см. комментарий выше про порядок)
    if (this.stage === "DISTILL_PREHEAT" && this.primaryC >= distill.tHeadsC) {
      this.advanceStep("Порог tHeadsC достигнут — старт отбора голов");
    } else if (this.stage === "DISTILL_TAILS" && this.primaryC >= distill.tEndC) {
      this.advanceStep("Порог tEndC достигнут — авто-стоп (защита от сухого хода)");
    }

    // 2) actionReady — «пора сменить ёмкость», взводится один раз за фракцию
    if (this.stage === "DISTILL_HEADS" && !this.distillReady && this.primaryC >= distill.tHeartsC) {
      this.distillReady = true;
      this.addLog("info", "Готово к смене приёмной ёмкости: головы → тело (tHeartsC)");
    } else if (this.stage === "DISTILL_HEARTS" && !this.distillReady && this.primaryC >= distill.tTailsC) {
      this.distillReady = true;
      this.addLog("info", "Готово к смене приёмной ёмкости: тело → хвосты (tTailsC)");
    }

    // 3) выходы по ИТОГОВОЙ (уже актуальной после п.1) стадии
    switch (this.stage) {
      case "DISTILL_PREHEAT":
        this.setpointC = distill.tHeadsC;
        this.heatMode = "BOIL";
        this.heatDutyPct = 100;
        this.heatOn = true;
        this.valveOn = false; // отбор ещё не идёт
        break;
      case "DISTILL_HEADS":
        this.setpointC = distill.tHeartsC;
        this.heatMode = "MANUAL_PWM";
        this.heatDutyPct = distill.headsPct;
        this.heatOn = this.heatDutyPct > 0;
        this.valveOn = true;
        break;
      case "DISTILL_HEARTS":
        this.setpointC = distill.tTailsC;
        this.heatMode = "MANUAL_PWM";
        this.heatDutyPct = distill.heartsPct;
        this.heatOn = this.heatDutyPct > 0;
        this.valveOn = true;
        break;
      case "DISTILL_TAILS":
        this.setpointC = distill.tEndC;
        this.heatMode = "MANUAL_PWM";
        this.heatDutyPct = distill.tailsPct;
        this.heatOn = this.heatDutyPct > 0;
        this.valveOn = true;
        break;
      default:
        // TAILS→DONE только что случился в п.1 — гасим нагрев/клапан немедленно
        this.heatMode = "OFF";
        this.heatDutyPct = 0;
        this.heatOn = false;
        this.valveOn = false;
    }

    this.pumpOn = false; // pot still — насос не задействован (паритет с комментарием прошивки)
    this.boilPct = 0;
  }

  // ----------------------------- телеметрия --------------------------------
  private buildTelemetry(): Telemetry {
    const step = this.plan[this.stepIdx];
    const remaining =
      this.isBrewing() && step && step.durationSec > 0
        ? Math.max(0, Math.round(step.durationSec - this.stageElapsed))
        : 0;

    // §13-№6: в FERMENT mashStepIndex/nMashSteps зеркалят индекс/число ступеней
    // брожения (тот же PlanStep-приём, что и mashStepIndex варки — переиспользуем
    // поле, отдельного не заводим). this.plan.length−1 — минус завершающий DONE.
    const nMashSteps =
      this.stage === "FERMENT"
        ? Math.max(0, this.plan.length - 1)
        : this.activeRecipe >= 0 && this.slots[this.activeRecipe]
          ? this.slots[this.activeRecipe]!.mash.steps.length
          : 0;

    const sensor0 = round1(this.primaryC);
    const sensor1 = round1(this.primaryC - 1.5);
    const sensorsValid = (this.faultMask & FAULT_BITS.SENSOR) === 0;

    // coolOn/coolLockS — ТОЛЬКО в ferment-сценарии (§13/telemetry.ts: "роль COOLER,
    // ферментация"), паттерн опциональных полей "поле отсутствует = undefined":
    // ключи не включаются в объект вовсе (не set:undefined), как остальные
    // optional-поля этой телеметрии (pump2On/valveOn/hxTempC/…) при отсутствии роли.
    const fermentFields =
      this.appMode === "ferment"
        ? { coolOn: this.coolOn, coolLockS: Math.max(0, Math.round(this.coolLockRemainingSec)) }
        : {};

    // valveOn/actionReady — ТОЛЬКО в distill-сценарии (§7/§13, паттерн опциональных
    // полей "поле отсутствует = undefined", паритет с fermentFields выше).
    const distillFields =
      this.appMode === "distill"
        ? { valveOn: this.valveOn, actionReady: this.distillReady }
        : {};

    return {
      schema: PROTOCOL_SCHEMA_VERSION,
      deviceId: this.cfg.deviceId,
      fw: this.cfg.fw,
      ts: Math.floor(Date.now() / 1000),
      seq: this.seq,
      uptime: Math.floor(this.uptimeSec),

      stage: STAGE_NUM[this.stage],
      stageName: stageName(STAGE_NUM[this.stage]),
      // §2/§13: appMode — режим прибора, фиксируется сценарием (applyScenario), НЕ
      // выводится из текущей стадии — на DONE/IDLE/FAULT стадия сама режим не
      // определяет, авторитет там переходит к appMode (см. комментарий в enums.ts).
      appMode: APP_MODE_NUM[this.appMode],
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
      ...fermentFields,
      ...distillFields,

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
        this.appMode = "brew";
        this.statusLine = "Готов";
        break;
      case "mash": {
        this.appMode = "brew";
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
        this.appMode = "brew";
        this.raiseFault(FAULT_BITS.SENSOR, "Отказ датчика (сценарий fault)");
        break;
      case "ferment":
        // H3: appMode фиксируется сценарием и не переключается по протоколу (§2) —
        // портал зеркалит режим прибора, а не выбирает его.
        this.appMode = "ferment";
        this.beginFerment();
        break;
      case "distill":
        // H2: appMode фиксируется сценарием и не переключается по протоколу (§2) —
        // портал зеркалит режим прибора, а не выбирает его (паритет с ferment выше).
        this.appMode = "distill";
        this.beginDistill();
        break;
    }
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
