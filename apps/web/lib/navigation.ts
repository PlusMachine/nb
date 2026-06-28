import type { LucideIcon } from "lucide-react";
import {
  Beer,
  BookOpen,
  Boxes,
  Calculator,
  Cpu,
  FlaskConical,
  LayoutGrid,
  Library,
  Sparkles,
  Wrench
} from "lucide-react";

// Единый источник навигации рабочей зоны. Группы разделяются визуально
// (отступ/линия), без текстовых заголовков: порядок и иконки читаются сами.
// Из этого же конфига позже собираются футер и быстрые ссылки, чтобы
// группировки не расходились между поверхностями.

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  // показывать в нижней панели на мобиле
  primary?: boolean;
  // дополнительные пути, при которых пункт считается активным
  match?: string[];
};

export const appNavGroups: AppNavItem[][] = [
  [
    { href: "/app", label: "Обзор", icon: LayoutGrid, exact: true, primary: true },
    { href: "/app/recipes", label: "Рецепты", icon: FlaskConical, primary: true, match: ["/app/saved", "/recipes"] },
    { href: "/app/ingredients", label: "Склад", icon: Boxes, primary: true },
    { href: "/app/brew-batches", label: "Варки", icon: Beer, primary: true }
  ],
  [
    { href: "/app/equipment", label: "Оборудование", icon: Wrench },
    { href: "/app/devices", label: "Устройства", icon: Cpu }
  ],
  [
    { href: "/catalog", label: "Каталог", icon: Library },
    { href: "/guides", label: "Гайды", icon: BookOpen },
    { href: "/bjcp", label: "Стили", icon: Sparkles },
    { href: "/calculators", label: "Калькуляторы", icon: Calculator }
  ]
];

export const appNavItems = appNavGroups.flat();
export const primaryNavItems = appNavItems.filter((item) => item.primary);

export const isNavItemActive = (pathname: string, item: AppNavItem): boolean => {
  const matches = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  if (matches(item.href, item.exact)) {
    return true;
  }
  return (item.match ?? []).some((href) => matches(href));
};

// Справочники живут в публичной зоне (доступны без логина), но для
// залогиненного открываются внутри сайдбара рабочей зоны — чтобы он не
// «вылетал» из мастерской. Один контент, два хрома.
export const referencePathPrefixes = ["/catalog", "/guides", "/bjcp", "/calculators", "/recipes"];

export const isReferencePath = (pathname: string): boolean =>
  referencePathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export type RecipeTab = { href: string; label: string; exact?: boolean };

// Хаб «Рецепты»: один пункт меню, три поверхности. «Найти» — публичная
// витрина сообщества (доступна без логина).
export const recipeTabs: RecipeTab[] = [
  { href: "/app/recipes", label: "Мои", exact: true },
  { href: "/app/saved", label: "Сохранённые" },
  { href: "/recipes", label: "Найти" }
];
