import { analyticsDay, csvDocument, deviceLabels, percent, sectionLabels, sourceLabels, type AnalyticsOverview } from "./contracts";

export const exportAnalyticsCsv = (data: AnalyticsOverview) => {
  const m = data.metrics;
  const labels: Record<keyof typeof m, string> = {
    totalUsers: "Всего пользователей", newUsers: "Регистрации", previousNewUsers: "Регистрации в предыдущем периоде",
    activeUsers: "Активные пользователи", previousActiveUsers: "Активные в предыдущем периоде", dau: "DAU", wau: "WAU", mau: "MAU",
    views: "Просмотры", recipes: "Создано рецептов", batches: "Создано партий", completedBatches: "Завершено партий",
    activation: "Новички с первым рецептом", medianActivationHours: "Медиана времени до рецепта, ч"
  };
  const collectionDay = analyticsDay(new Date(data.collectionStartedAt));
  const unobserved = (key: string) => ["activeUsers", "views", "dau", "wau", "mau"].includes(key) && data.range.to < collectionDay
    || key === "previousActiveUsers" && data.range.from <= collectionDay;
  return csvDocument([
    ["Раздел", "Показатель / дата", "Значение", "База / активные", "Просмотры / доля, %"],
    ["Параметры", "Период", data.range.from, data.range.to],
    ["Параметры", "Аудитория", data.range.audience === "customers" ? "Без команды" : "Все"],
    ["Параметры", "Часовой пояс", "Europe/Moscow"],
    ["Параметры", "Начало сбора просмотров", data.collectionStartedAt],
    ["Параметры", "Сформировано", data.generatedAt],
    ...Object.entries(m).map(([key, value]) => ["Метрики", labels[key as keyof typeof m], unobserved(key) ? null : value]),
    ...data.trend.map(d => ["По дням", d.day, d.registrations, d.active, d.views]),
    ...data.funnel.map(s => ["Воронка", s.label, s.users, m.newUsers, percent(s.users, m.newUsers)]),
    ...data.retention.map(r => ["Возврат", `D${r.day}`, r.eligible ? r.returned : null, r.eligible, r.eligible ? percent(r.returned, r.eligible) : null]),
    ...data.cohorts.flatMap(c => c.returns.map((value, i) => ["Когорты", `${c.week} W${i+1}`, value, c.users, value === null ? null : percent(value, c.users)])),
    ...data.adoption.map(a => ["Освоение", a.label, a.users, m.totalUsers, percent(a.users, m.totalUsers)]),
    ...data.sections.map(s => ["Разделы", sectionLabels[s.section], s.users, null, s.views]),
    ...data.sources.map(s => ["Источники", sourceLabels[s.source], s.users, null, s.views]),
    ...data.devices.map(d => ["Устройства", deviceLabels[d.device], d.users, null, d.views]),
    ["Обратная связь", "Открыто сейчас", data.feedback.open], ["Обратная связь", "Ошибки за период", data.feedback.bugs], ["Обратная связь", "Идеи за период", data.feedback.improvements],
    ["Методика", "Просмотры и возвраты", "Только авторизованные с согласием. Возвраты — нижняя оценка; пусто означает незавершённое окно."],
    ["Методика", "Сохранённые данные", "Удалённые записи не восстанавливаются. Сегменты, роли и очередь обращений отражают текущее состояние."]
  ]);
};
