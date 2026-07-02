"use client";

// =============================================================================
//  features/brew-controller/components/onboard-recipes-panel.tsx
//  «Рецепты пивоварни» — что загружено на устройство + загрузка рецепта (Phase 4,
//  редизайн L2 §8). Две функции:
//    1. Просмотр загруженных рецептов (GET /api/devices/:id/recipes) + снапшот
//       нативного DeviceRecipe по клику (GET .../recipes/:slot).
//    2. Загрузка nb-рецепта на пивоварню (POST .../recipes) с привязкой к рецепту.
//
//  БЕЗ «слотов» в UI (§8): номера слотов — деталь прошивки, наружу не торчат.
//  Пользователь грузит рецепт (свободное место занимается автоматически) или
//  заменяет уже загруженный — по НАЗВАНИЮ, не по номеру слота. Основной путь
//  «сварить рецепт» — из витрины/мастерской (§7); эта панель вторична.
//
//  ЧЕСТНОСТЬ (§5): снапшот — просмотр «что на плате», НЕ импорт в каталог nb
//  (DeviceRecipe беднее модели рецепта). По облаку перечень недоступен
//  (CLOUD_UNSUPPORTED) — показываем объяснение; загрузка по облаку работает
//  (прошивка сама выбирает место).
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DeviceRecipe } from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import type {
  OnboardSlotDto,
  PushableRecipeDto
} from "@/features/devices/onboard-recipes-contracts";

type Props = {
  deviceId: string;
  /** Рецепты пользователя для пикера загрузки (SSR, лёгкий DTO). */
  pushableRecipes: PushableRecipeDto[];
};

const ERROR_TEXT: Record<string, string> = {
  NOT_FOUND: "Устройство или рецепт не найдены",
  PROVIDER_UNAVAILABLE: "Операции с рецептами недоступны для этого устройства",
  INVALID_REQUEST: "Проверьте выбранный рецепт",
  INVALID_SLOT: "Некорректное место на пивоварне",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже"
};

const errText = (code: string | undefined | null): string =>
  (code && ERROR_TEXT[code]) || "Не удалось выполнить операцию";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

/** Имя загруженного рецепта на плате (название с платы или привязки nb). */
function loadedName(s: OnboardSlotDto): string {
  return s.onboardName ?? s.boundRecipeName ?? "Рецепт";
}

/** Кэш снапшота: undefined — не грузили, null — пуст, "loading"/error — статус. */
type SnapshotState = DeviceRecipe | null | "loading" | "error";

export function OnboardRecipesPanel({ deviceId, pushableRecipes }: Props) {
  const [slots, setSlots] = useState<OnboardSlotDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<Record<number, SnapshotState>>({});
  const [expanded, setExpanded] = useState<number | null>(null);

  // Форма загрузки. Место (слот) не выбирается пользователем — вычисляется; когда
  // пивоварня заполнена, выбирается заменяемый рецепт по НАЗВАНИЮ (replaceSlot).
  const [recipeId, setRecipeId] = useState<string>(pushableRecipes[0]?.id ?? "");
  const [replaceSlot, setReplaceSlot] = useState<number | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushOk, setPushOk] = useState<string | null>(null);

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
        setUnsupported(body.error ?? "Список рецептов пивоварни недоступен по облаку");
        setSlots(null);
        return;
      }
      if (!res.ok || !body.slots) {
        setLoadError(errText(body.error));
        return;
      }
      setSlots(body.slots);
    } catch {
      setLoadError("Не удалось загрузить рецепты пивоварни — проверьте связь с устройством");
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

  // Что загружено / где свободно / заполнена ли пивоварня. Место (слот) — деталь
  // реализации: занимаем первое свободное; если мест нет — заменяем выбранный.
  // useMemo: стабильные ссылки для зависимостей onLoadClick (иначе — каждый рендер).
  const { loaded, firstEmpty, capacity, isFull } = useMemo(() => {
    const loaded = slots ? slots.filter((s) => s.occupied) : [];
    const firstEmpty = slots ? slots.find((s) => !s.occupied) ?? null : null;
    return {
      loaded,
      firstEmpty,
      capacity: slots?.length ?? null,
      isFull: slots != null && slots.length > 0 && firstEmpty === null
    };
  }, [slots]);

  const doPush = useCallback(
    async (slot: number, replacedName?: string | null) => {
      if (!recipeId) return;
      setPushing(true);
      setPushError(null);
      setPushOk(null);
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipeId, slot })
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
        const name = body.boundRecipeName ?? "Рецепт";
        setPushOk(
          replacedName ? `«${name}» заменил «${replacedName}» на пивоварне.` : `«${name}» загружен на пивоварню.`
        );
        setReplaceSlot(null);
        setSnapshots((s) => {
          const next = { ...s };
          delete next[body.slot as number];
          return next;
        });
        await loadSlots();
      } catch {
        setPushError("Не удалось загрузить рецепт — проверьте, что устройство в сети");
      } finally {
        setPushing(false);
      }
    },
    [base, recipeId, loadSlots]
  );

  const onLoadClick = useCallback(() => {
    if (isFull) {
      if (replaceSlot === null) return;
      const target = loaded.find((s) => s.slot === replaceSlot);
      void doPush(replaceSlot, target ? loadedName(target) : null);
      return;
    }
    // Есть свободное место (или список недоступен по облаку → место 0, прошивка сама выберет).
    void doPush(firstEmpty?.slot ?? 0);
  }, [isFull, replaceSlot, loaded, firstEmpty, doPush]);

  return (
    <div className="space-y-6">
      {/* --- Загрузить рецепт ----------------------------------------------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Загрузить рецепт</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Рецепт ляжет на пивоварню — нагрев это не запускает. Начать варку можно из мастера рецептов
          или на устройстве.
        </p>

        {pushableRecipes.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            У вас пока нет рецептов. Создайте рецепт, чтобы загрузить его на пивоварню.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-zinc-600">
              Рецепт
              <select
                value={recipeId}
                onChange={(e) => {
                  setRecipeId(e.target.value);
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

            {capacity != null ? (
              <p className="text-xs text-zinc-500">
                Загружено {loaded.length} из {capacity}.
              </p>
            ) : null}

            {isFull ? (
              <label className="block text-xs font-medium text-zinc-600">
                Пивоварня заполнена — что заменить
                <select
                  value={replaceSlot ?? ""}
                  onChange={(e) => {
                    setReplaceSlot(e.target.value === "" ? null : Number(e.target.value));
                    setPushOk(null);
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  <option value="">Выберите рецепт для замены…</option>
                  {loaded.map((s) => (
                    <option key={s.slot} value={s.slot}>
                      {loadedName(s)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <Button
              size="md"
              onClick={onLoadClick}
              disabled={pushing || !recipeId || (isFull && replaceSlot === null)}
            >
              {pushing ? "Загрузка…" : isFull ? "Заменить" : "Загрузить"}
            </Button>

            {pushError ? <p className="text-sm text-rose-600">{pushError}</p> : null}
            {pushOk ? <p className="text-sm text-emerald-600">{pushOk}</p> : null}
          </div>
        )}
      </section>

      {/* --- На пивоварне (загруженные рецепты, без номеров слотов) ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">На пивоварне</h3>
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
          <p className="mt-4 text-sm text-zinc-500">Загрузка…</p>
        ) : unsupported ? (
          <p className="mt-4 text-sm text-zinc-500">{unsupported}</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-rose-600">{loadError}</p>
        ) : loaded.length > 0 ? (
          <ul className="mt-4 divide-y divide-zinc-100">
            {loaded.map((s) => (
              <li key={s.slot} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="truncate text-sm font-medium text-zinc-900">{loadedName(s)}</span>
                    <p className="mt-1 text-xs text-zinc-500">
                      {s.boundRecipeId ? (
                        <>Из ваших рецептов · загружен {fmtDateTime(s.pushedAt)}</>
                      ) : s.boundRecipeName ? (
                        <>Исходный рецепт удалён (был: {s.boundRecipeName})</>
                      ) : (
                        <>Без привязки к вашему рецепту</>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleSnapshot(s.slot)}
                    className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {expanded === s.slot ? "Скрыть" : "Показать"}
                  </button>
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
          <p className="mt-4 text-sm text-zinc-500">На пивоварне пока нет загруженных рецептов.</p>
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
    return <p className="text-xs text-rose-600">Не удалось прочитать рецепт.</p>;
  }
  if (state === null) {
    return <p className="text-xs text-zinc-500">Пусто.</p>;
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
          <div className="font-medium text-zinc-600">Вирпул</div>
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
