"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  SKIN_COOKIE,
  THEME_COLOR,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  type SkinPreference,
  type ThemePreference
} from "@/features/theme/theme";

type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  /** Что выбрал пользователь: light | dark | system. */
  preference: ThemePreference;
  /** Фактически применённая тема (system → light/dark по системе). */
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Скин оформления (набор токенов+шрифтов): classic | hop. */
  skin: SkinPreference;
  setSkin: (skin: SkinPreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolvePreference = (preference: ThemePreference): ResolvedTheme => {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
};

const applyResolvedTheme = (resolved: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLOR[resolved]);
  }
};

export function ThemeProvider({
  initialPreference,
  initialSkin,
  children
}: {
  initialPreference: ThemePreference;
  initialSkin: SkinPreference;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolvePreference(initialPreference));
  const [skin, setSkinState] = useState<SkinPreference>(initialSkin);

  // Держим DOM в согласии с выбранным режимом. Инлайн-скрипт уже проставил класс
  // до пейнта — здесь только поддерживаем синхронизацию при смене выбора.
  useEffect(() => {
    const resolved = resolvePreference(preference);
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);
  }, [preference]);

  // Режим «Как в системе» — следим за сменой системной темы на лету.
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const resolved: ResolvedTheme = query.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyResolvedTheme(resolved);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  // Скин применяется на лету: токены и шрифты — CSS-переменные под классом
  // skin-hop, перезагрузка не нужна; cookie фиксирует выбор для SSR.
  const setSkin = useCallback((next: SkinPreference) => {
    setSkinState(next);
    document.documentElement.classList.toggle("skin-hop", next === "hop");
    document.cookie = `${SKIN_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference, skin, setSkin }),
    [preference, resolvedTheme, setPreference, skin, setSkin]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme должен вызываться внутри ThemeProvider");
  }
  return context;
}
