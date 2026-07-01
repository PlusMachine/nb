"use client";

// =============================================================================
//  ManualControlCard — ручной режим (RAPT-style: Target / Heat% / Pump + тогглы).
//  Ложится 1:1 на ENTER_MANUAL / MANUAL_SETPOINT / MANUAL_PWM / MANUAL_HEAT /
//  MANUAL_PUMP / EXIT_MANUAL. Эксклюзивно через control-lease (single-writer);
//  опасное (включение нагрева / подъём мощности) гейтится сервером (lease +
//  freshness) и firmware/sim dead-man на плате.
//
//  Безопасность удалённого нагрева (см. docs §Безопасность):
//   - включение нагрева — hold-to-confirm (не случайный тап);
//   - «применяется…» до подтверждения телеметрией — не врём «включено» заранее;
//   - device-keepalive: пока карта открыта и нагрев включён, периодически шлём
//     команду устройству (< dead-man TTL), чтобы плата не гасила нагрев; ушёл
//     оператор / закрыл вкладку → keepalive прекращается → нагрев OFF на плате.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Power, Waves } from "lucide-react";

import { SliderScaffold } from "@nb/ui";
import {
  cmdEnterManual,
  cmdExitManual,
  cmdManualSetpoint,
  cmdManualPwm,
  cmdManualHeat,
  cmdManualPump,
  type Command,
  type Telemetry,
} from "@nb/brewforge-protocol";

import { HoldToConfirmButton } from "./hold-to-confirm-button";
import type { SendResult } from "../use-device-command";

// Период device-keepalive: < sim dead-man TTL (45с), с запасом на джиттер.
const HEAT_KEEPALIVE_MS = 20_000;

const SETPOINT_MIN = 20;
const SETPOINT_MAX = 105;
const PWM_STEP = 5;

type Props = {
  telemetry: Telemetry | null;
  hasDevice: boolean;
  controlsHeld: boolean;
  isLive: boolean;
  pending: boolean;
  send: (command: Command) => Promise<SendResult>;
};

export function ManualControlCard({ telemetry, hasDevice, controlsHeld, isLive, pending, send }: Props) {
  const inManual = telemetry?.stageName === "MANUAL";
  const running =
    telemetry != null &&
    !["IDLE", "DONE", "FAULT", "MANUAL"].includes(telemetry.stageName);
  // heatMode: 0=OFF; в ручном нагрев «включён», когда heatMode !== OFF.
  const heatEnabled = (telemetry?.heatMode ?? 0) !== 0;
  const pumpOn = telemetry?.pumpOn ?? false;
  const heatOn = telemetry?.heatOn ?? false;
  const deviceDuty = telemetry?.heatDutyPct ?? 0;
  const deviceSetpoint = telemetry?.setpointC ?? 65;

  // Локальные значения слайдеров + флаги «тащим» (чтобы телеметрия не дёргала ползунок).
  const [setpointLocal, setSetpointLocal] = useState(deviceSetpoint);
  const [pwmLocal, setPwmLocal] = useState(deviceDuty);
  const draggingSetpoint = useRef(false);
  const draggingPwm = useRef(false);

  // «применяется…» для включения/выключения нагрева: ждём, пока телеметрия отразит.
  const [pendingHeat, setPendingHeat] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const controlsDisabled = !controlsHeld || !isLive || pending;

  // Синхронизация слайдеров из телеметрии, пока пользователь их не тащит.
  useEffect(() => {
    if (!draggingSetpoint.current) setSetpointLocal(deviceSetpoint);
  }, [deviceSetpoint]);
  useEffect(() => {
    if (!draggingPwm.current) setPwmLocal(deviceDuty);
  }, [deviceDuty]);

  // Снимаем «применяется…», когда телеметрия отразила запрошенное состояние нагрева.
  useEffect(() => {
    if (pendingHeat !== null && heatEnabled === pendingHeat) setPendingHeat(null);
  }, [heatEnabled, pendingHeat]);

  // Держим актуальный duty для keepalive без пере-создания интервала на каждый кадр.
  const dutyRef = useRef(deviceDuty);
  useEffect(() => {
    dutyRef.current = deviceDuty;
  }, [deviceDuty]);

  // Device-keepalive: пока в ручном нагрев включён и я управляю — кормим dead-man
  // платы (иначе она погасит нагрев по TTL). Прекращается при уходе/потере lease.
  useEffect(() => {
    if (!(inManual && heatEnabled && controlsHeld && isLive)) return;
    const id = window.setInterval(() => {
      void send(cmdManualPwm(dutyRef.current));
    }, HEAT_KEEPALIVE_MS);
    return () => window.clearInterval(id);
  }, [inManual, heatEnabled, controlsHeld, isLive, send]);

  const runFeedback = useCallback(
    async (command: Command, okMsg: string) => {
      setMsg(null);
      const r = await send(command);
      setMsg(r.ok ? okMsg : r.error ?? "Не удалось выполнить команду");
      return r;
    },
    [send],
  );

  if (!hasDevice) return null;

  // --- вне ручного режима: вход -------------------------------------------
  if (!inManual) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">Ручной режим</p>
        <p className="mt-1 text-sm text-zinc-500">
          Прямое управление уставкой, мощностью и насосом. Эксклюзивно — управляет один сеанс.
        </p>
        {running ? (
          <p className="mt-2 text-xs text-amber-700">Вход в ручной режим прервёт текущую варку.</p>
        ) : null}
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => void runFeedback(cmdEnterManual(), "Ручной режим включён")}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Power className="h-4 w-4" aria-hidden />
          Войти в ручной режим
        </button>
        {msg ? <p className="mt-2 text-sm text-zinc-600">{msg}</p> : null}
        {!controlsHeld && isLive ? (
          <p className="mt-2 text-xs text-amber-700">Управляет другой сеанс — запросите перехват.</p>
        ) : null}
      </section>
    );
  }

  // --- в ручном режиме -----------------------------------------------------
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">Ручной режим</p>
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => void runFeedback(cmdExitManual(), "Выход из ручного режима")}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Выйти из ручного
        </button>
      </div>

      {/* Target (уставка). */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Целевая температура</span>
          <span className="font-medium tabular-nums text-zinc-900">{Math.round(setpointLocal)} °C</span>
        </div>
        <div className="mt-2">
          <SliderScaffold
            value={[setpointLocal]}
            min={SETPOINT_MIN}
            max={SETPOINT_MAX}
            step={1}
            ariaLabel="Целевая температура"
            disabled={controlsDisabled}
            onValueChange={(v) => {
              draggingSetpoint.current = true;
              setSetpointLocal(v[0]);
            }}
            onValueCommit={(v) => {
              draggingSetpoint.current = false;
              void runFeedback(cmdManualSetpoint(v[0]), `Уставка ${Math.round(v[0])} °C`);
            }}
          />
        </div>
      </div>

      {/* Heat % (мощность). */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Мощность нагрева</span>
          <span className="font-medium tabular-nums text-zinc-900">{Math.round(pwmLocal)} %</span>
        </div>
        <div className="mt-2">
          <SliderScaffold
            value={[pwmLocal]}
            min={0}
            max={100}
            step={PWM_STEP}
            ariaLabel="Мощность нагрева"
            disabled={controlsDisabled}
            onValueChange={(v) => {
              draggingPwm.current = true;
              setPwmLocal(v[0]);
            }}
            onValueCommit={(v) => {
              draggingPwm.current = false;
              void runFeedback(cmdManualPwm(v[0]), `Мощность ${Math.round(v[0])} %`);
            }}
          />
        </div>
      </div>

      {/* Тогглы: нагрев (hold-to-confirm вкл) + насос. */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        {heatEnabled ? (
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => {
              setPendingHeat(false);
              void runFeedback(cmdManualHeat(false), "Нагрев выключен");
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Flame className="h-4 w-4" aria-hidden />
            Выключить нагрев
          </button>
        ) : (
          <HoldToConfirmButton
            label="Включить нагрев"
            holdingLabel="Держите для включения…"
            disabled={controlsDisabled}
            icon={<Flame className="h-4 w-4" aria-hidden />}
            onConfirm={() => {
              setPendingHeat(true);
              void runFeedback(cmdManualHeat(true), "Нагрев включён");
            }}
          />
        )}

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => void runFeedback(cmdManualPump(!pumpOn), pumpOn ? "Насос выключен" : "Насос включён")}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            pumpOn ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          <Waves className="h-4 w-4" aria-hidden />
          {pumpOn ? "Насос: ВКЛ" : "Насос: ВЫКЛ"}
        </button>

        {/* Живой статус нагрева: «применяется…» до подтверждения телеметрией. */}
        <span className="text-xs text-zinc-500">
          {pendingHeat !== null
            ? "применяется…"
            : heatOn
              ? `нагрев активен · ${deviceDuty}%`
              : heatEnabled
                ? "нагрев включён · 0%"
                : "нагрев выключен"}
        </span>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Нагрев на плате гаснет при потере связи (≈45&nbsp;с без команд) и по макс. времени
        (30&nbsp;мин). Пока эта карта открыта и вы управляете — нагрев поддерживается.
      </p>
      {msg ? <p className="mt-2 text-sm text-zinc-600">{msg}</p> : null}
    </section>
  );
}
