import type { EquipmentProfilePayload } from "../equipment-profiles/contracts";

import { buildStarterEquipmentProfileDefaults } from "./defaults";

/**
 * Пресеты популярных пивоварен.
 *
 * ⚠ Главная ловушка: число в названии модели (BrewZilla 35, Easy Brew 40, Grainfather G30) —
 * это объём БАКА, а не выход пива. В профиле оборудования `targetBatchVolumeL` — холодное
 * сусло в ферментере, поэтому сюда идёт реальный выход (G30 → 23 л при баке 30 л).
 *
 * Цифры сведены из паспортов производителей и пользовательских замеров. Там, где паспорт
 * расходится с практикой (испарение, эффективность), берём практику: пресет должен попадать
 * в реальную варку, а не в маркетинг. Расхождения помечены в `notes` пресета.
 */

export type EquipmentPresetSystemKind = "all_in_one" | "malt_pipe" | "two_vessel";

export type EquipmentPreset = {
  id: string;
  brand: string;
  /** Название модели без бренда — в списке идёт под группой бренда. */
  model: string;
  /**
   * Объём бака. null — если производитель его не публикует: у Braumeister число в
   * названии модели означает литры готового пива, а не размер котла.
   */
  vesselVolumeL: number | null;
  systemKind: EquipmentPresetSystemKind;
  /** Паспортный потолок засыпи, кг — подсказка, в контракт профиля не входит. */
  maxGrainKg: number;
  profile: EquipmentProfilePayload;
};

const GRAIN_ABSORPTION_DEFAULT = 0.8;
const COOLING_SHRINKAGE_DEFAULT = 4;

/** Поля с общим для всех пивоварен дефолтом можно не указывать в каждом пресете. */
type EquipmentPresetDefaulted = "grainAbsorptionLPerKg" | "coolingShrinkagePct" | "hopUtilizationFactor" | "altitudeM";

type EquipmentPresetInput = Omit<EquipmentPreset, "profile"> & {
  profile: Omit<EquipmentProfilePayload, "name" | EquipmentPresetDefaulted> &
    Partial<Pick<EquipmentProfilePayload, EquipmentPresetDefaulted>>;
};

const preset = (input: EquipmentPresetInput): EquipmentPreset => ({
  ...input,
  profile: {
    grainAbsorptionLPerKg: GRAIN_ABSORPTION_DEFAULT,
    coolingShrinkagePct: COOLING_SHRINKAGE_DEFAULT,
    hopUtilizationFactor: 1,
    altitudeM: 0,
    ...input.profile,
    // Рабочий потолок засыпи едет в профиль, иначе движок о нём не узнает и пересчёт
    // чужого плотного рецепта молча выдаст план, который не влезает в корзину.
    maxGrainKg: input.maxGrainKg,
    name: `${input.brand} ${input.model}`
  }
});

/**
 * Easy Brew и iBrew — физически одна и та же пивоварня (китайский OEM Guten, заводские
 * коды BM-S400M-1 / BM-S500M-1); отличаются только шильдиком магазина, который её
 * привозит. Паспортные цифры у них при этом разные, поэтому профиль строим один — по
 * замерам владельцев, а не по карточкам магазинов.
 */
const gutenClone = (
  brand: string,
  model: string,
  base: Omit<EquipmentPresetInput, "brand" | "model">
): EquipmentPreset => preset({ ...base, brand, model, id: `${base.id}_${brand.toLowerCase().replace(/\s+/g, "")}` });

const gutenBase = {
  40: {
    id: "guten_40",
    vesselVolumeL: 40,
    systemKind: "all_in_one" as const,
    maxGrainKg: 7,
    profile: {
      targetBatchVolumeL: 23,
      brewhouseEfficiencyPct: 72,
      evaporationRateLPerHr: 3.5,
      trubChillerLossL: 2,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.9,
      mashThicknessLPerKg: 2.5,
      mashTunDeadspaceL: 7,
      minMashVolumeL: null,
      maxMashVolumeL: 26,
      maxKettleVolumeL: 30,
      notes: "All-in-one с солодовой корзиной и рециркуляцией, ТЭН впаян в дно. Наливать можно до 30 л (метка «полная линия»), а не 40. Паспортная засыпь 9,5-10 кг — вместимость корзины, рабочий потолок 6-7 кг. Эффективность без ручного перемешивания затора падает до 50-65%, с перемешиванием — 72-78%: если мешаете руками, поднимите её в профиле. Под корзиной стекает ~7 л, которые в затирании не участвуют."
    }
  },
  50: {
    id: "guten_50",
    // В карточках «50 л», в паспорте — 52 л до края.
    vesselVolumeL: 52,
    systemKind: "all_in_one" as const,
    maxGrainKg: 9,
    profile: {
      targetBatchVolumeL: 35,
      brewhouseEfficiencyPct: 73,
      evaporationRateLPerHr: 5,
      trubChillerLossL: 3,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.9,
      mashThicknessLPerKg: 2.5,
      mashTunDeadspaceL: 7,
      minMashVolumeL: null,
      maxMashVolumeL: 40,
      maxKettleVolumeL: 45,
      notes: "All-in-one с солодовой корзиной и рециркуляцией, ТЭН впаян в дно. Наливать можно до 45 л, а не 50. Паспортная засыпь 10-12,5 кг — вместимость корзины, рабочий потолок 8-9 кг (дальше забивается фильтр-базука). Выпаривание ~11% за час, регулируется крышкой. Заявленные 73% достижимы только с ручным перемешиванием затора; без него будет 55-65%."
    }
  },
  70: {
    id: "guten_70",
    vesselVolumeL: 70,
    systemKind: "all_in_one" as const,
    maxGrainKg: 12,
    profile: {
      targetBatchVolumeL: 50,
      brewhouseEfficiencyPct: 73,
      evaporationRateLPerHr: 6,
      trubChillerLossL: 3.5,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.9,
      mashThicknessLPerKg: 2.5,
      mashTunDeadspaceL: 7,
      minMashVolumeL: null,
      maxMashVolumeL: 55,
      maxKettleVolumeL: 65,
      notes: "All-in-one с солодовой корзиной и рециркуляцией, ТЭН впаян в дно. Наливать можно до 65 л, а не 70. Паспортная засыпь 16,5-18,5 кг — вместимость корзины, рабочий потолок ~12 кг (при 14 кг пригорает). Заявленные 3000-3200 Вт завышены: продавец признал реальные ~2500 Вт, кипение слабое. Мёртвый объём под корзиной для этой модели точно не измерен, взят как у младших."
    }
  }
};

export const equipmentPresets: EquipmentPreset[] = [
  // ── Grainfather (Новая Зеландия) ─────────────────────────────────────────────
  // Спеки: help.grainfather.com (tech specs G30³/G40/G70²/S40) + формулы Recipe Creator:
  // затор = 2.7 л/кг × засыпь + мёртвый объём под корзиной. Grainfather прямо
  // предупреждает, что сторонний софт без этого слагаемого недоливает затор.
  //
  // Испарение у G40/G70 в паспорте занижено (2-3 л/ч), по замерам владельцев — 4-5 л/ч.
  preset({
    id: "grainfather_g30",
    brand: "Grainfather",
    model: "G30",
    vesselVolumeL: 30,
    systemKind: "all_in_one",
    maxGrainKg: 8,
    profile: {
      targetBatchVolumeL: 22,
      brewhouseEfficiencyPct: 75,
      evaporationRateLPerHr: 3,
      trubChillerLossL: 2,
      fermenterLossL: 0,
      mashThicknessLPerKg: 2.7,
      mashTunDeadspaceL: 3.5,
      minMashVolumeL: null,
      maxMashVolumeL: 27,
      maxKettleVolumeL: 28,
      notes: "All-in-one с солодовой корзиной и рециркуляцией. Засыпь до 8 кг (9 кг с top plate). ТЭН 2000 Вт. Потери в counterflow-чиллере ~1 л. Макс. объём кипячения — 28 л, а не 30. Grainfather обещает 23 л, но в своей формуле не учитывает усадку сусла при остывании: холодного в ферментер попадает около 22 л."
    }
  }),
  preset({
    id: "grainfather_g40",
    brand: "Grainfather",
    model: "G40",
    // 40 в названии — это максимальная партия, а не бак: предел кипячения 46 л.
    vesselVolumeL: null,
    systemKind: "all_in_one",
    maxGrainKg: 12,
    profile: {
      targetBatchVolumeL: 36,
      brewhouseEfficiencyPct: 78,
      evaporationRateLPerHr: 4.5,
      trubChillerLossL: 3,
      fermenterLossL: 0,
      mashThicknessLPerKg: 2.7,
      mashTunDeadspaceL: 7.4,
      minMashVolumeL: null,
      maxMashVolumeL: 42,
      maxKettleVolumeL: 46,
      notes: "All-in-one с солодовой корзиной и рециркуляцией. Засыпь: 12 кг рекомендованный максимум (13 кг влезает физически). ТЭН 3150 Вт. Испарение в паспорте (2-3 л/ч) занижено — по замерам владельцев 4-5 л/ч. Мёртвый объём под корзиной в паспорте 6,9 л, по замерам 7,4."
    }
  }),
  preset({
    id: "grainfather_g70",
    brand: "Grainfather",
    model: "G70",
    // 70 в названии — это предельный объём кипячения, а не бак.
    vesselVolumeL: null,
    systemKind: "all_in_one",
    maxGrainKg: 16,
    profile: {
      targetBatchVolumeL: 58,
      brewhouseEfficiencyPct: 78,
      evaporationRateLPerHr: 4.5,
      trubChillerLossL: 3,
      fermenterLossL: 0,
      mashThicknessLPerKg: 2.7,
      mashTunDeadspaceL: 6.8,
      minMashVolumeL: null,
      maxMashVolumeL: 52,
      maxKettleVolumeL: 70,
      notes: "All-in-one с солодовой корзиной и рециркуляцией. Засыпь 8-16 кг (17 кг с top plate). ТЭН 3150 Вт. Потери в чиллере 2-3 л."
    }
  }),
  preset({
    id: "grainfather_s40",
    brand: "Grainfather",
    model: "S40",
    // 40 в названии — это максимальная партия, а не бак: предел кипячения 46 л.
    vesselVolumeL: null,
    systemKind: "all_in_one",
    maxGrainKg: 10,
    profile: {
      targetBatchVolumeL: 38,
      brewhouseEfficiencyPct: 72,
      evaporationRateLPerHr: 3,
      trubChillerLossL: 2,
      fermenterLossL: 0,
      mashThicknessLPerKg: 2.7,
      mashTunDeadspaceL: 7,
      minMashVolumeL: null,
      maxMashVolumeL: 36,
      maxKettleVolumeL: 46,
      notes: "Упрощённая S-серия: рециркуляция со спреером, иммерсионный чиллер, без приложения. Засыпь 5-10 кг. ТЭН 2300 Вт — слабее, чем у G40, поэтому и кипит спокойнее."
    }
  }),

  // ── KegLand BrewZilla (Австралия) ────────────────────────────────────────────
  // Актуальное поколение — Gen 4.1 (Gen 5 не существует). Паспортная засыпь (11.5 кг
  // на 35 л) — это вместимость корзины, а не рабочий лимит: вода и зерно одновременно
  // в котёл не помещаются. Реальный потолок ~7 кг. Батч 23 л подтверждён самим KegLand —
  // PID в мануале откалиброван под "fermenter volume of 23L".
  preset({
    id: "brewzilla_35",
    brand: "BrewZilla",
    model: "35 л (Gen 4)",
    vesselVolumeL: 35,
    systemKind: "all_in_one",
    maxGrainKg: 7,
    profile: {
      targetBatchVolumeL: 23,
      brewhouseEfficiencyPct: 72,
      evaporationRateLPerHr: 3.5,
      trubChillerLossL: 1.5,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.9,
      mashThicknessLPerKg: 3.2,
      mashTunDeadspaceL: 2,
      minMashVolumeL: null,
      maxMashVolumeL: 28,
      maxKettleVolumeL: 30,
      notes: "All-in-one с солодовой корзиной и рециркуляцией. ТЭН 2400 Вт (1900+500). Паспортная засыпь 11,5 кг — вместимость корзины, рабочий потолок ~7 кг. Эффективность сильно зависит от помола: при грубом падает до 60%, при тонком доходит до 84%."
    }
  }),
  preset({
    id: "brewzilla_65",
    brand: "BrewZilla",
    model: "65 л (Gen 4)",
    vesselVolumeL: 65,
    systemKind: "all_in_one",
    maxGrainKg: 12,
    profile: {
      targetBatchVolumeL: 45,
      brewhouseEfficiencyPct: 72,
      evaporationRateLPerHr: 4.5,
      trubChillerLossL: 2,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.9,
      mashThicknessLPerKg: 3.2,
      mashTunDeadspaceL: 3.5,
      minMashVolumeL: null,
      maxMashVolumeL: 50,
      maxKettleVolumeL: 58,
      notes: "All-in-one с солодовой корзиной и рециркуляцией. ТЭН 3500 Вт (2000+1000+500), нужна линия на 15 А. Паспортная засыпь 18,5 кг — вместимость корзины, на практике 11-12 кг. Реальный выход 40-52 л в зависимости от плотности."
    }
  }),

  // ── Easy Brew и iBrew — один и тот же аппарат под двумя шильдиками ────────────
  gutenClone("Easy Brew", "40 л", gutenBase[40]),
  gutenClone("Easy Brew", "50 л", gutenBase[50]),
  gutenClone("Easy Brew", "70 л", gutenBase[70]),
  gutenClone("iBrew", "40 л", gutenBase[40]),
  gutenClone("iBrew", "50 л", gutenBase[50]),
  gutenClone("iBrew", "70 л", gutenBase[70]),

  // ── Бавария (ИП Гайнутдинов, Киров) ──────────────────────────────────────────
  // Число в названии — объём котла. Часть дилеров называет модели по выходу сусла,
  // из-за чего «Бавария 50» у разных продавцов — два разных аппарата.
  // Особенность конструкции: ТЭНы на стенке, поэтому есть жёсткий минимум воды в заторе —
  // при жидком гидромодуле ниже нормы верхние ТЭНы оголяются и горят.
  preset({
    id: "bavaria_30",
    brand: "Бавария",
    model: "30 л",
    vesselVolumeL: 30,
    systemKind: "all_in_one",
    maxGrainKg: 3.5,
    profile: {
      targetBatchVolumeL: 11,
      brewhouseEfficiencyPct: 60,
      evaporationRateLPerHr: 2,
      trubChillerLossL: 4.3,
      fermenterLossL: 0,
      mashThicknessLPerKg: 5,
      mashTunDeadspaceL: 0,
      minMashVolumeL: 15,
      maxMashVolumeL: 20,
      maxKettleVolumeL: 26,
      notes: "All-in-one: котёл с ТЭНами + съёмная заторная корзина, рециркуляция насосом. Выход всего 10-12 л при котле 30 л — очень большая доля потерь (несливаемый остаток ~4,3 л). Засыпь до 3,5 кг. ⚠ Минимум 15 л воды в заторнике: насос перекачивает воду наверх, и ниже этого ТЭНы оголяются и горят. Пользовательских замеров по этой модели мало."
    }
  }),
  preset({
    id: "bavaria_50",
    brand: "Бавария",
    model: "50 л",
    vesselVolumeL: 50,
    systemKind: "all_in_one",
    maxGrainKg: 6.5,
    profile: {
      targetBatchVolumeL: 28,
      brewhouseEfficiencyPct: 65,
      evaporationRateLPerHr: 4.5,
      trubChillerLossL: 5,
      fermenterLossL: 0,
      mashThicknessLPerKg: 4.5,
      mashTunDeadspaceL: 0,
      minMashVolumeL: 25,
      maxMashVolumeL: 30,
      maxKettleVolumeL: 42,
      notes: "All-in-one: котёл с ТЭНами + съёмная заторная корзина, рециркуляция насосом. Рабочая засыпь 6-6,5 кг: паспортные 8,5 кг — фикция, солод выдавливает фильтрующую сетку. 65% — потолок штатной схемы с промывкой прямо в баке; если мешать затор руками, реально 75-85% — поднимите эффективность в профиле. Несливаемый остаток ~4,7 л плюс брух. ⚠ Минимум 25 л воды в заторнике, иначе оголяются верхние ТЭНы."
    }
  }),
  preset({
    id: "bavaria_70",
    brand: "Бавария",
    model: "70 л",
    vesselVolumeL: 70,
    systemKind: "all_in_one",
    maxGrainKg: 10,
    profile: {
      targetBatchVolumeL: 45,
      brewhouseEfficiencyPct: 65,
      evaporationRateLPerHr: 6,
      trubChillerLossL: 5,
      fermenterLossL: 0,
      mashThicknessLPerKg: 4.5,
      mashTunDeadspaceL: 0,
      minMashVolumeL: 35,
      maxMashVolumeL: 48,
      maxKettleVolumeL: 65,
      notes: "All-in-one: котёл с ТЭНами + съёмная заторная корзина, два насоса рециркуляции. Рабочая засыпь 9-10 кг: при 12 кг эффективность обваливается до 47%. Из-за этого потолка машина тянет 45-50 л только на лёгких плотностях (примерно до 1.045) — на плотном пиве объём варки придётся снижать. С ручным перемешиванием затора эффективность поднимается до 75-83%. ⚠ Минимум 35 л воды в заторнике, иначе оголяются верхние ТЭНы."
    }
  }),

  // ── Speidel Braumeister (Германия) ───────────────────────────────────────────
  // Солодовая труба: засыпь зажата между двумя ситами, насос гонит сусло снизу вверх
  // сквозь слой солода.
  //
  // ⚠ Braumeister гидромодулем не описывается: он заливает ФИКСИРОВАННЫЙ объём воды
  // (12 / 23 / 55 л по мануалу) независимо от засыпи — пивовар его не выбирает. Поэтому
  // минимум и максимум заторника здесь равны штатной заливке: сколько бы ни было солода,
  // расчёт даст ровно её. Гидромодуль остаётся страховкой сверху: если засыпь перевалит
  // за предел трубы, он поднимет расчётный объём выше максимума и пресет предупредит.
  //
  // Общий объём котла Speidel не публикует, поэтому макс. объём котла оставлен пустым:
  // ограничение здесь идёт по заторнику (метка Max. Füllstand на штанге), а не по кипячению.
  preset({
    id: "braumeister_10",
    brand: "Braumeister",
    model: "10 л",
    vesselVolumeL: null,
    systemKind: "malt_pipe",
    maxGrainKg: 2.5,
    profile: {
      targetBatchVolumeL: 10,
      brewhouseEfficiencyPct: 70,
      evaporationRateLPerHr: 2,
      trubChillerLossL: 2,
      fermenterLossL: 0,
      mashThicknessLPerKg: 4.3,
      mashTunDeadspaceL: 0,
      minMashVolumeL: 12,
      maxMashVolumeL: 12,
      maxKettleVolumeL: null,
      notes: "All-in-one с солодовой трубой и рециркуляцией снизу вверх. ТЭН 1200 Вт. Заливает штатные 12 л воды. Предельная засыпь 2,8 кг, рабочая — 2,5 кг: выше начинается прессование слоя и вымывание падает. Ходовые 80-90% — это эффективность затирания, а не варочного цеха: у цеха реально 65-78%. Помол Speidel требует крупный, 1,6 мм."
    }
  }),
  preset({
    id: "braumeister_20",
    brand: "Braumeister",
    model: "20 л",
    vesselVolumeL: null,
    systemKind: "malt_pipe",
    maxGrainKg: 5,
    profile: {
      targetBatchVolumeL: 21,
      brewhouseEfficiencyPct: 68,
      evaporationRateLPerHr: 3.5,
      trubChillerLossL: 3,
      fermenterLossL: 0,
      mashThicknessLPerKg: 3.8,
      mashTunDeadspaceL: 0,
      minMashVolumeL: 23,
      maxMashVolumeL: 23,
      maxKettleVolumeL: null,
      notes: "All-in-one с солодовой трубой и рециркуляцией снизу вверх. ТЭН 2000 Вт. Заливает штатные 23 л воды. Предельная засыпь 6 кг (7 кг с LOB-комплектом), но эффективность резко падает с ростом засыпи: 68% при 3-4,5 кг, 63% при 4,5-6 кг, ниже 58% при 6+ кг — поэтому рабочей взята засыпь 5 кг. Колпак срезает испарение примерно вдвое. В отличие от большинства пивоварен, номинал модели честный: выход в ферментер ~21 л."
    }
  }),
  preset({
    id: "braumeister_50",
    brand: "Braumeister",
    model: "50 л",
    vesselVolumeL: null,
    systemKind: "malt_pipe",
    maxGrainKg: 11,
    profile: {
      targetBatchVolumeL: 50,
      brewhouseEfficiencyPct: 72,
      evaporationRateLPerHr: 4,
      trubChillerLossL: 4,
      fermenterLossL: 0,
      mashThicknessLPerKg: 4.2,
      mashTunDeadspaceL: 0,
      minMashVolumeL: 55,
      maxMashVolumeL: 55,
      maxKettleVolumeL: null,
      notes: "All-in-one с солодовой трубой и рециркуляцией снизу вверх. ТЭН 3200 Вт, нужна линия на 16 А. Заливает штатные 55 л воды. Предельная засыпь 13 кг (15 кг с LOB-комплектом), но оптимум Speidel — 9-11 кг: выше слой прессуется и вымывание падает. Мёртвый объём 3-4 л при наклоне котла (без наклона — до 8-10 л)."
    }
  })
];

export const equipmentStarterPresets = [
  {
    id: "starter_20l",
    label: "Профиль оборудования (1)",
    description: "Эффективность 70%, поглощение воды зерном 0.80 л/кг.",
    profile: buildStarterEquipmentProfileDefaults()
  }
];
