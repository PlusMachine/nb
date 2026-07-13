import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Выбор объёма варки в диалоге «Сварить»: рецепт на 30 л, оборудование на 20 л.
// Молча сварить чужой объём нельзя — иначе разъедутся списание склада и водный
// план варочного дня (см. features/brew-batches/brew-setup.ts).
import {
  BrewVolumeChoice,
  hasBrewVolumeMismatch,
  isBrewVolumeSelectionReady,
  resolveBrewVolumeSelection,
  type BrewVolumeProfile
} from "../components/recipes/brew-volume-choice";

const PROFILE: BrewVolumeProfile = {
  id: "profile-1",
  name: "Моя пивоварня",
  targetBatchVolumeL: 20,
  brewhouseEfficiencyPct: 65
};

describe("hasBrewVolumeMismatch — когда вообще спрашивать", () => {
  it("объёмы разошлись → выбор нужен", () => {
    expect(hasBrewVolumeMismatch(30, PROFILE)).toBe(true);
  });

  it("объёмы совпали → выбора нет (диалог не тяжелеет на ровном месте)", () => {
    expect(hasBrewVolumeMismatch(20, PROFILE)).toBe(false);
  });

  it("расхождение в пределах округления (20 vs 20.05) — не расхождение", () => {
    expect(hasBrewVolumeMismatch(20.05, PROFILE)).toBe(false);
  });

  it("нет профиля оборудования или объёма рецепта → не спрашиваем", () => {
    expect(hasBrewVolumeMismatch(30, null)).toBe(false);
    expect(hasBrewVolumeMismatch(null, PROFILE)).toBe(false);
  });
});

describe("isBrewVolumeSelectionReady — гейт кнопки «Создать варку»", () => {
  it("выбор не требуется → старт разрешён сразу", () => {
    expect(isBrewVolumeSelectionReady({ required: false, choice: null, customValue: "" })).toBe(true);
  });

  it("выбор требуется, но не сделан → старт заблокирован (предвыбора нет намеренно)", () => {
    expect(isBrewVolumeSelectionReady({ required: true, choice: null, customValue: "" })).toBe(false);
  });

  it("«как в рецепте» и «моё оборудование» — готовые ответы", () => {
    expect(isBrewVolumeSelectionReady({ required: true, choice: "recipe", customValue: "" })).toBe(true);
    expect(isBrewVolumeSelectionReady({ required: true, choice: "profile", customValue: "" })).toBe(true);
  });

  it("«другой объём» без числа (или с мусором/нулём) — не готов", () => {
    expect(isBrewVolumeSelectionReady({ required: true, choice: "custom", customValue: "" })).toBe(false);
    expect(isBrewVolumeSelectionReady({ required: true, choice: "custom", customValue: "0" })).toBe(false);
    expect(isBrewVolumeSelectionReady({ required: true, choice: "custom", customValue: "abc" })).toBe(false);
  });

  it("«другой объём» с числом — готов; запятая как разделитель тоже (NumericInput)", () => {
    expect(isBrewVolumeSelectionReady({ required: true, choice: "custom", customValue: "25" })).toBe(true);
    expect(isBrewVolumeSelectionReady({ required: true, choice: "custom", customValue: "25,5" })).toBe(true);
  });
});

describe("resolveBrewVolumeSelection — что уезжает на сервер", () => {
  it("«как в рецепте» → пусто: ни объём, ни профиль не подменяем", () => {
    expect(resolveBrewVolumeSelection({ choice: "recipe", profile: PROFILE, customValue: "" })).toEqual({});
  });

  it("«моё оборудование» → объём профиля + сам профиль (целиком: потери, выпаривание)", () => {
    expect(resolveBrewVolumeSelection({ choice: "profile", profile: PROFILE, customValue: "" })).toEqual({
      targetBatchVolumeL: 20,
      equipmentProfileId: "profile-1"
    });
  });

  it("«другой объём» → ручной объём на МОЁМ оборудовании", () => {
    expect(resolveBrewVolumeSelection({ choice: "custom", profile: PROFILE, customValue: "25,5" })).toEqual({
      targetBatchVolumeL: 25.5,
      equipmentProfileId: "profile-1"
    });
  });

  it("выбора не было → пусто (варим как раньше, в объёме рецепта)", () => {
    expect(resolveBrewVolumeSelection({ choice: null, profile: PROFILE, customValue: "" })).toEqual({});
  });
});

describe("BrewVolumeChoice — рендер", () => {
  it("показывает оба объёма числами и не навязывает предвыбор", () => {
    const html = renderToStaticMarkup(
      <BrewVolumeChoice
        recipeBatchVolumeL={30}
        profile={PROFILE}
        choice={null}
        onChoiceChange={() => {}}
        customValue=""
        onCustomValueChange={() => {}}
      />
    );

    expect(html).toContain("Как в рецепте");
    expect(html).toContain("30 л");
    expect(html).toContain("Моё оборудование");
    expect(html).toContain("20 л");
    expect(html).toContain("Моя пивоварня");
    // Ни одна опция не выбрана заранее.
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("выбранное «моё оборудование» честно говорит, что количества пересчитаны", () => {
    const html = renderToStaticMarkup(
      <BrewVolumeChoice
        recipeBatchVolumeL={30}
        profile={PROFILE}
        choice="profile"
        onChoiceChange={() => {}}
        customValue=""
        onCustomValueChange={() => {}}
      />
    );

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Количества ингредиентов пересчитаны на 20 л");
  });

  it("эффективность разошлась → предупреждает про дожим засыпи (солода спишется больше)", () => {
    const html = renderToStaticMarkup(
      <BrewVolumeChoice
        recipeBatchVolumeL={30}
        recipeEfficiencyPct={75}
        profile={PROFILE}
        choice="profile"
        onChoiceChange={() => {}}
        customValue=""
        onCustomValueChange={() => {}}
      />
    );

    expect(html).toContain("Засыпь");
    expect(html).toContain("65%");
    expect(html).toContain("75%");
  });

  it("эффективность совпала → про засыпь молчим", () => {
    const html = renderToStaticMarkup(
      <BrewVolumeChoice
        recipeBatchVolumeL={30}
        recipeEfficiencyPct={65}
        profile={PROFILE}
        choice="profile"
        onChoiceChange={() => {}}
        customValue=""
        onCustomValueChange={() => {}}
      />
    );

    expect(html).toContain("Количества ингредиентов пересчитаны на 20 л");
    expect(html).not.toContain("Засыпь");
  });
});
