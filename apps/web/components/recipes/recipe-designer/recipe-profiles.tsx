"use client";

import { ChevronRight, Thermometer, Timer, X } from "lucide-react";
import React from "react";

import { NumericInput } from "@/components/shared/numeric-input";
import { type RecipeProcessMeta } from "@/features/recipes/contracts";
import { validateNumericInput } from "@/features/forms/numeric-validation";

import { createLocalId } from "./helpers";

export function RecipeProfiles({
  processMeta,
  onChange
}: {
  processMeta: RecipeProcessMeta;
  onChange: (next: RecipeProcessMeta) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50 dark:bg-orange-500/15">
            <Thermometer className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
          </div>
          Затирание
          <span className="ml-1 text-xs font-normal text-muted-foreground">({processMeta.mashProfile.steps.length})</span>
        </div>
        <div className="space-y-2">
          {processMeta.mashProfile.steps.map((step, index) => {
            // Затор требует конкретных числа (схема не допускает null) — но
            // "" при вводе не должно молча превращаться в NaN/0 (#11): пока
            // поле пустое или вне диапазона, храним как NaN (валидный `number`
            // в TS) и подсвечиваем через aria-invalid, а не подставляем 0.
            const temperatureError = validateNumericInput(
              Number.isFinite(step.temperatureC) ? String(step.temperatureC) : "",
              { label: "Температура", required: true, min: 0, max: 100 }
            );
            const durationError = validateNumericInput(
              Number.isFinite(step.durationMinutes) ? String(step.durationMinutes) : "",
              { label: "Длительность", required: true, min: 1, max: 600, integer: true }
            );
            return (
            <div key={step.id} className="rounded-lg border-l-[3px] border-l-orange-300 bg-card px-3 py-2.5 shadow-sm ring-1 ring-border transition-shadow hover:shadow-md dark:border-l-orange-500/30">
              <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex h-8 w-7 items-center justify-center rounded-md bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">{index + 1}</div>
                  <span className="text-sm font-medium text-foreground">Шаг {index + 1}</span>
                </div>
                <div className="ml-auto flex shrink-0 items-end gap-2">
                  <label className="space-y-0.5 text-right">
                    <span className="block text-[10px] text-muted-foreground">°C</span>
                    <NumericInput
                      min={0}
                      max={100}
                      step={0.1}
                      value={Number.isFinite(step.temperatureC) ? String(step.temperatureC) : ""}
                      onChange={(event) => onChange({
                        ...processMeta,
                        mashProfile: {
                          steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, temperatureC: event.target.value ? Number(event.target.value) : NaN } : candidate)
                        }
                      })}
                      aria-invalid={Boolean(temperatureError) || undefined}
                      className={`h-9 w-[72px] rounded-md border bg-muted px-2 text-right text-base tabular-nums text-foreground focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring sm:text-sm ${temperatureError ? "border-destructive-border focus:border-destructive" : "border-border focus:border-ring"}`}
                    />
                  </label>
                  <label className="space-y-0.5 text-right">
                    <span className="block text-[10px] text-muted-foreground">мин</span>
                    <NumericInput
                      integer
                      min={1}
                      max={600}
                      step={1}
                      value={Number.isFinite(step.durationMinutes) ? String(step.durationMinutes) : ""}
                      onChange={(event) => onChange({
                        ...processMeta,
                        mashProfile: {
                          steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, durationMinutes: event.target.value ? Number(event.target.value) : NaN } : candidate)
                        }
                      })}
                      aria-invalid={Boolean(durationError) || undefined}
                      className={`h-9 w-[72px] rounded-md border bg-muted px-2 text-right text-base tabular-nums text-foreground focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring sm:text-sm ${durationError ? "border-destructive-border focus:border-destructive" : "border-border focus:border-ring"}`}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...processMeta,
                    mashProfile: {
                      steps: processMeta.mashProfile.steps.filter((candidate) => candidate.id !== step.id)
                    }
                  })}
                  className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive before:absolute before:-inset-2 before:content-['']"
                  aria-label="Удалить шаг"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({
              ...processMeta,
              mashProfile: {
                steps: [...processMeta.mashProfile.steps, {
                  id: createLocalId(),
                  name: `Шаг ${processMeta.mashProfile.steps.length + 1}`,
                  temperatureC: 72,
                  durationMinutes: 20
                }]
              }
            })}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            + Добавить шаг
          </button>
        </div>
      </section>

      <details className="group rounded-2xl border border-border bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 dark:bg-sky-500/15">
            <Timer className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
          </div>
          Брожение
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
              Осн. температура, °C
              <NumericInput
                min={-10}
                max={50}
                step={0.1}
                value={processMeta.fermentationProfile.primaryTemperatureC != null ? String(processMeta.fermentationProfile.primaryTemperatureC) : ""}
                onChange={(event) => onChange({
                  ...processMeta,
                  fermentationProfile: {
                    ...processMeta.fermentationProfile,
                    primaryTemperatureC: event.target.value ? Number(event.target.value) : null
                  }
                })}
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums text-foreground sm:text-sm"
              />
            </label>
            <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
              Осн. длительность, дн
              <NumericInput
                integer
                min={1}
                max={365}
                step={1}
                value={processMeta.fermentationProfile.primaryDurationDays != null ? String(processMeta.fermentationProfile.primaryDurationDays) : ""}
                onChange={(event) => onChange({
                  ...processMeta,
                  fermentationProfile: {
                    ...processMeta.fermentationProfile,
                    primaryDurationDays: event.target.value ? Number(event.target.value) : null
                  }
                })}
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums text-foreground sm:text-sm"
              />
            </label>
          </div>

          <div className="space-y-2">
            {processMeta.fermentationProfile.extraSteps.map((step, index) => (
              <div key={step.id} className="grid gap-2 rounded-lg border-l-[3px] border-l-sky-300 bg-muted p-3 ring-1 ring-border sm:grid-cols-[auto_100px_100px_auto] dark:border-l-sky-500/30">
                <div className="flex h-9 items-center gap-2">
                  <div className="flex h-9 w-7 items-center justify-center rounded-md bg-sky-100 text-xs font-bold text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">{index + 1}</div>
                  <span className="text-sm font-medium text-foreground">Шаг {index + 1}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground">°C</span>
                  <NumericInput
                    min={-10}
                    max={50}
                    step={0.1}
                    value={step.temperatureC != null ? String(step.temperatureC) : ""}
                    onChange={(event) => onChange({
                      ...processMeta,
                      fermentationProfile: {
                        ...processMeta.fermentationProfile,
                        extraSteps: processMeta.fermentationProfile.extraSteps.map((candidate) => candidate.id === step.id ? { ...candidate, temperatureC: event.target.value ? Number(event.target.value) : null } : candidate)
                      }
                    })}
                    className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums sm:text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground">дни</span>
                  <NumericInput
                    integer
                    min={1}
                    max={365}
                    step={1}
                    value={step.durationDays != null ? String(step.durationDays) : ""}
                    onChange={(event) => onChange({
                      ...processMeta,
                      fermentationProfile: {
                        ...processMeta.fermentationProfile,
                        extraSteps: processMeta.fermentationProfile.extraSteps.map((candidate) => candidate.id === step.id ? { ...candidate, durationDays: event.target.value ? Number(event.target.value) : null } : candidate)
                      }
                    })}
                    className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums sm:text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...processMeta,
                    fermentationProfile: {
                      ...processMeta.fermentationProfile,
                      extraSteps: processMeta.fermentationProfile.extraSteps.filter((candidate) => candidate.id !== step.id)
                    }
                  })}
                  className="relative self-end rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive before:absolute before:-inset-2 before:content-['']"
                  aria-label="Удалить шаг"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({
                ...processMeta,
                fermentationProfile: {
                  ...processMeta.fermentationProfile,
                  extraSteps: [...processMeta.fermentationProfile.extraSteps, {
                    id: createLocalId(),
                    name: `Шаг ${processMeta.fermentationProfile.extraSteps.length + 1}`,
                    temperatureC: null,
                    durationDays: null
                  }]
                }
              })}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              + Добавить шаг
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["coldCrash", "conditioning"] as const).map((key) => (
              <div key={key} className="rounded-lg bg-muted p-3 ring-1 ring-border">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={processMeta.fermentationProfile[key].enabled}
                    onChange={(event) => onChange({
                      ...processMeta,
                      fermentationProfile: {
                        ...processMeta.fermentationProfile,
                        [key]: {
                          ...processMeta.fermentationProfile[key],
                          enabled: event.target.checked
                        }
                      }
                    })}
                    className="rounded"
                  />
                  {key === "coldCrash" ? "Колд-краш" : "Выдержка"}
                </label>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">°C</span>
                    <NumericInput
                      min={-10}
                      max={50}
                      step={0.1}
                      value={processMeta.fermentationProfile[key].temperatureC != null ? String(processMeta.fermentationProfile[key].temperatureC) : ""}
                      onChange={(event) => onChange({
                        ...processMeta,
                        fermentationProfile: {
                          ...processMeta.fermentationProfile,
                          [key]: {
                            ...processMeta.fermentationProfile[key],
                            temperatureC: event.target.value ? Number(event.target.value) : null
                          }
                        }
                      })}
                      className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums sm:text-sm"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">дни</span>
                    <NumericInput
                      integer
                      min={1}
                      max={365}
                      step={1}
                      value={processMeta.fermentationProfile[key].durationDays != null ? String(processMeta.fermentationProfile[key].durationDays) : ""}
                      onChange={(event) => onChange({
                        ...processMeta,
                        fermentationProfile: {
                          ...processMeta.fermentationProfile,
                          [key]: {
                            ...processMeta.fermentationProfile[key],
                            durationDays: event.target.value ? Number(event.target.value) : null
                          }
                        }
                      })}
                      className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
