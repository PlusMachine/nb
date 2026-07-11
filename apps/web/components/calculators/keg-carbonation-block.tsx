"use client";

import React from "react";
import { RotateCcw } from "lucide-react";

import {
  barToPsi,
  CARBONATION_PRESSURE_RANGE_BAR,
  CARBONATION_STYLE_RANGES,
  CARBONATION_TEMP_RANGE_C,
  celsiusToFahrenheit,
  co2Zone,
  fahrenheitToCelsius,
  kegCo2Volumes,
  kegPressurePsi,
  matchCarbonationStyles,
  psiToBar,
  type Co2Zone
} from "@nb/brewing-core";

import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";

// Вся математика (прямая/обратная формула, зоны, стили) — в @nb/brewing-core. Компонент
// только строит сетку, форматирует и разводит hover/click/tap-состояния.

type Unit = "metric" | "imperial";

type Cell = {
  row: number;
  col: number;
  tempC: number;
  bar: number;
  volumes: number;
};

const ZONE_LABEL: Record<Co2Zone, string> = {
  low: "низкая",
  standard: "средняя",
  lively: "высокая",
  high: "очень высокая"
};

// Заливки зон: синий→зелёный→янтарь→красный по нарастанию карбонизации. Явные dark:-варианты
// (полупрозрачный цвет поверх тёмного фона), чтобы зоны читались в обеих темах.
const ZONE_FILL: Record<Co2Zone, string> = {
  low: "bg-sky-100 dark:bg-sky-500/25",
  standard: "bg-emerald-100 dark:bg-emerald-500/25",
  lively: "bg-amber-100 dark:bg-amber-500/25",
  high: "bg-rose-100 dark:bg-rose-500/25"
};

const ZONE_LEGEND: Array<{ zone: Co2Zone; range: string }> = [
  { zone: "low", range: "< 2,0" },
  { zone: "standard", range: "2,0–2,6" },
  { zone: "lively", range: "2,6–3,4" },
  { zone: "high", range: "> 3,4" }
];

// value.toFixed(n) с запятой как десятичным разделителем (как принято в приложении).
const fmt = (value: number, decimals: number): string => value.toFixed(decimals).replace(".", ",");

const buildRange = (min: number, max: number, step: number): number[] => {
  const count = Math.round((max - min) / step) + 1;
  return Array.from({ length: count }, (_, index) => Number((min + index * step).toFixed(4)));
};

const TEMPS_C = buildRange(CARBONATION_TEMP_RANGE_C.min, CARBONATION_TEMP_RANGE_C.max, CARBONATION_TEMP_RANGE_C.step);
const BARS = buildRange(CARBONATION_PRESSURE_RANGE_BAR.min, CARBONATION_PRESSURE_RANGE_BAR.max, CARBONATION_PRESSURE_RANGE_BAR.step);
const GRID_MAX_BAR = CARBONATION_PRESSURE_RANGE_BAR.max;

// Заранее посчитанная сетка: объёмы CO2 для каждой пары (T, P).
const GRID: Cell[][] = TEMPS_C.map((tempC, row) =>
  BARS.map((bar, col) => ({ row, col, tempC, bar, volumes: kegCo2Volumes(tempC, barToPsi(bar)) }))
);

const tempLabel = (tempC: number, unit: Unit): string =>
  unit === "metric" ? `${fmt(tempC, 0)} °C` : `${Math.round(celsiusToFahrenheit(tempC))} °F`;

const pressureLabel = (bar: number, unit: Unit): string =>
  unit === "metric" ? fmt(bar, 2) : fmt(barToPsi(bar), 1);

const pressureUnitLabel = (unit: Unit): string => (unit === "metric" ? "бар" : "PSI");

const pressureCeilingLabel = (unit: Unit): string =>
  unit === "metric" ? `${fmt(GRID_MAX_BAR, 1)} бар` : `${fmt(barToPsi(GRID_MAX_BAR), 0)} PSI`;

// Мемоизированная ячейка: перерисовывается только та ячейка, у которой реально
// изменился хотя бы один из этих примитивов (не вся сетка при каждом движении мыши).
const TableCell = React.memo(function TableCell({
  row,
  col,
  volumesLabel,
  zoneFill,
  crosshair,
  isActive,
  dimmed,
  outlined,
  isNearest
}: {
  row: number;
  col: number;
  volumesLabel: string;
  zoneFill: string;
  crosshair: boolean;
  isActive: boolean;
  dimmed: boolean;
  outlined: boolean;
  isNearest: boolean;
}) {
  return (
    <td
      data-row={row}
      data-col={col}
      className={`relative cursor-pointer px-2 py-1.5 tabular-nums transition-[opacity,box-shadow] ${zoneFill} ${
        // Перекрестье — оверлей через псевдоэлемент, а не второй bg-* (он бы конфликтовал с
        // заливкой зоны: два background-color на одном элементе не смешиваются, побеждает
        // тот, что позже в CSS, — поэтому на части зон крестик пропадал).
        crosshair
          ? "before:pointer-events-none before:absolute before:inset-0 before:bg-foreground/15 before:content-['']"
          : ""
      } ${isActive ? "font-semibold text-foreground" : "text-foreground"} ${
        dimmed ? "opacity-25" : ""
      } ${outlined ? "z-[1] ring-1 ring-inset ring-foreground/60" : ""} ${
        isNearest ? "z-[2] outline-dashed outline-2 -outline-offset-2 outline-zinc-900/80" : ""
      }`}
    >
      {volumesLabel}
    </td>
  );
});
TableCell.displayName = "KegCarbonationTableCell";

const nearestIndex = (values: number[], target: number): number => {
  let best = 0;
  let bestDelta = Infinity;
  values.forEach((value, index) => {
    const delta = Math.abs(value - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = index;
    }
  });
  return best;
};

export function KegCarbonationBlock({
  initialQuery,
  onReset
}: {
  initialQuery?: Record<string, string>;
  onReset?: () => void;
}) {
  const [unit, setUnit] = React.useState<Unit>("metric");
  // Ввод обратного расчёта: температура хранится строкой в текущей единице (конвертируется
  // при переключении, а не сбрасывается); объёмы безразмерны.
  const initialVolumes = initialQuery?.targetCo2Volumes ?? "2.4";
  const initialTemp = initialQuery?.beerTemperatureC ?? "4";
  const [volumesText, setVolumesText] = React.useState(initialVolumes);
  const [tempText, setTempText] = React.useState(initialTemp);
  const [styleId, setStyleId] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<{ row: number; col: number } | null>(null);
  const [hover, setHover] = React.useState<{ row: number; col: number } | null>(null);

  const volumes = parseDecimalInput(volumesText);
  const tempInput = parseDecimalInput(tempText);
  const tempC = tempInput == null ? null : unit === "metric" ? tempInput : fahrenheitToCelsius(tempInput);

  // Обратный расчёт: точное давление под целевые объёмы при заданной температуре.
  const resultPsi = tempC != null && volumes != null && Number.isFinite(volumes) ? kegPressurePsi(tempC, volumes) : null;
  const resultUnreachable = resultPsi != null && resultPsi <= 0;
  const resultBar = resultPsi != null ? psiToBar(resultPsi) : null;
  // Ответ может лежать выше потолка сетки — тогда точное давление есть в расчёте, а ячейки
  // в таблице для него нет.
  const resultAboveGrid = resultBar != null && resultBar > GRID_MAX_BAR + 1e-9;
  const resultValue = resultPsi != null && !resultUnreachable
    ? unit === "metric"
      ? fmt(psiToBar(resultPsi), 2)
      : fmt(resultPsi, 1)
    : null;

  // Ячейка, ближайшая к результату расчёта — помечаем пунктиром. Только когда результат
  // попадает в диапазон таблицы (иначе метка «прилипла» бы к последней колонке и врала).
  const nearestCell = resultPsi != null && !resultUnreachable && !resultAboveGrid && tempC != null
    ? { row: nearestIndex(TEMPS_C, tempC), col: nearestIndex(BARS, psiToBar(resultPsi)) }
    : null;

  const active = hover ?? pinned;
  const activeCell = active ? GRID[active.row][active.col] : null;

  const selectedStyle = styleId ? CARBONATION_STYLE_RANGES.find((style) => style.id === styleId) ?? null : null;
  const inSelectedStyle = (cell: Cell): boolean =>
    selectedStyle != null && cell.volumes >= selectedStyle.minVolumes && cell.volumes <= selectedStyle.maxVolumes;

  // Сводный баннер «стиль + температура → диапазон давления»: границы считаются обратной
  // формулой от min/max объёмов стиля (точные значения), а не собираются из колонок сетки.
  const styleBanner = selectedStyle != null && tempC != null
    ? (() => {
        const lo = Math.max(0, kegPressurePsi(tempC, selectedStyle.minVolumes));
        const hi = Math.max(0, kegPressurePsi(tempC, selectedStyle.maxVolumes));
        const format = (psi: number) => (unit === "metric" ? fmt(psiToBar(psi), 2) : fmt(psi, 1));
        return {
          tempLabel: tempLabel(tempC, unit),
          styleLabel: selectedStyle.label,
          low: format(Math.min(lo, hi)),
          high: format(Math.max(lo, hi)),
          unit: pressureUnitLabel(unit)
        };
      })()
    : null;

  const toggleUnit = (next: Unit) => {
    if (next === unit) return;
    // Температура конвертируется, а не сбрасывается. Объёмы безразмерны — не трогаем.
    if (tempInput != null) {
      const converted = next === "imperial" ? celsiusToFahrenheit(tempInput) : fahrenheitToCelsius(tempInput);
      setTempText(String(Number(converted.toFixed(1))));
    }
    setUnit(next);
  };

  const fillFromCell = (cell: Cell) => {
    // Клик по ячейке подставляет её V и T в обратный расчёт.
    setVolumesText(fmt(cell.volumes, 2).replace(",", "."));
    const tempValue = unit === "metric" ? cell.tempC : celsiusToFahrenheit(cell.tempC);
    setTempText(String(Number(tempValue.toFixed(1))));
    setPinned({ row: cell.row, col: cell.col });
  };

  const reset = () => {
    setStyleId(null);
    setPinned(null);
    setHover(null);
    setVolumesText("2.4");
    setTempText(unit === "metric" ? "4" : String(Number(celsiusToFahrenheit(4).toFixed(1))));
    onReset?.();
  };

  const isColActive = (col: number) => active?.col === col;
  const isRowActive = (row: number) => active?.row === row;

  // Один обработчик на всю таблицу вместо onMouseEnter/onMouseLeave/onClick на каждой из
  // сотен ячеек — иначе при быстром движении мыши перерисовывается вся сетка на каждый чих
  // и крестик перестаёт успевать за курсором.
  const cellFromEvent = (event: React.MouseEvent<HTMLTableSectionElement>): Cell | null => {
    const td = (event.target as HTMLElement).closest("td[data-row]") as HTMLElement | null;
    if (!td) return null;
    const row = Number(td.dataset.row);
    const col = Number(td.dataset.col);
    return GRID[row]?.[col] ?? null;
  };

  const handleGridPointerOver = (event: React.MouseEvent<HTMLTableSectionElement>) => {
    const cell = cellFromEvent(event);
    if (!cell) return;
    setHover((prev) => (prev && prev.row === cell.row && prev.col === cell.col ? prev : { row: cell.row, col: cell.col }));
  };

  const handleGridPointerLeave = () => setHover(null);

  const handleGridClick = (event: React.MouseEvent<HTMLTableSectionElement>) => {
    const cell = cellFromEvent(event);
    if (cell) fillFromCell(cell);
  };

  return (
    <div className="space-y-4" data-testid="keg-carbonation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Единицы измерения"
          className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-sm font-medium"
        >
          {(["metric", "imperial"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={unit === option}
              onClick={() => toggleUnit(option)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                unit === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option === "metric" ? "бар · °C" : "PSI · °F"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>

      {/* Обратный расчёт — точный ответ по непрерывной формуле, над таблицей. */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <span className="pb-1.5 text-sm text-muted-foreground">Хочу</span>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">объёмы CO₂</span>
              <NumericInput
                value={volumesText}
                onChange={(event) => setVolumesText(event.target.value)}
                className="w-24 rounded-lg border border-border bg-card px-3 py-1.5 text-sm tabular-nums text-foreground outline-none focus:border-ring"
              />
            </label>
            <span className="pb-1.5 text-sm text-muted-foreground">при</span>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                температура {unit === "metric" ? "°C" : "°F"}
              </span>
              <NumericInput
                value={tempText}
                onChange={(event) => setTempText(event.target.value)}
                allowNegative
                className="w-24 rounded-lg border border-border bg-card px-3 py-1.5 text-sm tabular-nums text-foreground outline-none focus:border-ring"
              />
            </label>
          </div>
          <div className="sm:text-right">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">давление</span>
            {resultUnreachable ? (
              <p className="max-w-xs text-sm leading-5 text-muted-foreground">
                При такой температуре цель достигается почти без избыточного давления.
              </p>
            ) : resultValue != null ? (
              <div>
                <p className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
                  {resultValue} <span className="text-base font-medium text-muted-foreground">{pressureUnitLabel(unit)}</span>
                </p>
                {resultAboveGrid ? (
                  <p className="mt-0.5 text-xs leading-5 text-warning-subtle-foreground">
                    Выше {pressureCeilingLabel(unit)} — за пределами таблицы.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>
      </div>

      {/* Селектор стиля — чипы (single-select, повторный клик снимает выбор). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CARBONATION_STYLE_RANGES.map((style) => {
          const selected = style.id === styleId;
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setStyleId(selected ? null : style.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
              }`}
            >
              {style.label}
              <span className={selected ? "text-background/70" : "text-muted-foreground"}>
                {fmt(style.minVolumes, 1)}–{fmt(style.maxVolumes, 1)}
              </span>
            </button>
          );
        })}
      </div>

      {styleBanner ? (
        <p className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm leading-6 text-foreground">
          При {styleBanner.tempLabel} для «{styleBanner.styleLabel}» нужно{" "}
          <span className="font-semibold text-foreground">
            {styleBanner.low}–{styleBanner.high} {styleBanner.unit}
          </span>
          .
        </p>
      ) : null}

      {/* Строка-расшифровка активной ячейки (hover на десктопе / tap на тач). */}
      <div className="min-h-[1.5rem] text-sm text-muted-foreground" aria-live="polite">
        {activeCell ? (
          <span>
            {tempLabel(activeCell.tempC, unit)} + {pressureLabel(activeCell.bar, unit)} {pressureUnitLabel(unit)} →{" "}
            <span className="font-semibold text-foreground">{fmt(activeCell.volumes, 2)} объёма CO₂</span>
            {" · "}
            {ZONE_LABEL[co2Zone(activeCell.volumes)]}
            {(() => {
              const styles = matchCarbonationStyles(activeCell.volumes);
              return styles.length ? ` · подходит: ${styles.map((style) => style.label).join(", ")}` : "";
            })()}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {/* На тач-устройствах hover нет — там та же расшифровка открывается тапом. */}
            <span className="hidden [@media(hover:hover)]:inline">Наведите на ячейку — покажем расшифровку.</span>
            <span className="[@media(hover:hover)]:hidden">Нажмите на ячейку — покажем расшифровку.</span>
          </span>
        )}
      </div>

      {/* Таблица-герой: горизонтальный скролл на мобильном. */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[820px] border-collapse text-center text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                T \ {pressureUnitLabel(unit)}
              </th>
              {BARS.map((bar, col) => (
                <th
                  key={bar}
                  className={`px-2 py-2 text-xs font-semibold tabular-nums transition-colors ${
                    isColActive(col) ? "bg-accent text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {pressureLabel(bar, unit)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody onMouseOver={handleGridPointerOver} onMouseLeave={handleGridPointerLeave} onClick={handleGridClick}>
            {GRID.map((cells, row) => (
              <tr key={TEMPS_C[row]}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 px-2 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                    isRowActive(row) ? "bg-accent text-foreground" : "bg-card text-muted-foreground"
                  }`}
                >
                  {tempLabel(TEMPS_C[row], unit)}
                </th>
                {cells.map((cell) => {
                  const zone = co2Zone(cell.volumes);
                  // Перекрестье ведём только к заголовкам — вверх (к шкале давления) и влево
                  // (к шкале температуры), а не вправо/вниз: подписи есть только сверху и слева.
                  const crosshair =
                    active != null &&
                    ((cell.col === active.col && row <= active.row) ||
                      (row === active.row && cell.col <= active.col));
                  const isActive = active?.row === row && active?.col === cell.col;
                  const isNearest = nearestCell?.row === row && nearestCell?.col === cell.col;
                  // «Ближайшую» ячейку никогда не приглушаем — иначе пунктирная метка на ней
                  // тонет под opacity стилевого приглушения.
                  const dimmed = selectedStyle != null && !inSelectedStyle(cell) && !isNearest;
                  const outlined = inSelectedStyle(cell);
                  return (
                    <TableCell
                      key={cell.col}
                      row={row}
                      col={cell.col}
                      volumesLabel={fmt(cell.volumes, 2)}
                      zoneFill={ZONE_FILL[zone]}
                      crosshair={crosshair}
                      isActive={isActive}
                      dimmed={dimmed}
                      outlined={outlined}
                      isNearest={isNearest}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Легенда зон. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {ZONE_LEGEND.map(({ zone, range }) => (
          <span key={zone} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${ZONE_FILL[zone]}`} aria-hidden="true" />
            {ZONE_LABEL[zone]} <span className="tabular-nums text-muted-foreground">{range}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
