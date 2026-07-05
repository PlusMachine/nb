"use client";

// =============================================================================
//  features/devices/components/brew-recipe-on-device-picker.tsx
//  W5 (редизайн L2 §7): «Сварить рецепт…» прямо с пульта простаивающего
//  устройства. Устройство уже известно (deviceId от владельца — пульт) —
//  экран выбора устройства не нужен, это отличает пикер от общего
//  BrewPickerDialog (components/recipes/brew-picker-dialog.tsx), который
//  запускается со стороны рецепта и сам решает, куда варить.
//
//  Вкладки: «Мои рецепты» (готовый listPushableRecipes, SSR-пропс) и
//  «Найти рецепт» (публичный поиск, debounce ~300мс, ≤10 результатов). Выбор →
//  подтверждение нагрева (тот же ShieldAlert-паттерн) → тот же композитный
//  экшен старта, что и у BrewPickerDialog (startBrewOnDeviceFromRecipeAction) —
//  REMOTE_DISABLED обрабатывается так же честно (баннер, переход по клику).
// =============================================================================
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Search, ShieldAlert } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";

import { startBrewOnDeviceFromRecipeAction } from "@/features/brew-controller/brew-recipe-flow";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { RemoteDisabledNotice } from "@/features/brew-controller/components/remote-disabled-notice";
import type { PushableRecipeDto } from "@/features/devices/onboard-recipes-contracts";
import {
  searchPublicRecipesForDeviceAction,
  type DevicePickableRecipe
} from "@/features/devices/search-public-recipes-for-device-action";

type Tab = "mine" | "search";
type Screen = "pick" | "confirm";
type SelectedRecipe = { id: string; title: string };

const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  deviceName?: string | null;
  pushableRecipes: PushableRecipeDto[];
};

export function BrewRecipeOnDevicePicker({ open, onOpenChange, deviceId, deviceName, pushableRecipes }: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("pick");
  const [tab, setTab] = useState<Tab>("mine");
  const [selected, setSelected] = useState<SelectedRecipe | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DevicePickableRecipe[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState<{ message: string; brewBatchId: string } | null>(null);
  // Ключ идемпотентности «намерения сварить» + гард повторного сабмита (как в
  // BrewPickerDialog): двойной клик/ретрай не плодят партию.
  const idempotencyKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setScreen("pick");
    setTab("mine");
    setSelected(null);
    setQuery("");
    setSearchResults([]);
    setSearchError(null);
    setError(null);
    setRemoteDisabled(null);
    idempotencyKeyRef.current = newIdempotencyKey();
    inFlightRef.current = false;
  }, [open]);

  // Поиск публичных рецептов с debounce — только пока открыта вкладка поиска.
  useEffect(() => {
    if (!open || tab !== "search") return;
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const results = await searchPublicRecipesForDeviceAction(trimmed);
        setSearchResults(results);
        setSearchError(null);
      } catch {
        setSearchError("Не удалось найти рецепты.");
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [open, tab, query]);

  const handleConfirm = async () => {
    if (!selected || inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await startBrewOnDeviceFromRecipeAction({
        recipeId: selected.id,
        deviceId,
        idempotencyKey: (idempotencyKeyRef.current ??= newIdempotencyKey())
      });
      if (result.ok && result.heatingStarted && result.brewBatchId) {
        router.push(`/app/brew-batches/${result.brewBatchId}`);
        return;
      }
      if (result.ok && result.brewBatchId) {
        setRemoteDisabled({ message: result.message, brewBatchId: result.brewBatchId });
        return;
      }
      setError(result.message);
    } catch {
      setError("Не удалось запустить варку на устройстве.");
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "mine", label: "Мои рецепты" },
    { id: "search", label: "Найти рецепт" }
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Сварить рецепт на пивоварне"
      hideTitle
      size="md"
      guard={{ isDirty: () => submitting, onGuardedClose: () => {} }}
    >
      <DialogHeader>
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Сварить рецепт</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            {screen === "pick" ? "Выберите рецепт для этой пивоварни." : "Подтвердите запуск нагрева."}
          </p>
        </div>
        <DialogCloseButton disabled={submitting} />
      </DialogHeader>

      {screen === "pick" ? (
        <div className="p-5">
          <div className="flex gap-1 border-b border-zinc-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                  tab === t.id ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            {tab === "mine" ? (
              pushableRecipes.length === 0 ? (
                <p className="py-4 text-sm text-zinc-500">
                  У вас пока нет рецептов. Создайте рецепт, чтобы сварить его на этой пивоварне.
                </p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {pushableRecipes.map((recipe) => (
                    <li key={recipe.id}>
                      <button
                        type="button"
                        onClick={() => setSelected({ id: recipe.id, title: recipe.title })}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                          selected?.id === recipe.id
                            ? "border-zinc-900 bg-zinc-50"
                            : "border-zinc-200 bg-white hover:bg-zinc-50"
                        }`}
                      >
                        <span className="block font-medium text-zinc-900">
                          {recipe.title}
                          {recipe.versionNumber > 1 ? ` · v${recipe.versionNumber}` : ""}
                        </span>
                        {recipe.abv != null ? (
                          <span className="text-xs text-zinc-500">{recipe.abv.toFixed(1)}% ABV</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Название рецепта…"
                    autoComplete="off"
                    className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900"
                  />
                </div>
                {searching ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ищем…
                  </div>
                ) : searchError ? (
                  <p role="alert" className="text-sm text-rose-600">{searchError}</p>
                ) : query.trim() && searchResults.length === 0 ? (
                  <p className="py-2 text-sm text-zinc-500">Ничего не нашлось.</p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {searchResults.map((recipe) => (
                      <li key={recipe.id}>
                        <button
                          type="button"
                          onClick={() => setSelected({ id: recipe.id, title: recipe.title })}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                            selected?.id === recipe.id
                              ? "border-zinc-900 bg-zinc-50"
                              : "border-zinc-200 bg-white hover:bg-zinc-50"
                          }`}
                        >
                          <span className="block font-medium text-zinc-900">{recipe.title}</span>
                          <span className="text-xs text-zinc-500">
                            {recipe.authorName ?? "Автор неизвестен"}
                            {recipe.abv != null ? ` · ${recipe.abv.toFixed(1)}% ABV` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-5">
          {remoteDisabled ? (
            <RemoteDisabledNotice message={remoteDisabled.message} brewBatchId={remoteDisabled.brewBatchId} />
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">Запуск включит нагрев</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Пивоварня «{deviceName ?? "—"}» начнёт нагрев ТЭНов по рецепту «{selected?.title ?? "—"}».
                    Убедитесь, что в ёмкости есть вода, а оборудование под присмотром.
                  </p>
                </div>
              </div>
              {error ? (
                <div
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {screen === "pick" ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => setScreen("confirm")} disabled={!selected}>
            Далее
          </Button>
        </DialogFooter>
      ) : (
        <DialogFooter>
          {remoteDisabled ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setScreen("pick")} disabled={submitting}>
                Назад
              </Button>
              <Button variant="primary" onClick={() => void handleConfirm()} disabled={submitting}>
                {submitting ? "Запускаем…" : "Подтвердить и запустить нагрев"}
              </Button>
            </>
          )}
        </DialogFooter>
      )}
    </Dialog>
  );
}
