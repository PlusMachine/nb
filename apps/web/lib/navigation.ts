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
  ShoppingCart,
  Sparkles,
  Wrench
} from "lucide-react";

// Единый источник навигации рабочей зоны. Группы разделяются визуально
// (отступ/линия), без текстовых заголовков: порядок и иконки читаются сами.
// publicLinks ниже — отдельный источник для витринных поверхностей (хедер,
// футер), чтобы порядок разделов не расходился между ними.

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
    { href: "/app/brew-batches", label: "Варки", icon: Beer, primary: true },
    { href: "/app/shopping", label: "Список покупок", icon: ShoppingCart }
  ],
  [
    { href: "/app/equipment", label: "Оборудование", icon: Wrench },
    { href: "/app/devices", label: "BrewForge", icon: Cpu }
  ],
  [
    { href: "/catalog", label: "Каталог", icon: Library },
    { href: "/guides", label: "Гайды", icon: BookOpen },
    { href: "/bjcp", label: "Стили пива", icon: Sparkles },
    { href: "/calculators", label: "Калькуляторы", icon: Calculator }
  ]
];

export const appNavItems = appNavGroups.flat();
export const primaryNavItems = appNavItems.filter((item) => item.primary);

// Витринные разделы в порядке приоритетов посетителя: используются
// хедером (переключение зон) и футером публичной зоны.
export const publicLinks: { href: string; label: string }[] = [
  { href: "/recipes", label: "Рецепты" },
  { href: "/bjcp", label: "Стили пива" },
  { href: "/calculators", label: "Калькуляторы" },
  { href: "/guides", label: "Гайды" },
  { href: "/catalog", label: "Каталог" }
];

// Правовые документы (152-ФЗ + cookie). Единый источник для футера и сайдбара
// рабочей зоны, чтобы состав и порядок ссылок не расходились между зонами.
export const legalLinks: { href: string; label: string }[] = [
  { href: "/legal/terms", label: "Пользовательское соглашение" },
  { href: "/legal/privacy", label: "Политика обработки ПДн" },
  { href: "/legal/consent", label: "Согласие на обработку ПДн" },
  { href: "/legal/cookies", label: "Использование cookie" }
];

export const isNavItemActive = (pathname: string, item: AppNavItem): boolean => {
  const matches = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  if (matches(item.href, item.exact)) {
    return true;
  }
  return (item.match ?? []).some((href) => matches(href));
};

export type RecipeTab = { href: string; label: string; exact?: boolean };

// Хаб «Рецепты»: один пункт меню, три поверхности. «Найти» — публичная
// витрина сообщества (доступна без логина).
export const recipeTabs: RecipeTab[] = [
  { href: "/app/recipes", label: "Мои", exact: true },
  { href: "/app/saved", label: "Сохранённые" },
  { href: "/recipes", label: "Найти" }
];
