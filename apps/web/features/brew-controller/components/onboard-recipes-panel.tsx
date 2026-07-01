"use client";

// =============================================================================
//  features/brew-controller/components/onboard-recipes-panel.tsx
//  Вкладка «Рецепты на борту» пульта устройства (Phase 4). Две функции:
//    1. Read-only «что на плате» — список слотов (GET /api/devices/:id/recipes),
//       по клику — снапшот слота (GET .../recipes/:slot) нативного DeviceRecipe.
//    2. Push НА плату — записать nb-рецепт в целевой слот (POST .../recipes) с
//       привязкой слот↔recipeId; занятый слот перезаписываем через двухшаг.
//
//  ЧЕСТНОСТЬ (решение дизайна §5): снапшот — это просмотр «что на плате», НЕ импорт
//  в каталог nb (DeviceRecipe беднее модели рецепта: нет засыпи/дрожжей/воды/
//  эффективности). Кнопки «импортировать чужой слот» здесь намеренно нет.
//
//  По облаку перечень/чтение слотов недоступны (транспорт → 501 CLOUD_UNSUPPORTED) —
//  показываем понятное объяснение вместо пустого списка.
// =============================================================================
import { useCallback, useEffect, useState } from "react";

import type { DeviceRecipe } from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import type {
  OnboardSlotDto,
  PushableRecipeDto
} from "@/features/devices/onboard-recipes-contracts";

type Props = {
  deviceId: string;
  /** Рецепты пользователя для пикера «записать на плату» (SSR, лёгкий DTO). */
  pushableRecipes: PushableRecipeDto[];
};

const ERROR_TEXT: Record<string, string> = {
  NOT_FOUND: "Устройство или рецепт не найдены",
  PROVIDER_UNAVAILABLE: "Операции с рецептами недоступны для этого устройства",
  INVALID_REQUEST: "Проверьте выбранный рецепт и слот",
  INVALID_SLOT: "Некорректный слот",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже"
};

const errText = (code: string | undefined | null): string =>
  (code && ERROR_TEXT[code]) || "Не удалось выполнить операцию";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

/** Кэш снапшота слота: undefined — не грузили, null — пуст, "loading"/error — статус. */
type SnapshotState = DeviceRecipe | null | "loading" | "error";

export function OnboardRecipesPanel({ deviceId, pushableRecipes }: Props) {
  const [slots, setSlots] = useState<OnboardSlotDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<Record<number, SnapshotState>>({});
  const [expanded, setExpanded] = useState<number | null>(null);

  // Форма пуша.
  const [recipeId, setRecipeId] = useState<string>(pushableRecipes[0]?.id ?? "");
  const [targetSlot, setTargetSlot] = useState<number>(0);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushOk, setPushOk] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const base = `/api/devices/${deviceId}/recipes`;

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setUnsupported(null);
    try {
      const res = await fetch(base, { headers: { accept: "application/json" } });
      const body = (await res.json().catch(() => ({}))) as {
        slots?: OnboardSlotDto[];
        error?: string;
        code?: string;
      };
      if (res.status === 501 && body.code === "CLOUD_UNSUPPORTED") {
        setUnsupported(body.error ?? "Недоступно по облаку");
        setSlots(null);
        return;
      }
      if (!res.ok || !body.slots) {
        setLoadError(errText(body.error));
        return;
      }
      setSlots(body.slots);
    } catch {
      setLoadError("Не удалось загрузить рецепты на борту — проверьте связь с устройством");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const toggleSnapshot = useCallback(
    async (slot: number) => {
      if (expanded === slot) {
        setExpanded(null);
        return;
      }
      setExpanded(slot);
      if (snapshots[slot] !== undefined && snapshots[slot] !== "error") return;
      setSnapshots((s) => ({ ...s, [slot]: "loading" }));
      try {
        const res = await fetch(`${base}/${slot}`, { headers: { accept: "application/json" } });
        const body = (await res.json().catch(() => ({}))) as { recipe?: DeviceRecipe | null };
        setSnapshots((s) => ({ ...s, [slot]: res.ok ? body.recipe ?? null : "error" }));
      } catch {
        setSnapshots((s) => ({ ...s, [slot]: "error" }));
      }
    },
    [base, expanded, snapshots]
  );

  const doPush = useCallback(async () => {
    if (!recipeId) return;
    setPushing(true);
    setPushError(null);
    setPushOk(null);
    setConfirmOverwrite(false);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId, slot: targetSlot })
      });
      const body = (await res.json().catch(() => ({}))) as {
        slot?: number;
        boundRecipeName?: string;
        error?: string;
        code?: string;
      };
      if (res.status === 501 && body.code === "CLOUD_UNSUPPORTED") {
        setPushError(body.error ?? "Недоступно по облаку");
        return;
      }
      if (!res.ok || typeof body.slot !== "number") {
        setPushError(errText(body.error));
        return;
      }
      setPushOk(`«${body.boundRecipeName ?? "Рецепт"}» записан в слот ${body.slot}.`);
      // Снапшот слота устарел — сбрасываем кэш и перечитываем список.
      setSnapshots((s) => {
        const next = { ...s };
        delete next[body.slot as number];
        return next;
      });
      await loadSlots();
    } catch {
      setPushError("Не удалось записать рецепт — проверьте, что устройство в сети");
    } finally {
      setPushing(false);
    }
  }, [base, recipeId, targetSlot, loadSlots]);

  const onPushClick = useCallback(() => {
    const slot = slots?.find((s) => s.slot === targetSlot);
    if (slot?.occupied && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    void doPush();
  }, [slots, targetSlot, confirmOverwrite, doPush]);

  // Диапазон слотов для пикера: из ответа устройства (иначе дефолтные 0..7).
  const slotOptions = slots ? slots.map((s) => s.slot) : [0, 1, 2, 3, 4, 5, 6, 7];
  const targetSlotInfo = slots?.find((s) => s.slot === targetSlot);

  return (
    <div className="space-y-6">
      {/* --- Push НА плату --------------------------------------------------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Записать рецепт на плату</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Пуш рецепта из ваших в выбранный слот устройства. Нагрев это не запускает — рецепт просто
          ложится в слот; запустить варку можно из мастера рецептов или на устройстве.
        </p>

        {pushableRecipes.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            У вас пока нет рецептов. Создайте рецепт, чтобы отправить его на плату.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-xs font-medium text-zinc-600">
                Рецепт
                <select
                  value={recipeId}
                  onChange={(e) => {
                    setRecipeId(e.target.value);
                    setConfirmOverwrite(false);
                    setPushOk(null);
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {pushableRecipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {r.versionNumber > 1 ? ` · v${r.versionNumber}` : ""}
                      {r.abv != null ? ` · ${r.abv.toFixed(1)}%` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-zinc-600 sm:w-40">
                Слот
                <select
                  value={targetSlot}
                  onChange={(e) => {
                    setTargetSlot(Number(e.target.value));
                    setConfirmOverwrite(false);
                    setPushOk(null);
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {slotOptions.map((n) => {
                    const info = slots?.find((s) => s.slot === n);
                    return (
                      <option key={n} value={n}>
                        Слот {n}
                        {info?.occupied ? ` · занят${info.onboardName ? `: ${info.onboardName}` : ""}` : " · пуст"}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            {confirmOverwrite ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                <span className="text-xs text-amber-800">
                  Слот {targetSlot}
                  {targetSlotInfo?.onboardName ? ` занят рецептом «${targetSlotInfo.onboardName}»` : " занят"}.
                  Перезаписать?
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => setConfirmOverwrite(false)}
                    disabled={pushing}
                  >
                    Отмена
                  </Button>
                  <Button
                    className="px-3 py-1.5 text-xs"
                    onClick={() => void doPush()}
                    disabled={pushing}
                  >
                    Перезаписать
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="px-4 py-2 text-sm"
                onClick={onPushClick}
                disabled={pushing || !recipeId}
              >
                {pushing ? "Запись…" : `Записать в слот ${targetSlot}`}
              </Button>
            )}

            {pushError ? <p className="text-sm text-rose-600">{pushError}</p> : null}
            {pushOk ? <p className="text-sm text-emerald-600">{pushOk}</p> : null}
          </div>
        )}
      </section>

      {/* --- Что на плате (слоты) ------------------------------------------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Что на плате</h3>
          <button
            type="button"
            onClick={() => void loadSlots()}
            className="text-xs text-zinc-500 hover:text-zinc-800"
            disabled={loading}
          >
            Обновить
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Загрузка слотов…</p>
        ) : unsupported ? (
          <p className="mt-4 text-sm text-zinc-500">{unsupported}</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-rose-600">{loadError}</p>
        ) : slots && slots.length > 0 ? (
          <ul className="mt-4 divide-y divide-zinc-100">
            {slots.map((s) => (
              <li key={s.slot} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-zinc-100 px-1.5 text-xs font-medium text-zinc-700">
                        {s.slot}
                      </span>
                      <span className="truncate text-sm font-medium text-zinc-900">
                        {s.onboardName ?? <span className="text-zinc-400">пусто</span>}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {s.boundRecipeId ? (
                        <>Источник nb: {s.boundRecipeName} · записан {fmtDateTime(s.pushedAt)}</>
                      ) : s.boundRecipeName ? (
                        <>Источник nb удалён (был: {s.boundRecipeName})</>
                      ) : (
                        <>Без привязки к рецепту nb</>
                      )}
                    </p>
                  </div>
                  {s.occupied ? (
                    <button
                      type="button"
                      onClick={() => void toggleSnapshot(s.slot)}
                      className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {expanded === s.slot ? "Скрыть" : "Показать"}
                    </button>
                  ) : null}
                </div>

                {expanded === s.slot ? (
                  <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                    <SnapshotView state={snapshots[s.slot]} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">На устройстве нет слотов.</p>
        )}
      </section>
    </div>
  );
}

// --- Read-only рендер нативного DeviceRecipe («что на плате») ------------------

function SnapshotView({ state }: { state: SnapshotState }) {
  if (state === "loading" || state === undefined) {
    return <p className="text-xs text-zinc-500">Чтение рецепта с платы…</p>;
  }
  if (state === "error") {
    return <p className="text-xs text-rose-600">Не удалось прочитать слот.</p>;
  }
  if (state === null) {
    return <p className="text-xs text-zinc-500">Слот пуст.</p>;
  }

  const recipe = state;
  const unit = recipe.units === "F" ? "°F" : "°C";
  const whirlpoolLabel =
    recipe.whirlpool === "hot" ? "горячий" : recipe.whirlpool === "cool" ? "остывший" : "выкл";

  return (
    <div className="space-y-3 text-xs text-zinc-700">
      <div className="font-medium text-zinc-900">{recipe.name}</div>

      {recipe.mash.steps.length > 0 ? (
        <div>
          <div className="font-medium text-zinc-600">Затирание</div>
          <ul className="mt-1 space-y-0.5">
            {recipe.mash.steps.map((step, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{step.name || `Пауза ${i + 1}`}</span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  {step.tempC}
                  {unit} · {step.timeMin} мин
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="font-medium text-zinc-600">Кипячение</div>
        <div className="mt-1 text-zinc-500">{recipe.boil.boilTimeMin} мин</div>
        {recipe.boil.hops.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {recipe.boil.hops.map((hop, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{hop.name || "Хмель"}</span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  {hop.amountG} г · за {hop.atMinBeforeEnd} мин до конца
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {recipe.hopStand.length > 0 ? (
        <div>
          <div className="font-medium text-zinc-600">Хмелестояние</div>
          <ul className="mt-1 space-y-0.5">
            {recipe.hopStand.map((hs, i) => (
              <li key={i} className="tabular-nums text-zinc-500">
                {hs.tempC}
                {unit} · {hs.timeMin} мин
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-500">
        <span>Вирпул: {whirlpoolLabel}</span>
        <span>
          Охлаждение до: {recipe.cooling.targetC}
          {unit}
        </span>
      </div>
    </div>
  );
}
