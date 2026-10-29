"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, ArrowRight } from "lucide-react";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { brewDayStageLabels } from "@/features/brew-batches/contracts";
import { buildBrewDaySteps } from "@/features/brew-batches/brew-day";
import { buildBrewPlanSnapshot } from "@/features/brew-batches/brew-plan";
import { fmtClock } from "@/features/brew-batches/components/brew-day-timer";
import { createHomeDemoStock, homeNumber, homeQuantity, homeRequirements } from "@/features/home/landing-model";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { formatGravity } from "@/features/system/gravity-units";
import { toBatchVolumeLiters } from "@/features/recipes/units";

export function HomeBrewPreview({ recipe }: { recipe: RecipeDetailDto }) {
  const steps = useMemo(() => buildBrewDaySteps(buildBrewPlanSnapshot(recipe))
    .filter(group => group.stage !== "fermentation" && group.stage !== "packaging")
    .flatMap(group => group.steps), [recipe]);
  const firstTimer = Math.max(0, steps.findIndex(step => step.kind === "timer" && (step.durationSeconds ?? 0) > 0));
  const [stepIndex, setStepIndex] = useState(firstTimer);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [note, setNote] = useState("Повторить засыпь. Сравнить аромат через две недели.");
  const [noteStatus, setNoteStatus] = useState("Пример заметки");
  const [noteReady, setNoteReady] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [stockExpanded, setStockExpanded] = useState(false);
  const [stockMessage, setStockMessage] = useState("");
  const step = steps[stepIndex];
  const stepTitle = step?.stage === "mash" && /^шаг\s*\d+$/iu.test(step.title) ? "Пауза затирания" : step?.title;
  const next = steps[stepIndex + 1];
  const duration = step?.durationSeconds ?? 0;
  const elapsed = elapsedSeconds + (runningSince == null ? 0 : Math.max(0, now - runningSince) / 1000);
  const remaining = Math.max(0, duration - elapsed);
  const requirements = useMemo(() => homeRequirements(recipe), [recipe]);
  const stock = useMemo(() => createHomeDemoStock([recipe]), [recipe]);
  const stages = [...new Set(steps.map(item => item.stage))];
  const batchSizeL = toBatchVolumeLiters(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit);

  useEffect(() => {
    setStepIndex(firstTimer);
    setRunningSince(null);
    setElapsedSeconds(0);
    setConsumed(false);
    setConfirmOpen(false);
    setStockMessage("");
  }, [steps, firstTimer]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`nb-home-note:${recipe.id}`);
      if (saved != null) {
        setNote(saved);
        setNoteStatus("Сохранено в примере на этом устройстве");
      }
    } catch { /* The example remains editable when browser storage is unavailable. */ }
    setNoteReady(true);
  }, [recipe.id]);

  useEffect(() => {
    if (runningSince == null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [runningSince]);

  useEffect(() => {
    if (runningSince != null && remaining <= 0) {
      setElapsedSeconds(duration);
      setRunningSince(null);
    }
  }, [duration, remaining, runningSince]);

  function resetTimer() {
    setRunningSince(null);
    setElapsedSeconds(0);
  }

  function toggleTimer() {
    if (runningSince != null) {
      setElapsedSeconds(Math.min(duration, elapsedSeconds + (Date.now() - runningSince) / 1000));
      setRunningSince(null);
    } else {
      const startedAt = Date.now();
      if (remaining <= 0) setElapsedSeconds(0);
      setNow(startedAt);
      setRunningSince(startedAt);
    }
  }

  function saveNote() {
    try {
      localStorage.setItem(`nb-home-note:${recipe.id}`, note);
      setNoteStatus("Сохранено в примере на этом устройстве");
    } catch {
      setNoteStatus("Не удалось сохранить заметку. Скопируйте текст перед закрытием страницы.");
    }
  }

  return <section id="home-brew">
    <div className="home-section-heading">
      <div>
        <h2>Варочный день и журнал партии</h2>
        <p className="home-section-lead">Сохраните замеры и заметки, чтобы повторить удачную варку.</p>
      </div>
      <span>Пример партии</span>
    </div>
    <div className="home-master home-brew-preview">
      <div className="home-brew-title"><h3>{recipe.title}</h3>{batchSizeL != null && <span>{homeNumber(batchSizeL)} л</span>}</div>
      <div className="home-brew-content">
        <div className="home-brew-timer">
          <p className="home-brew-eyebrow">Варочный день</p>
          {step ? <>
            <ol className="home-brew-stages" aria-label="Этапы варки">{stages.map(stage => <li key={stage} aria-current={step.stage === stage ? "step" : undefined}>{brewDayStageLabels[stage]}</li>)}</ol>
            <h3>{stepTitle}{step.temperatureC != null && <span> · {homeNumber(step.temperatureC)} °C</span>}</h3>
            {step.detail && step.kind !== "timer" && <p className="home-brew-detail">{step.detail}</p>}
            {duration > 0 ? <>
              <p className="home-brew-clock" role="timer" aria-label="Осталось на шаге">{fmtClock(remaining)}</p>
              <div className="home-brew-controls">
                <button type="button" className="home-button home-primary" onClick={toggleTimer}>{runningSince != null ? <Pause aria-hidden /> : <Play aria-hidden />}{runningSince != null ? "Пауза" : remaining <= 0 ? "Запустить заново" : elapsedSeconds > 0 ? "Продолжить" : "Запустить таймер"}</button>
                <button type="button" className="home-button" aria-label="Сбросить таймер примера" onClick={resetTimer}><RotateCcw aria-hidden /></button>
              </div>
              <p className="home-brew-note" aria-live="polite">{remaining <= 0 ? "Время шага истекло" : runningSince != null ? "Таймер запущен" : elapsedSeconds > 0 ? "Таймер на паузе" : "Шаги и время взяты из выбранного рецепта."}</p>
            </> : <p className="home-brew-note">Этот шаг выполняется без таймера.</p>}
            <button type="button" className="home-inline-link home-brew-next-step" onClick={() => { resetTimer(); setStepIndex(next ? stepIndex + 1 : 0); }}>{next ? "К следующему шагу" : "Начать сначала"}<ArrowRight aria-hidden /></button>
          </> : <p className="home-panel-empty">В этом рецепте пока нет шагов варочного дня.</p>}
        </div>
        <div className="home-brew-journal">
          <h3 className="home-brew-eyebrow">Журнал партии</h3>
          <dl className="home-brew-readings">
            <div><dt>Начальная плотность</dt><dd>{recipe.og != null ? formatGravity(recipe.og, "plato").replace(".", ",") : "—"}</dd></div>
            <div><dt>Конечная плотность</dt><dd>{recipe.fg != null ? formatGravity(recipe.fg, "plato").replace(".", ",") : "—"}</dd></div>
          </dl>
          <p className="home-brew-note">Для примера — плотности из рецепта.</p>
          <label className="home-brew-journal-note">Что учесть в следующей варке<textarea rows={2} maxLength={1000} value={note} disabled={!noteReady} onChange={event => { setNote(event.target.value); setNoteStatus("Изменения в примере не сохранены"); }} /></label>
          <div className="home-brew-note-footer"><span role="status">{noteStatus}</span><button type="button" disabled={!noteReady} onClick={saveNote}>Сохранить в примере</button></div>
        </div>
      </div>
      <details className="home-brew-consumption">
        <summary>Списание ингредиентов</summary>
        {requirements.length ? <>
          <div className="home-two-columns home-brew-stock">
            <div>
              <h3>Списание ингредиентов на варку</h3>
              <p className="home-brew-detail">Проверьте количество перед списанием.</p>
              <div className="home-actions"><button type="button" className="home-button home-primary" onClick={() => {
                if (consumed) { setConsumed(false); setStockMessage("Ингредиенты возвращены в запасы примера."); }
                else setConfirmOpen(true);
              }}>{consumed ? "Вернуть на склад" : "Списать ингредиенты"}</button></div>
              <p className="home-brew-note" role="status">{stockMessage}</p>
            </div>
            <div>
              <table className="home-brew-stock-table">
                <caption className="sr-only">{consumed ? "Остатки после списания в примере партии" : "Расход и ожидаемые остатки в примере партии"}</caption>
                <thead><tr><th scope="col">Ингредиент</th><th scope="col">Было</th><th scope="col">На варку</th><th scope="col">Остаток</th></tr></thead>
                <tbody>{(stockExpanded ? requirements : requirements.slice(0, 3)).map(line => {
                  const before = stock.find(item => item.key === line.key)?.quantity ?? 0;
                  return <tr key={line.key}><th scope="row">{line.name}</th><td>{homeQuantity(before, line.unit)}</td><td>{homeQuantity(line.quantity, line.unit)}</td><td>{homeQuantity(Math.max(0, before - line.quantity), line.unit)}</td></tr>;
                })}</tbody>
              </table>
              {requirements.length > 3 && <button type="button" className="home-stock-more" aria-expanded={stockExpanded} onClick={() => setStockExpanded(value => !value)}>{stockExpanded ? "Свернуть состав" : "Показать весь состав"}</button>}
            </div>
          </div>
          <ConfirmActionDialog open={confirmOpen} title="Списать ингредиенты в примере?" description="Списываем количество для этой партии. Ингредиенты можно будет вернуть в запасы примера." confirmLabel="Подтвердить списание" tone="primary" onClose={() => setConfirmOpen(false)} onConfirm={() => { setConsumed(true); setConfirmOpen(false); setStockMessage("Ингредиенты списаны в примере партии."); }} />
        </> : <p className="home-panel-empty">В этом рецепте ингредиенты пока не указаны.</p>}
      </details>
    </div>
  </section>;
}
