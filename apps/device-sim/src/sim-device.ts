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
  stageName,
  decodeFaults,
  CommandSchema,
  DeviceRecipeSchema,
  TelemetrySchema,
  type Stage,
  type HeatMode,
  type Prompt,
  type Telemetry,
  type Command,
  type Ack,
  type AckReason,
  type DeviceRecipe,
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
const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

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

  // --- план варки ---
  private plan: PlanStep[] = [];
  private stepIdx = 0;
  private stageElapsed = 0; // варочные секунды в текущем шаге
  private waitingAck = false;
  private activePrompt: Prompt = "NONE";

  private readonly log: LogEntry[] = [];
  private readonly listeners = new Set<TelemetryListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

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
      slots: this.slots.map((r, i) => ({ slot: i, name: r ? r.name : null })),
    };
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

    this.updateThermal(dtReal);
    this.updateOutputs();
    this.emit();
  }

  /** Простая тепловая модель: температура тянется к целевой. */
  private updateThermal(dtReal: number): void {
    const heatingFault = this.faultMask !== 0;
    let target: number;
    if (this.stage === "COOLING") {
      target = this.setpointC; // охлаждаемся к целевой
    } else if (this.stage === "IDLE" || this.stage === "DONE" || heatingFault) {
      target = AMBIENT_C; // дрейф к окружающей
    } else if (this.heatMode === "OFF") {
      target = AMBIENT_C;
    } else {
      target = this.setpointC;
    }

    const err = target - this.primaryC;
    // скорость сходимости масштабируем ускорением, но ограничиваем
    const k = clamp(0.05 * this.cfg.tickScale * dtReal, 0, 0.9);
    this.primaryC += err * k;
    // чуть шума
    this.primaryC += (Math.random() - 0.5) * 0.05;
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
