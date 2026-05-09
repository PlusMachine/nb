"use client";

import React from "react";

import type { RecipeWaterPlanMeta } from "@/features/recipes/contracts";
import type { RecipeWaterPlanResult } from "@/features/recipes/water-plan";

const hasConfiguredWater = (waterPlanMeta: RecipeWaterPlanMeta) => (
  waterPlanMeta.setupEnabled
);

const blockingWarningLabels: Record<string, string> = {
  source_profile_missing_or_zero:
    "Выберите исходную воду или введите профиль вручную.",
  target_profile_missing_or_zero: "Выберите целевой профиль воды.",
};

const findBlockingWarning = (waterPlanResult: RecipeWaterPlanResult) =>
  waterPlanResult.warnings.find(
    (warning) =>
      warning === "source_profile_missing_or_zero" ||
      (warning === "target_profile_missing_or_zero" &&
        waterPlanResult.engine !== "advanced_manual"),
  );

type WaterSummaryAdditionRow = {
  key: string;
  title: string;
  meta: string;
  amount: string;
};

const getAcidMl = (
  addition:
    | RecipeWaterPlanResult["mashAcidAddition"]
    | RecipeWaterPlanResult["spargeAcidAddition"],
) => {
  if (!addition || addition.mashAcidMl <= 0) {
    return null;
  }

  return "spargeAcidMl" in addition
    ? addition.spargeAcidMl
    : addition.mashAcidMl;
};

const buildAdditionRows = (
  salts: RecipeWaterPlanResult["mashSaltAdditions"],
  acid:
    | RecipeWaterPlanResult["mashAcidAddition"]
    | RecipeWaterPlanResult["spargeAcidAddition"],
): WaterSummaryAdditionRow[] => {
  const rows: WaterSummaryAdditionRow[] = salts.map((item, index) => ({
    key: `salt-${item.salt}-${index}`,
    title: item.label,
    meta: item.formula,
    amount: `${item.grams.toFixed(2)} г`,
  }));
  const acidMl = getAcidMl(acid);

  if (acid && acidMl != null && acidMl > 0) {
    rows.push({
      key: "acid",
      title: acid.label,
      meta: "кислота",
      amount: `${acidMl.toFixed(2)} мл`,
    });
  }

  return rows;
};

function WaterSummaryAdditionStage({
  title,
  volumeLabel,
  salts,
  acid,
}: {
  title: string;
  volumeLabel: string;
  salts: RecipeWaterPlanResult["mashSaltAdditions"];
  acid:
    | RecipeWaterPlanResult["mashAcidAddition"]
    | RecipeWaterPlanResult["spargeAcidAddition"];
}) {
  const rows = buildAdditionRows(salts, acid);

  return (
    <section className="min-w-0 border-t border-sky-100 pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase text-sky-700">
          {title}
        </h4>
        <span className="shrink-0 text-xs tabular-nums text-sky-700">
          {volumeLabel}
        </span>
      </div>
      {rows.length ? (
        <ul className="mt-1 divide-y divide-sky-100">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-sky-950">
                  {row.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sky-700">
                  <span>{row.meta}</span>
                </div>
              </div>
              <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-sky-950">
                {row.amount}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 py-2 text-sm text-sky-700">Без добавок</div>
      )}
    </section>
  );
}

const formatProfileLine = (profile: RecipeWaterPlanResult["finalProfile"]) => (
  `Ca ${profile.ca.toFixed(0)} · Mg ${profile.mg.toFixed(0)} · Na ${profile.na.toFixed(0)} · Cl ${profile.cl.toFixed(0)} · SO4 ${profile.so4.toFixed(0)} · HCO3 ${profile.hco3.toFixed(0)} ppm`
);

export function WaterSummaryCard({
  waterPlanMeta,
  waterPlanResult
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
}) {
  const blockingWarning = findBlockingWarning(waterPlanResult);

  if (!hasConfiguredWater(waterPlanMeta) || blockingWarning) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
        {blockingWarning
          ? blockingWarningLabels[blockingWarning]
          : "Вода не настроена"}
      </div>
    );
  }

  const ph = waterPlanResult.predictedMashPhAfterAcid20C;
  const isSplit = waterPlanResult.waterVolumes.source === "manual_split";

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-sky-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {isSplit
            ? `Затор ${waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} л • промывка ${waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л`
            : `Один объем: ${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л`}
        </span>
        {ph != null ? <span>pH ~{ph.toFixed(2)}</span> : null}
      </div>

      <div className="mt-3 text-[11px] font-semibold uppercase text-sky-700">
        Итоговые добавки
      </div>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <WaterSummaryAdditionStage
          title={isSplit ? "В затор" : "Добавить в воду"}
          volumeLabel={
            isSplit
              ? `${waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} л`
              : `${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л`
          }
          salts={
            isSplit
              ? waterPlanResult.mashSaltAdditions
              : waterPlanResult.totalSaltAdditions
          }
          acid={waterPlanResult.mashAcidAddition}
        />
        {isSplit ? (
          <WaterSummaryAdditionStage
            title="В промывку"
            volumeLabel={`${waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л`}
            salts={waterPlanResult.spargeSaltAdditions}
            acid={waterPlanResult.spargeAcidAddition}
          />
        ) : null}
      </div>
      <div className="mt-2 text-xs text-sky-800">
        Итоговый профиль: {formatProfileLine(waterPlanResult.finalProfile)}
      </div>
    </div>
  );
}
