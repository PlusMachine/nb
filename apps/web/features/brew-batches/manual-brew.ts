import { buildBrewDaySteps, formatBrewAdditionAmount, groupsForAct } from "./brew-day";
import { brewDayStages, brewDayStageLabels, type BrewDayProgress, type BrewDayStageGroup, type BrewDayStep, type BrewPlanSnapshot } from "./contracts";
import { stepRemainingSeconds } from "./components/brew-day-timer";

export type ManualBrewPhase = { id: string; label: string; steps: BrewDayStep[] };
const record = (raw: unknown): Record<string, unknown> => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
const key = (raw: Record<string, unknown>, index: number) => String(raw.linePersistentKey ?? raw.id ?? `idx-${index}`);

/** Same persisted IDs as the old guide; presentation and scheduling can evolve independently. */
export function buildManualBrewSteps(snapshot: BrewPlanSnapshot): BrewDayStageGroup[] {
  const additions = new Map<string, Record<string, unknown>>();
  snapshot.boilPlan.timedAdditions.forEach((raw, index) => additions.set(`${raw.stage}:add:${key(raw, index)}`, raw));
  snapshot.whirlpoolPlan.forEach((raw, index) => additions.set(`whirlpool:${key(raw, index)}`, raw));
  snapshot.dryHopPlan.forEach((raw, index) => additions.set(`ferment:add:${key(raw, index)}`, raw));
  snapshot.packagingAdditions.forEach((raw, index) => additions.set(`packaging:add:${key(raw, index)}`, raw));
  const groups = buildBrewDaySteps(snapshot).map(group => ({ ...group, steps: group.steps.map(original => {
    const step = { ...original };
    const raw = additions.get(step.id);
    if (raw) {
      const meta = record(raw.stepMeta);
      step.ingredientCategory = typeof raw.category === "string" ? raw.category : null;
      step.ingredientName = typeof raw.name === "string" ? raw.name : "Ингредиент";
      step.amountLabel = formatBrewAdditionAmount(raw);
      step.useType = typeof meta.useType === "string" ? meta.useType : null;
      if (!step.ingredientCategory && step.useType && ["boil", "first_wort_hop", "whirlpool", "dry_hop", "dip_hop", "other"].includes(step.useType)) step.ingredientCategory = "hop";
      if (step.ingredientCategory === "hop") {
        if (step.useType === "dry_hop") step.stage = "fermentation";
        if (step.useType === "whirlpool" || step.useType === "dip_hop") step.stage = "whirlpool";
        if (step.useType === "boil" || step.useType === "first_wort_hop") step.stage = "boil";
      }
      step.title = step.ingredientName;
      if (step.useType === "first_wort_hop") {
        step.boilSecondsBeforeEnd = null;
        step.detail = [step.amountLabel, "в первое сусло"].filter(Boolean).join(" · ");
        step.instructions = "Внесите хмель в котёл перед сбором первого сусла.";
      }
      if (step.useType === "dip_hop") step.instructions = "Подготовьте хмель и выполните выдержку при температуре из рецепта перед внесением дрожжей.";
      if (step.stage === "whirlpool") {
        const minutes = typeof meta.timeMinutes === "number" ? meta.timeMinutes : typeof meta.durationMinutes === "number" ? meta.durationMinutes : null;
        step.durationSeconds = minutes != null && minutes > 0 ? Math.round(minutes * 60) : null;
        step.kind = step.durationSeconds != null ? "timer" : "addition";
        step.temperatureC = typeof meta.temperatureC === "number" ? meta.temperatureC : typeof meta.tempC === "number" ? meta.tempC : null;
        step.boilSecondsBeforeEnd = null;
      }
      if (typeof meta.stageLabel === "string" && meta.stageLabel.trim()) step.instructions = [step.instructions, meta.stageLabel.trim()].filter(Boolean).join(" ");
      if (step.stage === "fermentation") {
        const days = typeof meta.durationDays === "number" && meta.durationDays > 0 ? meta.durationDays : null;
        step.boilSecondsBeforeEnd = null;
        step.durationSeconds = null;
        step.kind = "addition";
        step.detail = [step.amountLabel, days != null ? `держать ${days.toLocaleString("ru-RU")} дн.` : null].filter(Boolean).join(" · ");
        if (days != null) step.instructions = [step.instructions, `Держите ${days.toLocaleString("ru-RU")} дн.`].filter(Boolean).join(" ");
      }
    }
    if (step.id === "mash:dough-in") step.instructions = "Перемешайте, чтобы не осталось комков.";
    if (step.id === "mash:acid") step.title = "Внесите кислоту в воду";
    if (step.id === "mash:lauter") step.title = "Слив сусла и промывка";
    if (step.detail) step.detail = step.detail.replace(/(\d)\.(\d)/g, "$1,$2");
    if (step.amountLabel) step.amountLabel = step.amountLabel.replace(/(\d)\.(\d)/g, "$1,$2");
    const schedule = snapshot.waterSchedule;
    const salts = step.id === "mash:water-salts" ? schedule?.mashSalts : step.id === "mash:sparge-water" ? schedule?.spargeSalts : null;
    const acid = step.id === "mash:acid" ? schedule?.mashAcid : step.id === "mash:sparge-water" ? schedule?.spargeAcid : null;
    if (salts || acid) step.items = [
      ...(salts ?? []).map((salt, i) => ({ id: `${step.id}:salt:${i}`, label: salt.label, amount: `${salt.grams.toLocaleString("ru-RU")} г` })),
      ...(acid ? [{ id: `${step.id}:acid`, label: acid.label, amount: `${acid.ml.toLocaleString("ru-RU")} мл` }] : [])
    ];
    return step;
  }) }));
  // Old snapshots can contain the same line in two lists. Prefer the stage-specific ID.
  const unique = new Map<string, BrewDayStep>();
  for (const step of groups.flatMap(group => group.steps)) {
    const raw = additions.get(step.id);
    const lineKey = raw?.linePersistentKey ?? raw?.id;
    const identity = lineKey == null ? step.id : `line:${lineKey}`;
    const previous = unique.get(identity);
    const preferredPrefix = step.stage === "fermentation" ? "ferment:add:" : step.stage === "whirlpool" ? "whirlpool:" : `${step.stage}:add:`;
    if (!previous || step.id.startsWith(preferredPrefix)) unique.set(identity, step);
  }
  groups.splice(0, groups.length, ...brewDayStages.map(stage => ({ stage, label: brewDayStageLabels[stage], steps: [...unique.values()].filter(step => step.stage === stage) })).filter(group => group.steps.length));
  const finish: BrewDayStep[] = [
    { id: "brew:transfer", stage: "chill", kind: "task", title: "Перелейте сусло в ферментер", detail: "Измерьте плотность до внесения дрожжей.", durationSeconds: null, temperatureC: null },
    { id: "brew:pitch", stage: "chill", kind: "task", title: "Внесите дрожжи", detail: "Внесите дрожжи по рецепту, закройте ферментер и установите гидрозатвор.", durationSeconds: null, temperatureC: null }
  ];
  const chill = groups.find(group => group.stage === "chill");
  const other: BrewDayStep[] = (snapshot.otherAdditions ?? []).map((raw, index) => ({
    id: `brew:other:${key(raw, index)}`, stage: "chill", kind: "addition", title: typeof raw.name === "string" ? raw.name : "Хмель",
    ingredientName: typeof raw.name === "string" ? raw.name : "Хмель", ingredientCategory: "hop", amountLabel: formatBrewAdditionAmount(raw),
    instructions: typeof record(raw.stepMeta).stageLabel === "string" ? String(record(raw.stepMeta).stageLabel) : "Этап внесения в рецепте не указан. Выполните по своему плану.",
    detail: formatBrewAdditionAmount(raw), durationSeconds: null, temperatureC: null
  }));
  finish.unshift(...other);
  if (chill) chill.steps.push(...finish);
  else groups.splice(groups.findIndex(group => group.stage === "fermentation") < 0 ? groups.length : groups.findIndex(group => group.stage === "fermentation"), 0, { stage: "chill", label: "Перелив и дрожжи", steps: finish });
  return groups;
}

export function manualBrewPhases(groups: BrewDayStageGroup[]): ManualBrewPhase[] {
  const steps = groupsForAct(groups, "brewday").flatMap(group => group.steps);
  const waterIds = new Set(["mash:strike", "mash:water-salts", "mash:acid"]);
  const spargeIds = new Set(["mash:sparge-water", "mash:lauter"]);
  const firstWort = steps.filter(step => step.useType === "first_wort_hop");
  const mash = steps.filter(step => step.stage === "mash" && !waterIds.has(step.id) && !spargeIds.has(step.id));
  const mashPrep = mash.filter(step => step.id === "mash:dough-in" || step.id === "mash:ph-check");
  const mashAdditions = mash.filter(step => step.kind === "addition");
  const rests = mash.filter(step => !mashPrep.includes(step) && !mashAdditions.includes(step));
  const orderStands = (items: BrewDayStep[]) => {
    const ordered: BrewDayStep[] = [];
    for (let i = 0; i < items.length;) {
      let end = i + 1;
      while (end < items.length && items[end].temperatureC === items[i].temperatureC) end += 1;
      ordered.push(...items.slice(i, end).sort((a, b) => (b.durationSeconds ?? Infinity) - (a.durationSeconds ?? Infinity)));
      i = end;
    }
    return ordered;
  };
  const phases = [
    { id: "water", label: "Вода", steps: steps.filter(step => waterIds.has(step.id)) },
    { id: "mash", label: "Затирание", steps: [...mashPrep, ...mashAdditions, ...rests] },
    { id: "sparge", label: steps.some(step => step.id === "mash:lauter") ? "Слив сусла и промывка" : "Первое сусло", steps: [...steps.filter(step => step.id === "mash:sparge-water"), ...firstWort, ...steps.filter(step => step.id === "mash:lauter")] },
    { id: "boil", label: "Кипячение", steps: steps.filter(step => step.stage === "boil" && step.useType !== "first_wort_hop") },
    { id: "whirlpool", label: "Вирпул", steps: orderStands(steps.filter(step => step.stage === "whirlpool" && step.useType !== "dip_hop")) },
    { id: "dip", label: "Дип-хоппинг", steps: orderStands(steps.filter(step => step.useType === "dip_hop")) },
    { id: "chill", label: "Охлаждение", steps: steps.filter(step => step.id === "chill:target") },
    { id: "other", label: "Другие внесения хмеля", steps: steps.filter(step => step.id.startsWith("brew:other:")) },
    { id: "finish", label: "Перелив и дрожжи", steps: steps.filter(step => step.id === "brew:transfer" || step.id === "brew:pitch") }
  ];
  return phases.filter(phase => phase.steps.length > 0);
}

export function resolveManualBrewFocus(phases: ManualBrewPhase[], progress: BrewDayProgress, now: number | null) {
  const boil = phases.flatMap(p => p.steps).find(step => step.id === "boil:timer") ?? null;
  const boilState = boil ? progress.steps[boil.id] : undefined;
  const boilRemaining = boil && now != null ? stepRemainingSeconds(boil, boilState, now) : null;
  let phaseIndex = phases.findIndex(phase => phase.steps.some(step => !progress.steps[step.id]?.done));
  if (boilState?.timerStartedAt && !boilState.done && boilRemaining != null) {
    const duePhase = phases.findIndex(phase => phase.id === "boil" && phase.steps.some(step => !progress.steps[step.id]?.done && step.boilSecondsBeforeEnd != null && boilRemaining <= step.boilSecondsBeforeEnd));
    if (duePhase >= 0) phaseIndex = duePhase;
  }
  const phase = phases[phaseIndex] ?? null;
  const pending = phase?.steps.filter(step => !progress.steps[step.id]?.done) ?? [];
  let current = pending[0] ?? null;
  let companions: BrewDayStep[] = current ? [current] : [];
  let holdRemaining: number | null = null;
  let holdOrigin: number | null = null;
  let holdBlock: BrewDayStep[] | null = null;
  if (phase?.id === "boil" && boil && boilState?.timerStartedAt) {
    const additions = pending.filter(step => step.boilSecondsBeforeEnd != null);
    const due = additions.filter(step => boilState.done || (boilRemaining != null && boilRemaining <= step.boilSecondsBeforeEnd!));
    current = due[0] ?? pending.find(step => step.id === boil.id) ?? additions[0] ?? current;
    companions = current ? due.length && current.boilSecondsBeforeEnd != null
      ? due.filter(step => step.boilSecondsBeforeEnd === current!.boilSecondsBeforeEnd)
      : [current] : [];
  } else if (current?.stage === "whirlpool") {
    // Contact durations share one stand. 20 + 10 minutes means an addition at
    // the beginning and another after 10 minutes, not two consecutive stands.
    const position = phase!.steps.findIndex(step => step.id === current!.id);
    const matches = (step: BrewDayStep) => step.temperatureC === pending[0].temperatureC && step.useType === pending[0].useType;
    let left = position, right = position;
    while (left > 0 && matches(phase!.steps[left - 1])) left -= 1;
    while (right + 1 < phase!.steps.length && matches(phase!.steps[right + 1])) right += 1;
    const block = phase!.steps.slice(left, right + 1);
    holdBlock = block;
    const longest = Math.max(0, ...block.map(step => step.durationSeconds ?? 0));
    const started = block.filter(step => progress.steps[step.id]?.timerStartedAt);
    const ends = started.map(step => Date.parse(progress.steps[step.id].timerStartedAt!) + (progress.steps[step.id].timerDurationSeconds ?? step.durationSeconds ?? 0) * 1000).filter(Number.isFinite);
    holdOrigin = ends.length ? Math.max(...ends) - longest * 1000 : null;
    const waiting = block.filter(step => !progress.steps[step.id]?.done && !progress.steps[step.id]?.timerStartedAt);
    const due = waiting.filter(step => holdOrigin === null || now !== null && now >= holdOrigin + (longest - (step.durationSeconds ?? longest)) * 1000)
      .sort((a, b) => (b.durationSeconds ?? longest) - (a.durationSeconds ?? longest));
    const holding = started.filter(step => !progress.steps[step.id]?.done);
    holdRemaining = now !== null && holding.length ? Math.max(...holding.map(step => stepRemainingSeconds(step, progress.steps[step.id], now) ?? 0)) : null;
    if (due.length) {
      current = due[0];
      companions = due.filter(step => step.kind === current!.kind && step.durationSeconds === current!.durationSeconds);
    } else if (holding.length) {
      current = holding[0];
      companions = holding;
    }
  } else if (current?.items?.length && current.id !== "mash:sparge-water") {
    companions = pending.filter(step => step.items?.length);
  }
  const candidates = phase?.id === "boil" ? [...phase.steps.filter(step => step.id !== "boil:timer"), ...phase.steps.filter(step => step.id === "boil:timer")]
    : holdBlock ? [...holdBlock.filter(step => !progress.steps[step.id]?.timerStartedAt), ...holdBlock.filter(step => progress.steps[step.id]?.timerStartedAt), ...phase!.steps.filter(step => !holdBlock!.includes(step))] : phase?.steps;
  const next = candidates?.find(step => step.id !== current?.id && !companions.some(peer => peer.id === step.id) && !progress.steps[step.id]?.done)
    ?? phases.slice(phaseIndex + 1).flatMap(p => p.steps).find(step => !progress.steps[step.id]?.done) ?? null;
  const nextUntilSeconds = next?.stage === "whirlpool" && !progress.steps[next.id]?.timerStartedAt && holdBlock?.includes(next) && holdOrigin !== null && now !== null && phase
    ? (holdOrigin + (Math.max(0, ...phase.steps.filter(item => item.temperatureC === next.temperatureC).map(item => item.durationSeconds ?? 0)) - (next.durationSeconds ?? 0)) * 1000 - now) / 1000
    : null;
  return { phase, phaseIndex, current, companions, next, boil, boilRemaining, holdRemaining, holdOrigin, nextUntilSeconds };
}

export function manualStepAction(step: BrewDayStep): string {
  if (step.id === "mash:strike") return "Вода нагрета";
  if (step.id === "mash:dough-in") return "Солод внесён";
  if (step.id === "mash:lauter") return "Промывка завершена";
  if (step.id === "chill:target") return "Сусло охлаждено";
  if (step.ingredientCategory === "hop") return "Хмель внесён";
  if (step.kind === "addition") return "Добавки внесены";
  return "Шаг завершён";
}
