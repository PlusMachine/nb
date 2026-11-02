// Browser-safe contracts. Never send URLs, search terms, contacts or entity IDs.
export const ANALYTICS_TIME_ZONE = "Europe/Moscow";
export const sectionLabels = {
  home: "Главная", dashboard: "Мастерская", recipes: "Мои рецепты", batches: "Варки",
  inventory: "Склад", equipment: "Оборудование", devices: "Устройства", shopping: "Покупки",
  master: "Кабинет мастера", settings: "Настройки", saved: "Закладки", catalog: "Каталог", public_recipes: "Публичные рецепты",
  calculators: "Калькуляторы", bjcp: "Стили BJCP", articles: "Статьи", market: "Маркет",
  brewforge: "BrewForge", demo: "Демо", labels: "Этикетки"
} as const;
export type AnalyticsSection = keyof typeof sectionLabels;
export const sourceLabels = { direct: "Прямой переход", internal: "Внутренний переход", search: "Поиск", social: "Соцсети", referral: "Другие сайты" } as const;
export type AnalyticsSource = keyof typeof sourceLabels;
export const deviceLabels = { desktop: "Компьютер", mobile: "Телефон", tablet: "Планшет" } as const;
export type AnalyticsDevice = keyof typeof deviceLabels;
export type ActivityInput = { section: AnalyticsSection; source: AnalyticsSource; device: AnalyticsDevice };
export const parseActivityInput = (raw: unknown): ActivityInput | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.section !== "string" || !Object.hasOwn(sectionLabels, input.section)
    || typeof input.source !== "string" || !Object.hasOwn(sourceLabels, input.source)
    || typeof input.device !== "string" || !Object.hasOwn(deviceLabels, input.device)) return null;
  return { section: input.section as AnalyticsSection, source: input.source as AnalyticsSource, device: input.device as AnalyticsDevice };
};

export const sectionForPath = (path: string): AnalyticsSection | null => {
  const clean = path.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (/^\/app\/recipes\/[^/]+\/labels(?:\/|$)/.test(clean)) return "labels";
  const routes: Record<string, AnalyticsSection> = {
    "/": "home", "/app": "dashboard", "/app/recipes": "recipes", "/app/brew-batches": "batches",
    "/app/ingredients": "inventory", "/app/equipment": "equipment", "/app/devices": "devices",
    "/app/shopping": "shopping", "/app/master": "master", "/app/settings": "settings", "/settings": "settings", "/profile": "settings", "/app/saved": "saved",
    "/catalog": "catalog", "/recipes": "public_recipes", "/calculators": "calculators", "/bjcp": "bjcp",
    "/articles": "articles", "/market": "market", "/masters": "market", "/brewforge": "brewforge", "/demo": "demo", "/labels": "labels"
  };
  return Object.entries(routes).sort(([a], [b]) => b.length - a.length)
    .find(([route]) => clean === route || (route !== "/" && route !== "/app" && clean.startsWith(`${route}/`)))?.[1] ?? null;
};

export const classifySource = (referrer: string, origin: string): AnalyticsSource => {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "internal";
    const host = url.hostname.toLowerCase();
    if (/(^|\.)(google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})|yandex\.(?:ru|com|by|kz|uz|com\.tr)|bing\.com|duckduckgo\.com|search\.mail\.ru)$/.test(host)) return "search";
    if (/(^|\.)(t\.co|t\.me|telegram\.org|vk\.com|ok\.ru|youtube\.com|instagram\.com|facebook\.com|reddit\.com)$/.test(host)) return "social";
    return "referral";
  } catch { return "direct"; }
};

export const analyticsDay = (date: Date): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: ANALYTICS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
}).format(date);
export const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export type AnalyticsRange = { from: string; to: string; end: string; previousFrom: string; days: number; audience: "customers" | "all" };
export const parseAnalyticsRange = (params: Record<string, string | undefined>, now = new Date()): AnalyticsRange => {
  const today = analyticsDay(now);
  const valid = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= "1970-01-01" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
  const to = valid(params.to) && params.to <= today ? params.to : today;
  const preset = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  let from = valid(params.from) && params.from <= to ? params.from : shiftDay(to, 1 - preset);
  if (from < shiftDay(to, -89)) from = shiftDay(to, -89);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  return { from, to, end: shiftDay(to, 1), previousFrom: shiftDay(from, -days), days, audience: params.audience === "all" ? "all" : "customers" };
};
export const rangeQuery = (range: AnalyticsRange) => new URLSearchParams({ from: range.from, to: range.to, audience: range.audience }).toString();
export const percent = (value: number, total: number): number => total > 0 ? Math.round(value / total * 1000) / 10 : 0;

export type AnalyticsOverview = {
  range: AnalyticsRange; collectionStartedAt: string; generatedAt: string;
  metrics: { totalUsers: number; newUsers: number; previousNewUsers: number; activeUsers: number; previousActiveUsers: number; dau: number; wau: number; mau: number; views: number; recipes: number; batches: number; completedBatches: number; activation: number; medianActivationHours: number | null };
  trend: { day: string; registrations: number; active: number | null; views: number | null }[];
  funnel: { label: string; users: number }[];
  retention: { day: number; eligible: number; returned: number }[];
  cohorts: { week: string; users: number; returns: (number | null)[] }[];
  adoption: { label: string; users: number }[];
  sections: { section: AnalyticsSection; users: number; views: number }[];
  sources: { source: AnalyticsSource; users: number; views: number }[];
  devices: { device: AnalyticsDevice; users: number; views: number }[];
  feedback: { open: number; bugs: number; improvements: number; oldestOpenAt: string | null };
};
export type UserAnalytics = { lastSeenAt: string | null; activeDays: number; views: number; sections: { section: AnalyticsSection; views: number; lastSeenAt: string }[] };

// Quote every cell and neutralize spreadsheet formula injection in user input.
export const csvDocument = (rows: (string | number | null)[][]): string => "\uFEFF" + rows.map(row => row.map(value => {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}).join(";")).join("\r\n");
