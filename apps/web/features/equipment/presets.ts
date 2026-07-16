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
      notes: "Паспортная засыпь 9,5-10 кг — это вместимость корзины; рабочий максимум 6-7 кг.\nБез перемешивания затора эффективность 50-65%, с перемешиванием — 72-78%: если мешаете вручную, поднимите её в профиле."
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
      notes: "Паспортная засыпь 10-12,5 кг — это вместимость корзины; рабочий максимум 8-9 кг, выше забивается фильтр-базука.\n73% эффективности достижимы только с перемешиванием затора; без него — 55-65%."
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
      // Мёртвый объём под корзиной для 70-й модели производителем не публикуется и
      // точных замеров нет — взят как у младших Guten.
      notes: "Паспортная засыпь 16,5-18,5 кг — это вместимость корзины; рабочий максимум ~12 кг, при 14 кг пригорает.\nКипение слабее заявленного (реальная мощность ниже паспортной) — выпаривание может быть меньше расчётного, уточните по своим варкам."
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
      notes: "Заявленный выход 23 л не учитывает усадку при остывании: холодного сусла в ферментере будет ~22 л.\nС верхним ситом засыпь можно поднять с 8 до 9 кг."
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
      notes: "Паспортное выпаривание (2-3 л/ч) занижено, в пресете взяты реальные 4,5 л/ч — уточните по своим варкам.\n13 кг засыпи помещается физически, но рабочий максимум — 12 кг."
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
      notes: "Паспортное выпаривание (2-3 л/ч) занижено, в пресете взяты реальные 4,5 л/ч — уточните по своим варкам.\nС верхним ситом засыпь можно поднять с 16 до 17 кг."
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
      notes: null
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
      notes: "Паспортная засыпь 11,5 кг — это вместимость корзины; рабочий максимум ~7 кг, иначе вода и зерно вместе не помещаются.\nЭффективность сильно зависит от помола: при грубом — около 60%, при тонком — до 84%.\nПрофиль рассчитан на Gen 4/4.1. На Gen 3/3.1.1 поднимите «Мёртвый объём заторника» с 2 до ~6 л — остальное совпадает."
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
      notes: "Паспортная засыпь 18,5 кг — это вместимость корзины; рабочий максимум 11-12 кг, иначе вода и зерно вместе не помещаются.\nРеальный выход 40-52 л в зависимости от плотности рецепта.\nПрофиль рассчитан на Gen 4/4.1. На Gen 3.1.1 поднимите «Мёртвый объём заторника» с 3,5 до ~6 л — остальное совпадает."
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
      // Пользовательских замеров по 30-й модели мало — часть цифр по аналогии со старшими.
      notes: "⚠ Минимум 15 л воды в заторнике: насос гонит воду наверх, ниже этого уровня верхние ТЭНы оголяются и перегорают.\nВыход небольшой относительно котла — велик несливаемый остаток, это учтено в потерях.\nПрофиль подходит и для похожих аппаратов той же конструкции (котёл с ТЭНами на стенке и заторная корзина)."
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
      notes: "⚠ Минимум 25 л воды в заторнике, иначе верхние ТЭНы оголяются и перегорают.\nРабочая засыпь 6-6,5 кг: при паспортных 8,5 кг солод выдавливает фильтрующую сетку.\n65% эффективности — потолок штатной схемы; с перемешиванием затора вручную — 75-85%, тогда поднимите её в профиле.\nПрофиль подходит и для похожих аппаратов той же конструкции (котёл с ТЭНами на стенке и заторная корзина)."
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
      notes: "⚠ Минимум 35 л воды в заторнике, иначе верхние ТЭНы оголяются и перегорают.\nРабочая засыпь 9-10 кг: при 12 кг эффективность падает до 47%. Поэтому 45-50 л получаются только на лёгких плотностях (примерно до 1.045); на плотном пиве объём варки придётся снижать.\nС перемешиванием затора вручную эффективность доходит до 75-83% — тогда поднимите её в профиле.\nПрофиль подходит и для похожих аппаратов той же конструкции (котёл с ТЭНами на стенке и заторная корзина)."
    }
  }),

  // ── Хмельница (Россия) ───────────────────────────────────────────────────────
  // Число в названии — объём бака. Особенность: нагрев ИНДУКЦИЕЙ через дно (магнитное
  // капсульное дно), а не погружным ТЭНом, плюс перемешивание затора моторным миксером,
  // а не насосом рециркуляции. Поэтому, в отличие от «Бавария», жёсткого минимума воды
  // под оголение ТЭНа нет — стенка не греется. Минимум по объёму технологический (миксер),
  // в контракт не заводим. Заявленный «+40% эффективности» — маркетинг: по замерам
  // владельцев варочный цех даёт обычные для мешка/BIAB ~68%, а не больше.
  preset({
    id: "hmelnica_37",
    brand: "Хмельница",
    model: "37 л",
    vesselVolumeL: 37,
    systemKind: "all_in_one",
    maxGrainKg: 9,
    profile: {
      targetBatchVolumeL: 25,
      brewhouseEfficiencyPct: 68,
      evaporationRateLPerHr: 3.5,
      trubChillerLossL: 4.5,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.85,
      mashThicknessLPerKg: 3.2,
      mashTunDeadspaceL: 1.5,
      minMashVolumeL: null,
      maxMashVolumeL: 35,
      maxKettleVolumeL: 36,
      notes: "Паспортная засыпь 12 кг — близко к пределу; рабочий максимум ~8-9 кг, выше мешалка хуже промешивает и эффективность падает.\nМодификации Basis/Лайт/1.0/2.0 отличаются только комплектацией (фильтрация, чиллер) — профиль подходит всем."
    }
  }),
  preset({
    id: "hmelnica_50",
    brand: "Хмельница",
    model: "50 л",
    vesselVolumeL: 50,
    systemKind: "all_in_one",
    maxGrainKg: 12,
    profile: {
      targetBatchVolumeL: 36,
      brewhouseEfficiencyPct: 68,
      evaporationRateLPerHr: 5.5,
      trubChillerLossL: 5.5,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.85,
      mashThicknessLPerKg: 3.2,
      mashTunDeadspaceL: 2,
      minMashVolumeL: null,
      maxMashVolumeL: 45,
      maxKettleVolumeL: 50,
      notes: "Выпаривание заметно гуляет (5-6,5 л/ч) — уточните по своим варкам."
    }
  }),

  // ── Гамбринус (ТПК «Ханхи» / Русская Дымка, Киров) ───────────────────────────
  // ПВК — пароводяной котёл: ТЭН греет воду в рубашке вокруг бака, а не сусло напрямую,
  // затор мешает моторная мешалка, фильтрация — фальшдно. Одна платформа ~55 л (число
  // «55» — объём бака), выхода-варианта на 37 л у бренда нет. Как и у Хмельницы, жёсткого
  // минимума воды под оголение ТЭНа нет (нагрев косвенный, рубашка). Есть технологический
  // минимум варки ~15 л — держим его в заметке, а не в контракте, чтобы не спутать с
  // «Бавария». Паспортные 85-90% эффективности — маркетинг: по расчётам из варок владельцев
  // реально 65-75%.
  preset({
    id: "gambrinus_55",
    brand: "Гамбринус",
    model: "55 л (ПВК)",
    vesselVolumeL: 55,
    systemKind: "all_in_one",
    maxGrainKg: 12,
    profile: {
      targetBatchVolumeL: 40,
      brewhouseEfficiencyPct: 70,
      evaporationRateLPerHr: 3.5,
      trubChillerLossL: 2,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 1,
      mashThicknessLPerKg: 2.5,
      mashTunDeadspaceL: 2,
      minMashVolumeL: null,
      maxMashVolumeL: 48,
      maxKettleVolumeL: 50,
      // Выпаривание и поглощение зерном производителем не публикуются — взяты по аналогии.
      notes: "Механический максимум засыпи 15 кг, рабочий — ~10-12 кг: при 15 кг густой затор встаёт почти под край, без места на промывку.\nДробина под фальшдном не отжимается, поэтому поглощение воды зерном взято высоким.\nТехнологический минимум варки ~15 л."
    }
  }),

  // ── DigiBoil (KegLand, Австралия) ────────────────────────────────────────────
  // Это электрический бак-кипятильник, а НЕ all-in-one: в базе нет ни солодовой корзины,
  // ни насоса рециркуляции. Варят в нём в мешке (BIAB) — либо докупают комплект корзины
  // (DigiMash) и насос. Профиль описывает BIAB-режим: без рециркуляции эффективность
  // ниже, чем у BrewZilla, а испарение из узкого бака выше на литр варки. systemKind
  // помечен all_in_one, потому что варка идёт в одном баке, но насоса тут нет.
  preset({
    id: "digiboil_35",
    brand: "DigiBoil",
    model: "35 л (BIAB)",
    vesselVolumeL: 35,
    systemKind: "all_in_one",
    maxGrainKg: 7,
    profile: {
      targetBatchVolumeL: 21,
      brewhouseEfficiencyPct: 67,
      evaporationRateLPerHr: 2,
      trubChillerLossL: 3,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.8,
      mashThicknessLPerKg: 4.3,
      mashTunDeadspaceL: 1,
      minMashVolumeL: null,
      maxMashVolumeL: 33,
      maxKettleVolumeL: 33,
      notes: "Профиль рассчитан на базовую комплектацию — полнообъёмный BIAB (варка в мешке) без промывки.\nЭффективность без рециркуляции 65-70%; на тонком помоле с отжимом мешка — до 75%.\nЕсли докупили корзину (DigiMash) и насос — поднимите эффективность и снизьте выпаривание в профиле."
    }
  }),
  preset({
    id: "digiboil_65",
    brand: "DigiBoil",
    model: "65 л (BIAB)",
    vesselVolumeL: 65,
    systemKind: "all_in_one",
    maxGrainKg: 14,
    profile: {
      targetBatchVolumeL: 45,
      brewhouseEfficiencyPct: 67,
      evaporationRateLPerHr: 3,
      trubChillerLossL: 3.5,
      fermenterLossL: 0,
      grainAbsorptionLPerKg: 0.8,
      mashThicknessLPerKg: 4,
      mashTunDeadspaceL: 1.5,
      minMashVolumeL: null,
      maxMashVolumeL: 60,
      maxKettleVolumeL: 62,
      notes: "Профиль рассчитан на базовую комплектацию — полнообъёмный BIAB (варка в мешке) без промывки.\nЭффективность без рециркуляции 65-70%; на тонком помоле с отжимом мешка выше.\nЕсли докупили корзину (DigiMash) и насос — поднимите эффективность и снизьте выпаривание в профиле."
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
    brand: "Speidel",
    model: "Braumeister 10 л",
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
      notes: "Braumeister заливает фиксированные 12 л воды независимо от засыпи — поэтому минимум и максимум заторника в профиле совпадают.\nПредельная засыпь 2,8 кг, рабочая — 2,5 кг: выше слой в трубе прессуется и вымывание падает.\nХодовые в отзывах 80-90% — это эффективность затирания; эффективность варочного цеха, которая нужна профилю, — 65-78%.\nSpeidel требует крупный помол, 1,6 мм."
    }
  }),
  preset({
    id: "braumeister_20",
    brand: "Speidel",
    model: "Braumeister 20 л",
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
      notes: "Braumeister заливает фиксированные 23 л воды независимо от засыпи — поэтому минимум и максимум заторника в профиле совпадают.\nПредельная засыпь 6 кг (7 кг с комплектом LOB), но с её ростом эффективность падает: 68% при 3-4,5 кг, 63% при 4,5-6 кг, ниже 58% при 6+ кг — поэтому рабочей взято 5 кг.\nКолпак снижает выпаривание примерно вдвое — если варите с ним, уменьшите его в профиле."
    }
  }),
  preset({
    id: "braumeister_50",
    brand: "Speidel",
    model: "Braumeister 50 л",
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
      notes: "Braumeister заливает фиксированные 55 л воды независимо от засыпи — поэтому минимум и максимум заторника в профиле совпадают.\nПредельная засыпь 13 кг (15 кг с комплектом LOB), оптимум — 9-11 кг: выше слой в трубе прессуется и вымывание падает.\nПри сливе наклоняйте котёл: так несливаемый остаток 3-4 л вместо 8-10 л."
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
