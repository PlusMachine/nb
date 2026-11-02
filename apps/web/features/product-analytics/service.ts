import { db, sql, type SQLWrapper } from "@nb/db";

import {
  analyticsDay, type ActivityInput, type AnalyticsOverview, type AnalyticsRange,
  type AnalyticsSection, type AnalyticsSource, type AnalyticsDevice, type UserAnalytics
} from "./contracts";

type Row = Record<string, unknown>;
const rows = async <T = Row>(query: SQLWrapper): Promise<T[]> => (await db.execute(query)).rows as T[];
const n = (value: unknown) => Number(value ?? 0);
const iso = (value: unknown): string | null => value ? new Date(value as string | Date).toISOString() : null;
const boundary = (day: string) => sql`(${day}::date::timestamp at time zone 'Europe/Moscow')`;

// This fragment is also used for user segments, so staff inclusion and the
// anonymization rule stay consistent across the dashboard and its drill-downs.
const audience = (range: AnalyticsRange) => range.audience === "customers" ? sql`u.role = 'user'` : sql`true`;
const eligible = (range: AnalyticsRange) => sql`eligible as (
  select u.id, u.created_at from users u
  where u.anonymized_at is null and ${audience(range)} and u.created_at < ${boundary(range.end)}
)`;

export const recordProductActivity = async (userId: string, input: ActivityInput, now = new Date()): Promise<void> => {
  // Lock the user against concurrent anonymization: no write can reintroduce
  // their activity after the anonymization transaction has erased it.
  await db.transaction(async tx => {
    const result = await tx.execute(sql`select id from users where id = ${userId}::uuid
      and blocked_at is null and anonymized_at is null for update`);
    if (!result.rows.length) return;
    await tx.execute(sql`insert into product_activity_daily (user_id, day, section, source, device, views, first_seen_at, last_seen_at)
      values (${userId}::uuid, ${analyticsDay(now)}::date, ${input.section}, ${input.source}, ${input.device}, 1, ${now}, ${now})
      on conflict (user_id, day, section, source, device) do update
      set views = product_activity_daily.views + 1, last_seen_at = greatest(product_activity_daily.last_seen_at, excluded.last_seen_at)`);
  });
};

export const getAnalyticsOverview = async (range: AnalyticsRange, now = new Date()): Promise<AnalyticsOverview> => {
  const endDay = range.to;
  const all = await Promise.all([
    rows(sql`select collection_started_at from product_analytics_config where id = 1`),
    rows(sql`with ${eligible(range)}, activity as (
      select a.* from product_activity_daily a join eligible e on e.id = a.user_id
      where a.day >= ${range.previousFrom}::date - 30 and a.day < ${range.end}::date
    ), new_users as (select * from eligible where created_at >= ${boundary(range.from)}),
    first_recipes as (
      select e.id, min(r.created_at) as first_recipe, e.created_at from new_users e
      left join recipes r on r.author_id = e.id and r.created_at >= e.created_at and r.created_at < ${boundary(range.end)}
      group by e.id, e.created_at
    )
    select (select count(*) from eligible) as total_users,
      (select count(*) from new_users) as new_users,
      (select count(*) from eligible where created_at >= ${boundary(range.previousFrom)} and created_at < ${boundary(range.from)}) as previous_new_users,
      (select count(distinct user_id) from activity where day >= ${range.from}::date) as active_users,
      (select count(distinct user_id) from activity where day >= ${range.previousFrom}::date and day < ${range.from}::date) as previous_active_users,
      (select count(distinct user_id) from activity where day = ${endDay}::date) as dau,
      (select count(distinct user_id) from activity where day >= ${endDay}::date - 6) as wau,
      (select count(distinct user_id) from activity where day >= ${endDay}::date - 29) as mau,
      (select coalesce(sum(views), 0) from activity where day >= ${range.from}::date) as views,
      (select count(*) from recipes r join eligible e on r.author_id = e.id where r.created_at >= ${boundary(range.from)} and r.created_at < ${boundary(range.end)}) as recipes,
      (select count(*) from brew_batches b join eligible e on b.user_id = e.id where b.created_at >= ${boundary(range.from)} and b.created_at < ${boundary(range.end)}) as batches,
      (select count(*) from brew_batches b join eligible e on b.user_id = e.id where b.status = 'completed' and b.completed_at >= ${boundary(range.from)} and b.completed_at < ${boundary(range.end)}) as completed_batches,
      (select count(*) from first_recipes where first_recipe is not null) as activation,
      (select percentile_cont(0.5) within group (order by extract(epoch from (first_recipe - created_at))/3600) from first_recipes where first_recipe is not null) as activation_hours`),
    rows(sql`with ${eligible(range)}, dates as (select generate_series(${range.from}::date, ${range.to}::date, interval '1 day')::date as day),
      registrations as (select (created_at at time zone 'Europe/Moscow')::date as day, count(*) as registrations from eligible group by 1),
      visits as (select a.day, count(distinct a.user_id) as active, sum(a.views) as views from product_activity_daily a join eligible e on e.id = a.user_id
        where a.day >= ${range.from}::date and a.day < ${range.end}::date group by a.day)
      select d.day::text as day, coalesce(r.registrations, 0) as registrations, coalesce(v.active, 0) as active, coalesce(v.views, 0) as views
      from dates d left join registrations r using(day) left join visits v using(day) order by d.day`),
    rows(sql`with ${eligible(range)}, milestones as (
      select e.id, r.at as recipe_at, b.at as batch_at, c.at as completed_at from eligible e
      left join lateral (select min(created_at) as at from recipes where author_id = e.id and created_at >= e.created_at and created_at < ${boundary(range.end)}) r on true
      left join lateral (select min(created_at) as at from brew_batches where user_id = e.id and created_at >= r.at and created_at < ${boundary(range.end)}) b on true
      left join lateral (select min(completed_at) as at from brew_batches where user_id = e.id and status = 'completed' and created_at >= b.at and completed_at >= created_at and completed_at < ${boundary(range.end)}) c on true
      where e.created_at >= ${boundary(range.from)}
    ) select count(*) as registered, count(recipe_at) as recipes, count(batch_at) as batches, count(completed_at) as completed from milestones`),
    rows(sql`with ${eligible(range)}, offsets as (select unnest(array[1,7,30]) as days),
      observed as (
        select e.id, (e.created_at at time zone 'Europe/Moscow')::date as registered
        from eligible e cross join product_analytics_config cfg
        where e.created_at >= ${boundary(range.from)} and e.created_at >= cfg.collection_started_at
          and cfg.id = 1
      )
      select o.days, count(e.id) as eligible,
        count(e.id) filter (where exists (select 1 from product_activity_daily a where a.user_id = e.id and a.day = e.registered + o.days)) as returned
      from offsets o left join observed e on e.registered + o.days < least(${analyticsDay(now)}::date, ${range.end}::date)
      group by o.days order by o.days`),
    rows(sql`with ${eligible(range)}, cohorts as (
      select e.id, date_trunc('week', e.created_at at time zone 'Europe/Moscow')::date as week
      from eligible e cross join product_analytics_config cfg
      where e.created_at >= ${boundary(range.from)} and e.created_at >= cfg.collection_started_at and cfg.id = 1
    ) select c.week::text as week, count(*) as users,
      ${sql.join([1,2,3,4].map(w => sql`case when c.week + ${w * 7 + 7}::integer <= least(${analyticsDay(now)}::date, ${range.end}::date)
        then count(*) filter (where exists (select 1 from product_activity_daily a where a.user_id = c.id and a.day >= c.week + ${w * 7}::integer and a.day < c.week + ${w * 7 + 7}::integer))
        else null end as ${sql.identifier(`w${w}`)}`), sql`, `)}
      from cohorts c group by c.week order by c.week desc limit 13`),
    rows(sql`with ${eligible(range)} select 'Рецепты' as label, count(distinct r.author_id) as users from recipes r join eligible e on e.id = r.author_id where r.created_at < ${boundary(range.end)}
      union all select 'Варки', count(distinct b.user_id) from brew_batches b join eligible e on e.id = b.user_id where b.created_at < ${boundary(range.end)}
      union all select 'Склад', count(distinct i.user_id) from user_ingredients i join eligible e on e.id = i.user_id where i.created_at < ${boundary(range.end)}
      union all select 'Оборудование', count(distinct p.user_id) from equipment_profiles p join eligible e on e.id = p.user_id where p.created_at < ${boundary(range.end)}
      union all select 'Устройства', count(distinct d.user_id) from brew_devices d join eligible e on e.id = d.user_id where d.created_at < ${boundary(range.end)}
      union all select 'Сохранённые рецепты', count(distinct s.user_id) from recipe_saves s join eligible e on e.id = s.user_id where s.created_at < ${boundary(range.end)}
      union all select 'Маркет', count(distinct m.user_id) from master_profiles m join eligible e on e.id = m.user_id where m.created_at < ${boundary(range.end)}`),
    rows(sql`with ${eligible(range)} select a.section, count(distinct a.user_id) as users, sum(a.views) as views from product_activity_daily a join eligible e on e.id = a.user_id
      where a.day >= ${range.from}::date and a.day < ${range.end}::date group by a.section order by views desc, a.section`),
    rows(sql`with ${eligible(range)} select a.source, count(distinct a.user_id) as users, sum(a.views) as views from product_activity_daily a join eligible e on e.id = a.user_id
      where a.day >= ${range.from}::date and a.day < ${range.end}::date group by a.source order by views desc, a.source`),
    rows(sql`with ${eligible(range)} select a.device, count(distinct a.user_id) as users, sum(a.views) as views from product_activity_daily a join eligible e on e.id = a.user_id
      where a.day >= ${range.from}::date and a.day < ${range.end}::date group by a.device order by views desc, a.device`),
    rows(sql`select count(*) filter (where f.status in ('new','in_progress')) as open,
      count(*) filter (where f.kind = 'bug' and f.created_at >= ${boundary(range.from)} and f.created_at < ${boundary(range.end)}) as bugs,
      count(*) filter (where f.kind = 'improvement' and f.created_at >= ${boundary(range.from)} and f.created_at < ${boundary(range.end)}) as improvements,
      min(f.created_at) filter (where f.status in ('new','in_progress')) as oldest_open_at
      from feedback f left join users u on u.id = f.submitted_by_user_id
      where f.submitted_by_user_id is null or (u.anonymized_at is null and ${audience(range)})`)
  ]);
  const [config, metricRows, trend, funnelRows, retention, cohorts, adoption, sections, sources, devices, feedbackRows] = all;
  const m = metricRows[0] ?? {}, f = funnelRows[0] ?? {}, fb = feedbackRows[0] ?? {};
  const collectionStartedAt = iso(config[0]?.collection_started_at) ?? now.toISOString();
  const collectionDay = analyticsDay(new Date(collectionStartedAt));
  return {
    range, collectionStartedAt, generatedAt: now.toISOString(),
    metrics: { totalUsers: n(m.total_users), newUsers: n(m.new_users), previousNewUsers: n(m.previous_new_users), activeUsers: n(m.active_users), previousActiveUsers: n(m.previous_active_users), dau: n(m.dau), wau: n(m.wau), mau: n(m.mau), views: n(m.views), recipes: n(m.recipes), batches: n(m.batches), completedBatches: n(m.completed_batches), activation: n(m.activation), medianActivationHours: m.activation_hours == null ? null : n(m.activation_hours) },
    trend: trend.map(r => ({ day: String(r.day), registrations: n(r.registrations), active: String(r.day) >= collectionDay ? n(r.active) : null, views: String(r.day) >= collectionDay ? n(r.views) : null })),
    funnel: [{ label: "Регистрация", users: n(f.registered) }, { label: "Первый рецепт", users: n(f.recipes) }, { label: "Первая партия после рецепта", users: n(f.batches) }, { label: "Завершённая варка", users: n(f.completed) }],
    retention: retention.map(r => ({ day: n(r.days), eligible: n(r.eligible), returned: n(r.returned) })),
    cohorts: cohorts.map(r => ({ week: String(r.week), users: n(r.users), returns: [r.w1, r.w2, r.w3, r.w4].map(v => v == null ? null : n(v)) })),
    adoption: adoption.map(r => ({ label: String(r.label), users: n(r.users) })),
    sections: sections.map(r => ({ section: r.section as AnalyticsSection, users: n(r.users), views: n(r.views) })),
    sources: sources.map(r => ({ source: r.source as AnalyticsSource, users: n(r.users), views: n(r.views) })),
    devices: devices.map(r => ({ device: r.device as AnalyticsDevice, users: n(r.users), views: n(r.views) })),
    feedback: { open: n(fb.open), bugs: n(fb.bugs), improvements: n(fb.improvements), oldestOpenAt: iso(fb.oldest_open_at) }
  };
};

export const getUserAnalytics = async (userId: string): Promise<UserAnalytics> => {
  const [summary, sections] = await Promise.all([
    rows(sql`select max(a.last_seen_at) as last_seen_at, count(distinct a.day) as active_days, coalesce(sum(a.views),0) as views
      from product_activity_daily a join users u on u.id = a.user_id where a.user_id = ${userId}::uuid and u.anonymized_at is null`),
    rows(sql`select a.section, sum(a.views) as views, max(a.last_seen_at) as last_seen_at from product_activity_daily a
      join users u on u.id = a.user_id where a.user_id = ${userId}::uuid and u.anonymized_at is null group by a.section order by last_seen_at desc limit 20`)
  ]);
  const s = summary[0] ?? {};
  return { lastSeenAt: iso(s.last_seen_at), activeDays: n(s.active_days), views: n(s.views), sections: sections.map(r => ({ section: r.section as AnalyticsSection, views: n(r.views), lastSeenAt: iso(r.last_seen_at)! })) };
};
