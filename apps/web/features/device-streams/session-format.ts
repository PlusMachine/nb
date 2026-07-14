// =============================================================================
//  features/device-streams/session-format.ts
//  Чистое форматирование строк сеанса ферментации (§5 F2/F3, M2-C): «с какого
//  времени идёт сеанс» (блок «Брожение» на партии) и «период сеанса» (история
//  сеансов на карточке устройства). Без побочных импортов — колокированный тест
//  без БД, конвенция *-core.ts/reading-summary.ts этой фичи.
// =============================================================================

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

/** «с 14 июл, 08:12» — начало активного/любого сеанса (строка на сеанс, блок «Брожение»). */
export const formatSessionSince = (startedAt: Date): string => `с ${dateTimeFmt.format(startedAt)}`;

/**
 * «14 июл – 20 июл» (завершён) или «14 июл – сейчас» (активен) — период сеанса
 * для истории на карточке устройства. Один день (started и ended — тот же
 * календарный день) не дублирует дату дважды: «14 июл, 08:12–19:40».
 */
export const formatSessionPeriod = (startedAt: Date, endedAt: Date | null): string => {
  if (endedAt === null) {
    return `${dateFmt.format(startedAt)} – сейчас`;
  }
  const sameDay =
    startedAt.getFullYear() === endedAt.getFullYear()
    && startedAt.getMonth() === endedAt.getMonth()
    && startedAt.getDate() === endedAt.getDate();
  if (sameDay) {
    const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return `${dateFmt.format(startedAt)}, ${timeFmt.format(startedAt)}–${timeFmt.format(endedAt)}`;
  }
  return `${dateFmt.format(startedAt)} – ${dateFmt.format(endedAt)}`;
};
