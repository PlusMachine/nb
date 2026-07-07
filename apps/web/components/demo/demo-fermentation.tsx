import { FermentHistoryChart } from "@/features/brew-controller/components/ferment-history-chart";
import { FERMENT_HISTORY_WINDOW_DAYS, type BrewMeasurementDto, type TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { summarizeBrewMeasurements } from "@/features/brew-batches/measurements";
import { formatGravity, formatGravitySecondary } from "@/features/system/gravity-units";

// Секция 4 «Брожение» (docs/demo-page.md §2.4). График и сводка замеров — те же
// чистые компоненты/функции, что и на реальной странице партии; интерактивная
// форма журнала (BrewJournal) не реюзается — там server actions, здесь только
// read-only реплика плиток и списка замеров.

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (value: Date) => dateFmt.format(new Date(value));
const fmtAbv = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);
const fmtAtt = (value: number | null) => (value == null ? "—" : `${Math.round(value)}%`);

function StatTile({
  label,
  value,
  secondary,
  target
}: {
  label: string;
  value: string;
  secondary?: string | null;
  target?: string | null;
}) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
        {secondary ? <div className="text-[11px] text-muted-foreground">{secondary}</div> : null}
      </div>
      {target ? <div className="text-[11px] tabular-nums text-muted-foreground">цель {target}</div> : null}
    </div>
  );
}

export function DemoFermentationSection({
  history,
  planSteps,
  measurements,
  dayIndex,
  target
}: {
  history: TelemetryHistoryPoint[];
  planSteps: { tempC: number; hours: number }[];
  measurements: BrewMeasurementDto[];
  dayIndex: number;
  target: { og: number; fg: number; abv: number };
}) {
  // Плотности — фиксированная единица SG (спека §2.4): секция витринная, без
  // персонального preferredGravityUnit пользователя.
  const summary = summarizeBrewMeasurements(measurements, target);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Czech Lager — весенняя партия</h3>
        <p className="text-sm text-muted-foreground">день {dayIndex} из 21</p>
      </div>

      <FermentHistoryChart
        source={{ kind: "batch", brewBatchId: "demo" }}
        hasDevice
        initial={history}
        planSteps={planSteps}
        windowDays={FERMENT_HISTORY_WINDOW_DAYS}
      />

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h4 className="text-base font-semibold text-foreground">Журнал замеров</h4>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="OG"
            value={formatGravity(summary.og, "sg")}
            secondary={formatGravitySecondary(summary.og, "sg")}
            target={summary.target?.og != null ? formatGravity(summary.target.og, "sg") : null}
          />
          <StatTile
            label="FG"
            value={formatGravity(summary.fg, "sg")}
            secondary={formatGravitySecondary(summary.fg, "sg")}
            target={summary.target?.fg != null ? formatGravity(summary.target.fg, "sg") : null}
          />
          <StatTile
            label="ABV"
            value={fmtAbv(summary.abv)}
            target={summary.target?.abv != null ? fmtAbv(summary.target.abv) : null}
          />
          <StatTile label="Сбраживание" value={fmtAtt(summary.apparentAttenuation)} />
        </div>

        <ul className="divide-y divide-border">
          {measurements.map((measurement, index) => {
            const tag = measurement.isFinal ? "FG" : index === 0 ? "OG" : null;
            return (
              <li key={measurement.id} className="flex items-center gap-3 py-2">
                <span className="w-16 shrink-0 text-base font-semibold tabular-nums text-foreground">
                  {formatGravity(measurement.gravitySg, "sg")}
                </span>
                {tag ? (
                  <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                    {tag}
                  </span>
                ) : null}
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(measurement.takenAt)}</span>
                {measurement.note ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{measurement.note}</span>
                ) : (
                  <span className="flex-1" />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-sm text-muted-foreground">
        Прошивка держит температурный профиль сама; замеры и заметки остаются в журнале партии вместе со снапшотом
        рецепта.
      </p>
    </div>
  );
}
