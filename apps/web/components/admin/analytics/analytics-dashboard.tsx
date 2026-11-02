import Link from "next/link";
import { type ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminUserSegmentLabels } from "@/features/admin-users/contracts";
import { analyticsDay, deviceLabels, percent, rangeQuery, sectionLabels, sourceLabels, type AnalyticsOverview } from "@/features/product-analytics/contracts";

const number = (value: number) => value.toLocaleString("ru-RU");
const date = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div><h2 className="font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>{children}
  </section>;
}
function Metric({ label, value, hint, previous }: { label: string; value: number | string; hint?: string; previous?: number }) {
  const delta = previous !== undefined && typeof value === "number" && previous > 0 ? Math.round((value - previous) / previous * 100) : null;
  return <div className="rounded-2xl border border-border bg-card p-4 sm:p-5"><p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{typeof value === "number" ? number(value) : value}</p>
    <p className="mt-2 text-xs text-muted-foreground">{previous === undefined ? hint : `${delta !== null ? `${delta > 0 ? "+" : ""}${delta}% · ` : ""}${number(previous)} за предыдущий период`}</p>
  </div>;
}
function Distribution({ items }: { items: { label: string; users: number; views: number }[] }) {
  return items.length ? <div className="space-y-3">{items.map(item => <div key={item.label} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
    <span className="text-sm">{item.label}</span><span className="text-xs text-muted-foreground">{number(item.users)} польз. · {number(item.views)} просм.</span>
  </div>)}</div> : <p className="text-sm text-muted-foreground">Пока нет просмотров за этот период.</p>;
}

export function AnalyticsDashboard({ data }: { data: AnalyticsOverview }) {
  const { range, metrics: m } = data;
  const collectionDay = analyticsDay(new Date(data.collectionStartedAt));
  const hasUsage = range.to >= collectionDay;
  const maxTrend = Math.max(1, ...data.trend.flatMap(d => [d.active ?? 0, d.registrations]));
  const points = (key: "active" | "registrations") => data.trend.flatMap((day, i) => day[key] === null ? [] : [`${24 + i / Math.max(1, data.trend.length - 1) * 712},${174 - (day[key] ?? 0) / maxTrend * 148}`]).join(" ");
  return <div className="space-y-6">
    <AdminPageHeader title="Продуктовая аналитика" description="Рост, возвраты и путь пользователя к первой варке." actions={<a className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" href={`/api/admin/analytics/export?${rangeQuery(range)}`}>Скачать отчёт CSV</a>} />

    <form key={rangeQuery(range)} method="get" className="grid grid-cols-2 items-end gap-3 rounded-xl border border-border bg-card p-4 xl:flex xl:flex-wrap">
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">С<input required type="date" name="from" defaultValue={range.from} max={analyticsDay(new Date(data.generatedAt))} className="h-10 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">По<input required type="date" name="to" defaultValue={range.to} max={analyticsDay(new Date(data.generatedAt))} className="h-10 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
      <div className="col-span-2 grid min-w-0 gap-1 text-xs text-muted-foreground"><label htmlFor="analytics-audience">Аудитория</label><select id="analytics-audience" name="audience" defaultValue={range.audience} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"><option value="customers">Пользователи без команды</option><option value="all">Все, включая команду</option></select></div>
      <button className="h-10 justify-self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Применить</button>
      <div className="flex gap-1">{[7,30,90].map(days => <Link key={days} href={`/admin/analytics?days=${days}&audience=${range.audience}`} className={`whitespace-nowrap rounded-md px-1 py-2 text-xs sm:px-2 sm:text-sm ${range.days === days ? "bg-muted font-medium" : "text-muted-foreground hover:bg-accent"}`}>{days} дн.</Link>)}</div>
    </form>
    <p className="text-xs text-muted-foreground">{date(range.from)} — {date(range.to)} · московское время · до 90 дней в отчёте. Текущий день может быть неполным.</p>
    {range.from <= collectionDay ? <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Просмотры измеряются с {date(collectionDay)}. За более ранние дни активность неизвестна; первый день сбора может быть неполным.</p> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Пользователей всего" value={m.totalUsers} hint="На конец выбранного периода" />
      <Metric label="Новые регистрации" value={m.newUsers} previous={m.previousNewUsers} />
      <Metric label="Активные за период" value={hasUsage ? m.activeUsers : "—"} previous={range.previousFrom >= collectionDay ? m.previousActiveUsers : undefined} hint={hasUsage ? "Измеренные визиты с момента начала сбора" : "Период до начала сбора просмотров"} />
      <Metric label="Создали первый рецепт" value={m.newUsers ? `${percent(m.activation, m.newUsers)}%` : "—"} hint={`${m.activation} из ${m.newUsers} новых пользователей`} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="DAU / WAU / MAU" value={hasUsage ? `${m.dau} / ${m.wau} / ${m.mau}` : "— / — / —"} hint={`Уникальные за 1 / 7 / 30 дней по ${date(range.to)}`} />
      <Metric label="Создано рецептов" value={m.recipes} hint="За выбранный период" />
      <Metric label="Создано / завершено партий" value={`${m.batches} / ${m.completedBatches}`} hint="По дате создания / завершения" />
      <Metric label="Время до первого рецепта" value={m.medianActivationHours === null ? "—" : `${number(Math.round(m.medianActivationHours * 10) / 10)} ч`} hint="Медиана среди активированных новичков" />
    </div>

    <Panel title="Регистрации и активность по дням" description="Активность — хотя бы один просмотр авторизованным пользователем с согласием на аналитику.">
      <div className="flex flex-wrap gap-4 text-xs"><span className="text-primary">● Активные пользователи</span><span className="text-sky-600 dark:text-sky-400">● Регистрации</span></div>
      <svg viewBox="0 0 760 200" role="img" aria-label={`График регистраций и активности с ${range.from} по ${range.to}. Точные данные — в таблице ниже.`} className="w-full">
        {[0,1,2].map(i => <g key={i}><line x1="24" x2="736" y1={26 + i * 74} y2={26 + i * 74} className="stroke-border" /><text x="24" y={20 + i * 74} className="fill-muted-foreground" fontSize="10">{Math.round(maxTrend * (1 - i / 2))}</text></g>)}
        <polyline points={points("active")} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary" />
        <polyline points={points("registrations")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 3" className="text-sky-600 dark:text-sky-400" />
        {data.trend.map((day, i) => day.active === null ? null : <circle key={day.day} cx={24 + i / Math.max(1, data.trend.length - 1) * 712} cy={174 - day.active / maxTrend * 148} r="3" className="fill-primary"><title>{`${date(day.day)}: активных ${day.active}, регистраций ${day.registrations}, просмотров ${day.views}`}</title></circle>)}
        <text x="24" y="196" fontSize="10" className="fill-muted-foreground">{date(range.from)}</text><text x="736" y="196" textAnchor="end" fontSize="10" className="fill-muted-foreground">{date(range.to)}</text>
      </svg>
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Данные по дням</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Дата", "Регистрации", "Активные", "Просмотры"].map(label => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead><tbody>{data.trend.map(day => <tr key={day.day} className="border-t border-border"><td className="p-2 whitespace-nowrap">{date(day.day)}</td><td className="p-2">{day.registrations}</td><td className="p-2">{day.active ?? "—"}</td><td className="p-2">{day.views ?? "—"}</td></tr>)}</tbody></table></div></details>
    </Panel>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Путь к первой варке" description="Пользователи, зарегистрированные за выбранный период. Шаги идут по времени; учитываем результат до конца периода.">
        {data.funnel.map((step, i) => <div key={step.label} className="space-y-1.5"><div className="flex justify-between gap-3 text-sm"><span>{i + 1}. {step.label}</span><span className="shrink-0 tabular-nums">{number(step.users)} · {percent(step.users, m.newUsers)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent(step.users, m.newUsers)}%` }} /></div>{i > 0 && data.funnel[i-1].users > 0 ? <p className="text-xs text-muted-foreground">Прошли {percent(step.users, data.funnel[i-1].users)}% предыдущего шага · потеряно {number(data.funnel[i-1].users - step.users)}</p> : null}</div>)}
        <p className="text-xs text-muted-foreground">На основе сохранившихся рецептов и партий. Удалённые данные не восстанавливаются; варка по чужому рецепту без своего рецепта в эту последовательность не входит.</p>
      </Panel>
      <Panel title="Возврат D1 / D7 / D30" description="Доля новичков, вернувшихся ровно на 1-й, 7-й или 30-й календарный день после регистрации.">
        {data.retention.map(row => <div key={row.day} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3"><div><span className="text-sm font-medium">D{row.day}</span><p className="text-xs text-muted-foreground">{row.eligible ? `${row.returned} вернулись из ${row.eligible}` : "Нет пользователей с полным окном наблюдения"}</p></div><span className="text-xl font-semibold tabular-nums">{row.eligible ? `${percent(row.returned, row.eligible)}%` : "—"}</span></div>)}
        <p className="text-xs text-muted-foreground">В знаменателе — все новые аккаунты с созревшим окном после начала сбора, в числителе — измеренные возвраты с согласием. Это нижняя оценка: отказ от аналитики скрывает возвраты. Незавершённый день исключён.</p>
      </Panel>
    </div>

    <Panel title="Недельные когорты" description="Регистрации по неделям, начиная с понедельника. W1–W4 — возврат в соответствующую неделю после недели регистрации.">
      {data.cohorts.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Неделя", "Пользователи", "W1", "W2", "W3", "W4"].map(label => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead><tbody>{data.cohorts.map(cohort => <tr key={cohort.week} className="border-t border-border"><td className="whitespace-nowrap p-2">с {date(cohort.week)}</td><td className="p-2">{cohort.users}</td>{cohort.returns.map((value, i) => <td key={i} className="p-2"><span title={value === null ? "Неделя наблюдения ещё не закончилась" : `${value} из ${cohort.users}`} className="block rounded-md p-2 text-center tabular-nums" style={value === null ? undefined : { backgroundColor: `rgb(16 185 129 / ${0.06 + percent(value, cohort.users) / 250})` }}>{value === null ? "—" : `${percent(value, cohort.users)}%`}</span></td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">Когорты появятся после новых регистраций с момента включения сбора.</p>}
      <p className="text-xs text-muted-foreground">«—» означает незавершённое окно. Возвраты учитывают согласие на аналитику; первая когорта может быть неполной.</p>
    </Panel>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Освоение функций" description="Доля аккаунтов с сохранёнными данными функции на конец периода. Удалённые записи и прежние состояния не восстанавливаются.">
        {data.adoption.map(item => <div key={item.label} className="space-y-1"><div className="flex justify-between gap-3 text-sm"><span>{item.label}</span><span className="text-muted-foreground">{number(item.users)} · {percent(item.users, m.totalUsers)}%</span></div><div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${percent(item.users, m.totalUsers)}%` }} /></div></div>)}
      </Panel>
      <Panel title="Популярные разделы" description="Уникальные пользователи и просмотры за период. Повторные переходы увеличивают просмотры."><Distribution items={data.sections.map(item => ({ ...item, label: sectionLabels[item.section] ?? item.section }))} /></Panel>
      <Panel title="Источники переходов" description="Источник текущего посещения по referrer браузера. Это не атрибуция регистрации; суммы уникальных могут пересекаться."><Distribution items={data.sources.map(item => ({ ...item, label: sourceLabels[item.source] ?? item.source }))} /></Panel>
      <Panel title="Устройства" description="Тип экрана при просмотре. Один пользователь может пользоваться несколькими устройствами."><Distribution items={data.devices.map(item => ({ ...item, label: deviceLabels[item.device] ?? item.device }))} /></Panel>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Сегменты для работы с продуктом" description="Откройте список, изучите профиль и выгрузите выбранный сегмент. Сегменты отражают текущее состояние.">
        <div className="grid gap-2 sm:grid-cols-2">{Object.entries(adminUserSegmentLabels).map(([key, label]) => <Link key={key} href={`/admin/users?segment=${key}${range.audience === "customers" ? "&role=user" : ""}`} className="rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent">{label} →</Link>)}</div>
      </Panel>
      <Panel title="Обратная связь" description="Открытая очередь сейчас; ошибки и идеи — за выбранный период. Анонимные обращения включены.">
        <div className="grid grid-cols-3 gap-3">{[{ label: "Открыто", value: data.feedback.open }, { label: "Ошибки", value: data.feedback.bugs }, { label: "Идеи", value: data.feedback.improvements }].map(item => <div key={item.label}><p className="text-2xl font-semibold">{item.value}</p><p className="text-xs text-muted-foreground">{item.label}</p></div>)}</div>
        {data.feedback.oldestOpenAt ? <p className="text-sm text-muted-foreground">Старейшее открытое обращение: {new Date(data.feedback.oldestOpenAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</p> : null}
        <Link href="/admin/feedback" className="inline-flex text-sm text-primary hover:underline">Разобрать обращения →</Link>
      </Panel>
    </div>
    <div className="rounded-xl border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
      <p>Сбор просмотров включён {new Date(data.collectionStartedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}. Исторические просмотры не восстанавливаются. Считаем авторизованных пользователей с согласием на аналитику; админка, вход, API и киоск не отслеживаются.</p>
      <p className="mt-1">Регистрации и сохранённые данные берутся из базы независимо от аналитических cookie. Обезличенные аккаунты исключены. По умолчанию команда исключена по текущей роли аккаунта. Охват без согласия не измеряется; низкие DAU и возвраты не всегда означают отток.</p>
    </div>
  </div>;
}
