import { calculateAbv } from "@nb/brewing-core";
import { and, asc, brewDevices, db, eq, fermentReadings, fermentSessions, inArray } from "@nb/db";

import { getBrewBatchById, listBrewMeasurements } from "@/features/brew-batches/service";
import { summarizeBrewMeasurements } from "@/features/brew-batches/measurements";

import { STREAM_LIKE_PROVIDER_IDS, type StreamHardwareKind } from "./contracts";
import { extractIntervalSeconds } from "./stream-device-core";
import { smoothGravityMedian5, visibleAttenuation, type FermentPointCore } from "./series-core";
import { computeFermentVerdict, type FermentVerdict } from "./verdict-core";

// =============================================================================
//  features/device-streams — series.ts
//  Серверное чтение серии брожения партии для графика (§5 F3, §9 M2-B): сеансы
//  устройства (join brew_devices) + точки (офсет применён, excluded по
//  умолчанию отфильтрован) + ручные замеры (читаем features/brew-batches, НЕ
//  владеем ими) + сводка (текущая плотность/температура/степень сбраживания/
//  оценка ABV/цель по рецепту). Владение — ЧЕРЕЗ userId ПАРТИИ (getBrewBatchById):
//  чужая партия/несуществующая → пустой результат, без исключений (страница
//  партии сама решает 404 на уровне выше).
//
//  Никакой записи здесь нет (это ingest.ts/service.ts, чужие модули) — только
//  чтение для графика и его сводки. Пороги/сглаживание/сегментация/даунсемпл —
//  чистое ядро series-core.ts, здесь только сборка данных из БД.
//
//  M4-B точечный фикс: readDeviceFermentSeries фильтровала строго providerId=
//  'stream' — RAPT-устройство не проходило owned-проверку, карточка устройства
//  показывала пустой график. Фильтр — вхождение в STREAM_LIKE_PROVIDER_IDS.
// =============================================================================

/** Один сеанс с точками — единица данных графика на кривую устройства. */
export type FermentSessionSeries = {
  session: {
    id: string;
    deviceName: string;
    hardwareKind: StreamHardwareKind | null;
    startedAt: Date;
    endedAt: Date | null;
    calibrationOffsetSg: number;
  };
  /** Точки сеанса: ts возрастает, gravitySg уже со сдвигом calibration_offset_sg. */
  points: FermentPointCore[];
  /** Интервал устройства (сек) из payload последней точки — для сегментации разрывов (§П4). */
  intervalSeconds: number | null;
};

/** Ручной замер партии (features/brew-batches) — точка поверх кривой устройства (П2). */
export type ManualMeasurementPoint = {
  ts: number;
  gravitySg: number;
  isFinal: boolean;
};

/** Сводка над графиком (§5 F3): текущее состояние + оценки, без вердикта (F5 — M3). */
export type BatchFermentSummary = {
  /** Последняя не-excluded точка устройства по всем сеансам ИЛИ последний ручной замер — что свежее. */
  currentGravitySg: number | null;
  /** Последняя известная температура устройства (ручные замеры её не несут). */
  tempC: number | null;
  /** Самый ранний ручной замер (семантика summarizeBrewMeasurements). */
  og: number | null;
  /** Ручной замер, отмеченный isFinal — подтверждённый FG (не «последний»). */
  fg: number | null;
  /** (og-currentGravitySg)/(og-1)×100 — грубее вердикта, но живёт всегда, пока есть og+текущая точка. */
  visibleAttenuationPct: number | null;
  /** ABV от ручного OG к ТЕКУЩЕЙ плотности (не к подтверждённому FG) — «на сейчас», не итог. */
  abvEstimate: number | null;
  /** Расчётный FG рецепта из recipeSnapshot партии, если есть — для сравнения на графике/вердикте (M3). */
  targetFg: number | null;
  /**
   * Вердикт состояния брожения (§5 F5) — по сглаженной кривой активного/последнего сеанса
   * устройства без excluded, либо (нет ни одного сеанса) по ручным замерам (П1/F7 —
   * паритет «без устройства»). Партия completed либо есть ручной замер isFinal (Ф3б/Ф3в)
   * перекрывают эвристику по кривой — batch_completed/fg_confirmed. null — только для
   * пустой сводки (чужая/несуществующая партия, см. emptySummary); для существующей
   * партии всегда реальный вердикт (в т.ч. "insufficient_data", когда точек мало, — UI
   * по конвенции его не показывает).
   */
  verdict: FermentVerdict | null;
  /**
   * M3-C: id сеанса, на данных которого посчитан verdict (pickVerdictSession) —
   * тот же сеанс, что логично использовать для previewGravityFromCurve/
   * confirmGravityFromCurve (F4.4 «Записать OG/FG с ареометра?»), чтобы
   * предложение согласовывалось с тем, что видно в вердикте. null — сеансов
   * устройства нет вовсе (вердикт по ручным замерам либо insufficient_data).
   */
  verdictSessionId: string | null;
};

export type BatchFermentSeriesResult = {
  sessions: FermentSessionSeries[];
  manualMeasurements: ManualMeasurementPoint[];
  summary: BatchFermentSummary;
};

export type ReadBatchFermentSeriesOptions = {
  /** true — включить excluded-точки (с флагом) вместо фильтрации; экран коррекции M3. */
  includeExcluded?: boolean;
  /** Окно данных в часах, отсчитанное от последней точки КАЖДОГО сеанса (не от now — сеанс мог
   *  давно замолчать); null/не задано — вся история сеанса. */
  windowHours?: number | null;
};

const emptySummary: BatchFermentSummary = {
  currentGravitySg: null,
  tempC: null,
  og: null,
  fg: null,
  visibleAttenuationPct: null,
  abvEstimate: null,
  verdict: null,
  targetFg: null,
  verdictSessionId: null
};

type ReadingRow = {
  sessionId: string | null;
  ts: Date;
  gravitySg: number | null;
  tempC: number | null;
  pressureKpa: number | null;
  excluded: boolean;
  payload: Record<string, unknown>;
};

/** Слим-проекция строки сеанса (join brewDevices) — общая для чтения по партии и по устройству. */
type SessionRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  calibrationOffsetSg: number;
  deviceName: string;
  hardwareKind: StreamHardwareKind | null;
};

/** Собрать точки одного сеанса: окно по времени (якорь — последняя точка сеанса) + офсет калибровки. */
const buildSessionPoints = (
  rows: ReadingRow[],
  calibrationOffsetSg: number,
  windowHours: number | null
): { points: FermentPointCore[]; intervalSeconds: number | null } => {
  const lastRow = rows[rows.length - 1] ?? null;
  const intervalSeconds = extractIntervalSeconds(lastRow?.payload ?? null);

  const anchorMs = lastRow ? lastRow.ts.getTime() : Date.now();
  const cutoffMs = windowHours !== null && windowHours !== undefined ? anchorMs - windowHours * 3_600_000 : null;

  const points: FermentPointCore[] = rows
    .filter((row) => cutoffMs === null || row.ts.getTime() >= cutoffMs)
    .map((row) => ({
      ts: row.ts.getTime(),
      gravitySg: row.gravitySg !== null ? row.gravitySg + calibrationOffsetSg : null,
      tempC: row.tempC,
      pressureKpa: row.pressureKpa,
      excluded: row.excluded
    }));

  return { points, intervalSeconds };
};

/**
 * Собрать точки для набора строк сеансов (join brewDevices) одним запросом
 * fermentReadings по sessionIds — общая часть readBatchFermentSeries/
 * readDeviceFermentSeries (различаются только тем, ПО ЧЕМУ отобраны sessionRows:
 * по brewBatchId или по deviceId).
 */
const buildSessionsSeries = async (
  sessionRows: SessionRow[],
  includeExcluded: boolean,
  windowHours: number | null
): Promise<FermentSessionSeries[]> => {
  const sessionIds = sessionRows.map((row) => row.id);
  const readingRows: ReadingRow[] =
    sessionIds.length > 0
      ? await db
          .select({
            sessionId: fermentReadings.sessionId,
            ts: fermentReadings.ts,
            gravitySg: fermentReadings.gravitySg,
            tempC: fermentReadings.tempC,
            pressureKpa: fermentReadings.pressureKpa,
            excluded: fermentReadings.excluded,
            payload: fermentReadings.payload
          })
          .from(fermentReadings)
          .where(
            includeExcluded
              ? inArray(fermentReadings.sessionId, sessionIds)
              : and(inArray(fermentReadings.sessionId, sessionIds), eq(fermentReadings.excluded, false))
          )
          .orderBy(asc(fermentReadings.ts))
      : [];

  const readingsBySession = new Map<string, ReadingRow[]>();
  for (const row of readingRows) {
    // sessionId денормализован и nullable в схеме (ретро-непривязанные точки), но WHERE
    // выше уже отфильтровал по конкретным sessionIds — null сюда попасть не должен;
    // защищаемся молча (пропускаем), а не бросаем — не ломать график из-за грязных данных.
    if (!row.sessionId) continue;
    const list = readingsBySession.get(row.sessionId) ?? [];
    list.push(row);
    readingsBySession.set(row.sessionId, list);
  }

  return sessionRows.map((row) => {
    const { points, intervalSeconds } = buildSessionPoints(
      readingsBySession.get(row.id) ?? [],
      row.calibrationOffsetSg,
      windowHours
    );
    return {
      session: {
        id: row.id,
        deviceName: row.deviceName,
        hardwareKind: row.hardwareKind,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        calibrationOffsetSg: row.calibrationOffsetSg
      },
      points,
      intervalSeconds
    };
  });
};

/**
 * Сеанс для вердикта (§5 F5: «активного/последнего сеанса»): активный (endedAt=null),
 * при нескольких параллельных активных — с самым поздним стартом; нет активных — самый
 * поздний по старту завершённый (sessions уже отсортированы по startedAt asc, но берём
 * max явно — устойчиво к будущим изменениям сортировки).
 */
const pickVerdictSession = (sessions: FermentSessionSeries[]): FermentSessionSeries | null => {
  if (sessions.length === 0) return null;
  const active = sessions.filter((s) => s.session.endedAt === null);
  const pool = active.length > 0 ? active : sessions;
  return pool.reduce((latest, current) => (current.session.startedAt > latest.session.startedAt ? current : latest));
};

/**
 * Вердикт состояния брожения (§5 F5) — на данных, что уже прочитаны выше (без доп.
 * запросов): сглаженная (smoothGravityMedian5) кривая выбранного сеанса устройства без
 * excluded, либо (сеансов вообще нет) ручные замеры (П1/F7 — паритет «без устройства»).
 * verdictSession — уже выбран вызывающим кодом (pickVerdictSession), чтобы тот же id
 * можно было переиспользовать в сводке (BatchFermentSummary.verdictSessionId, M3-C).
 * batchCompleted/fgConfirmed (Ф3б/Ф3в) прокидываются в обе ветки как есть — verdict-core
 * сам решает, что они приоритетнее любой эвристики по кривой.
 * ⚠ Если вызывающий код передал windowHours — points сеанса уже урезаны этим окном, и
 * points[0] может быть не первой точкой сеанса целиком (искажает «падение с начала» из
 * verdict-core). Сегодня единственный вызывающий (BatchFermentBlock) окно не передаёт;
 * если появится другой caller с windowHours для этой же сводки — потребуется отдельное
 * не-урезанное чтение точек именно для вердикта.
 */
const computeBatchFermentVerdict = (
  verdictSession: FermentSessionSeries | null,
  manualMeasurements: ManualMeasurementPoint[],
  targetFg: number | null,
  batchCompleted: boolean,
  fgConfirmed: boolean,
  nowMs: number
): FermentVerdict => {
  if (verdictSession) {
    const smoothed = smoothGravityMedian5(verdictSession.points.filter((p) => !p.excluded));
    const points: { ts: number; gravitySg: number }[] = [];
    for (const p of smoothed) {
      if (p.gravitySg !== null) points.push({ ts: p.ts, gravitySg: p.gravitySg });
    }
    return computeFermentVerdict({
      points,
      sessionStartTs: verdictSession.session.startedAt.getTime(),
      targetFg,
      batchCompleted,
      fgConfirmed,
      nowMs
    });
  }

  // Нет ни одного сеанса устройства — вердикт по ручным замерам; verdict-core сам вернёт
  // insufficient_data, если их меньше двух (F5/F7: «грубее, но работает»).
  const points = manualMeasurements.map((m) => ({ ts: m.ts, gravitySg: m.gravitySg }));
  return computeFermentVerdict({ points, sessionStartTs: null, targetFg, batchCompleted, fgConfirmed, nowMs });
};

/** Последняя не-excluded точка (по ts) среди точек всех сеансов, удовлетворяющая предикату. */
const findLatestAcrossSessions = (
  sessions: FermentSessionSeries[],
  predicate: (point: FermentPointCore) => boolean
): FermentPointCore | null => {
  let latest: FermentPointCore | null = null;
  for (const session of sessions) {
    for (const point of session.points) {
      if (point.excluded || !predicate(point)) continue;
      if (!latest || point.ts > latest.ts) {
        latest = point;
      }
    }
  }
  return latest;
};

export const readBatchFermentSeries = async (
  userId: string,
  brewBatchId: string,
  opts: ReadBatchFermentSeriesOptions = {}
): Promise<BatchFermentSeriesResult> => {
  const includeExcluded = opts.includeExcluded ?? false;
  const windowHours = opts.windowHours ?? null;

  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    return { sessions: [], manualMeasurements: [], summary: emptySummary };
  }

  const sessionRows: SessionRow[] = (
    await db
      .select({
        id: fermentSessions.id,
        startedAt: fermentSessions.startedAt,
        endedAt: fermentSessions.endedAt,
        calibrationOffsetSg: fermentSessions.calibrationOffsetSg,
        deviceName: brewDevices.name,
        hardwareKind: brewDevices.hardwareKind
      })
      .from(fermentSessions)
      .innerJoin(brewDevices, eq(fermentSessions.deviceId, brewDevices.id))
      .where(and(eq(fermentSessions.brewBatchId, brewBatchId), eq(fermentSessions.userId, userId)))
      .orderBy(asc(fermentSessions.startedAt))
  ).map((row) => ({ ...row, hardwareKind: (row.hardwareKind as StreamHardwareKind | null) ?? null }));

  const sessions = await buildSessionsSeries(sessionRows, includeExcluded, windowHours);

  // Ручные замеры — читаем features/brew-batches (не владеем), без оконного фильтра:
  // нужны целиком для OG/FG сводки и как маркеры на любом выбранном диапазоне графика.
  const measurements = await listBrewMeasurements(userId, brewBatchId);
  const manualMeasurements: ManualMeasurementPoint[] = measurements.map((m) => ({
    ts: m.takenAt.getTime(),
    gravitySg: m.gravitySg,
    isFinal: m.isFinal
  }));

  // og/fg — семантика summarizeBrewMeasurements (самый ранний / isFinal), переиспользуем
  // как есть; abv/attenuation/target из неё не берём — считаем свои (от ТЕКУЩЕЙ плотности,
  // не от подтверждённого FG, см. BatchFermentSummary.abvEstimate).
  const { og, fg } = summarizeBrewMeasurements(measurements, null);

  const latestManual = measurements.length > 0 ? measurements[measurements.length - 1]! : null;
  const latestGravityPoint = findLatestAcrossSessions(sessions, (point) => point.gravitySg !== null);
  const latestTempPoint = findLatestAcrossSessions(sessions, (point) => point.tempC !== null);

  const currentGravitySg =
    latestGravityPoint && (!latestManual || latestGravityPoint.ts >= latestManual.takenAt.getTime())
      ? latestGravityPoint.gravitySg
      : (latestManual?.gravitySg ?? null);
  const tempC = latestTempPoint?.tempC ?? null;

  const hasAbvPair = og !== null && currentGravitySg !== null && og > currentGravitySg && og > 1;

  const targetFg = (batch.recipeSnapshot as { fg?: number | null } | null)?.fg ?? null;
  const verdictSession = pickVerdictSession(sessions);

  // Ф3б/Ф3в: партия завершена либо есть подтверждённый (isFinal) ручной замер — оба
  // перекрывают эвристику по кривой в verdict-core, см. computeBatchFermentVerdict.
  const batchCompleted = batch.status === "completed";
  const fgConfirmed = manualMeasurements.some((m) => m.isFinal);

  const summary: BatchFermentSummary = {
    currentGravitySg,
    tempC,
    og,
    fg,
    visibleAttenuationPct: visibleAttenuation(og, currentGravitySg),
    abvEstimate: hasAbvPair ? calculateAbv(og!, currentGravitySg!) : null,
    targetFg,
    verdict: computeBatchFermentVerdict(verdictSession, manualMeasurements, targetFg, batchCompleted, fgConfirmed, Date.now()),
    verdictSessionId: verdictSession?.session.id ?? null
  };

  return { sessions, manualMeasurements, summary };
};

// =============================================================================
//  Чтение серии устройства (§5 F3 «Карточка устройства»): ВСЕ сеансы устройства
//  (активные и завершённые) с точками, БЕЗ ручных замеров и без сводки — та
//  часть спеки, что живёт на /app/devices/[id], не на странице партии. Владение —
//  через (userId, providerId ∈ STREAM_LIKE_PROVIDER_IDS), как service.ts/sessions.ts;
//  чужое/несуществующее устройство → пустой результат (тот же принцип «без исключений», что у batch-чтения).
// =============================================================================

export type DeviceFermentSeriesResult = {
  sessions: FermentSessionSeries[];
};

export const readDeviceFermentSeries = async (
  userId: string,
  deviceId: string,
  opts: ReadBatchFermentSeriesOptions = {}
): Promise<DeviceFermentSeriesResult> => {
  const includeExcluded = opts.includeExcluded ?? false;
  const windowHours = opts.windowHours ?? null;

  const [device] = await db
    .select({ id: brewDevices.id })
    .from(brewDevices)
    .where(
      and(
        eq(brewDevices.id, deviceId),
        eq(brewDevices.userId, userId),
        inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
      )
    );
  if (!device) {
    return { sessions: [] };
  }

  const sessionRows: SessionRow[] = (
    await db
      .select({
        id: fermentSessions.id,
        startedAt: fermentSessions.startedAt,
        endedAt: fermentSessions.endedAt,
        calibrationOffsetSg: fermentSessions.calibrationOffsetSg,
        deviceName: brewDevices.name,
        hardwareKind: brewDevices.hardwareKind
      })
      .from(fermentSessions)
      .innerJoin(brewDevices, eq(fermentSessions.deviceId, brewDevices.id))
      .where(and(eq(fermentSessions.deviceId, deviceId), eq(fermentSessions.userId, userId)))
      .orderBy(asc(fermentSessions.startedAt))
  ).map((row) => ({ ...row, hardwareKind: (row.hardwareKind as StreamHardwareKind | null) ?? null }));

  const sessions = await buildSessionsSeries(sessionRows, includeExcluded, windowHours);
  return { sessions };
};
