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
    // /app/shopping («Чего не хватает», таб склада) — производная витрина склада, свой пункт меню
    // не заслуживает: вход с самого склада/дашборда/подготовки варки, а в
    // навигации при этом подсвечивается «Склад».
    { href: "/app/ingredients", label: "Склад", icon: Boxes, primary: true, match: ["/app/shopping"] },
    { href: "/app/brew-batches", label: "Партии", icon: Beer, primary: true }
  ],
  [
    { href: "/app/equipment", label: "Оборудование", icon: Wrench },
    { href: "/app/devices", label: "BrewForge", icon: Cpu }
  ],
  [
    { href: "/catalog", label: "Каталог", icon: Library },
    { href: "/articles", label: "Статьи", icon: BookOpen },
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
  { href: "/articles", label: "Статьи" },
  { href: "/catalog", label: "Каталог" },
  { href: "/brewforge", label: "BrewForge" }
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

// Пользователь для app-хрома (сайдбар рабочей зоны). Живёт здесь, а не в
// site-header: используется несколькими оболочками, а сама шапка теперь
// анонимная и пользователя не принимает.
export type AppChromeUser = {
  email: string | null;
  phone?: string | null;
  displayName: string;
  // editor+ — показывает мост в админку (вычисляется на сервере)
  isStaff?: boolean;
};

// Роуты, чей контент-браузер требует доп. ширину на ультрашироких экранах
// (третья колонка карточек на 2xl). Держим список здесь, рядом с навигацией;
// если исключений станет больше 2–3 — переносим «желаемую ширину» в сами страницы.
export const isWideContentRoute = (pathname: string): boolean =>
  pathname === "/recipes";

// Витринные (публичные) поверхности — доступны без логина. Логаут на такой
// странице должен оставить пользователя на месте (сервер перерисует хром на
// анонимный), а не кидать на /. Источник правды — состав группы app/(public).
const publicPathPrefixes = [
  "/recipes",
  "/bjcp",
  "/calculators",
  "/articles",
  "/catalog",
  "/brewforge",
  "/legal",
  "/demo"
];

export const isPublicPath = (pathname: string): boolean =>
  pathname === "/" ||
  publicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

// Пути рабочей зоны — рендерятся компактнее (6xl). Всё остальное (витрина,
// контент, /login, главная) — по витринной ширине (7xl), чтобы публичная
// страница выглядела одинаково залогиненному и анониму, а не сжималась в
// сайдбарной раскладке мастерской.
const appZonePrefixes = ["/app", "/profile", "/settings"];

// Единый источник ширины контейнера контента для ОБЕИХ оболочек (AppShell и
// PublicShell). Один роут → один класс, независимо от логина: витринные страницы
// не должны менять ширину при входе. /recipes-браузер на ультрашироких тянется
// под третью колонку карточек.
export const resolveContentWidthClass = (pathname: string): string => {
  if (isWideContentRoute(pathname)) {
    return "max-w-7xl 2xl:max-w-[1600px]";
  }
  const inAppZone = appZonePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return inAppZone ? "max-w-6xl" : "max-w-7xl";
};
