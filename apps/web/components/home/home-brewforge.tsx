import React from "react";
import Link from "next/link";
import { Cpu, ListChecks } from "lucide-react";

/**
 * Секция BrewForge на главной — единственный тёмный блок страницы («пульт»).
 * Промо нашего проекта автоматики: варочный день можно вести вручную (Помощник —
 * работает уже сейчас) или отдать контроллеру (Автомат — в разработке, «скоро»).
 * CTA ведёт на промо-страницу /brewforge, а не в онбординг устройств: контроллер
 * пока не продаётся. Статичная серверная секция; телеметрия и график — иллюстрация
 * формата данных, а не живые показания (никаких запросов к устройствам). Пульс
 * «связи» — CSS под prefers-reduced-motion.
 */

// Профиль затирания для иллюстративного графика: подъёмы и полки-паузы, выход к
// цели 67 °C. [минуты, °C]. Считается на модуле — без Date/random.
const MASH_PROFILE: Array<[number, number]> = [
  [0, 45],
  [4, 50.5],
  [6, 52],
  [10, 52],
  [14, 52.2],
  [18, 57],
  [24, 62.5],
  [30, 65.8],
  [34, 66.5],
  [38, 66.8]
];

const CHART = { w: 560, h: 150, padL: 34, padR: 14, padT: 12, padB: 22 };
const T_MIN = 0;
const T_MAX = 40;
const C_MIN = 40;
const C_MAX = 80;
const TARGET_C = 67;

const xAt = (t: number) => CHART.padL + ((t - T_MIN) / (T_MAX - T_MIN)) * (CHART.w - CHART.padL - CHART.padR);
const yAt = (c: number) => CHART.h - CHART.padB - ((c - C_MIN) / (C_MAX - C_MIN)) * (CHART.h - CHART.padB - CHART.padT);

const linePoints = MASH_PROFILE.map(([t, c]) => `${xAt(t).toFixed(1)},${yAt(c).toFixed(1)}`).join(" ");
const last = MASH_PROFILE[MASH_PROFILE.length - 1];

function MashChart() {
  return (
    <svg
      viewBox={`0 0 ${CHART.w} ${CHART.h}`}
      className="h-[150px] w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="График температуры затора: подъём с 45 до 67 °C за 38 минут"
    >
      {[50, 60, 70].map((c) => (
        <g key={c}>
          <line x1={CHART.padL} y1={yAt(c)} x2={CHART.w - CHART.padR} y2={yAt(c)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
          <text x={CHART.padL - 8} y={yAt(c) + 3.5} textAnchor="end" fontSize={10} fill="#8b8b94">{c}</text>
        </g>
      ))}
      {[0, 10, 20, 30, 40].map((t) => (
        <text key={t} x={xAt(t)} y={CHART.h - 6} textAnchor="middle" fontSize={10} fill="#8b8b94">{t}</text>
      ))}
      <line x1={CHART.padL} y1={yAt(TARGET_C)} x2={CHART.w - CHART.padR} y2={yAt(TARGET_C)} stroke="#71717a" strokeWidth={1.5} strokeDasharray="5 5" />
      <text x={CHART.w - CHART.padR} y={yAt(TARGET_C) - 6} textAnchor="end" fontSize={10.5} fill="#a1a1aa">цель 67.0</text>
      <polyline points={linePoints} fill="none" stroke="#fbbf24" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xAt(last[0])} cy={yAt(last[1])} r={4} fill="#fbbf24" stroke="#1d1d22" strokeWidth={2} />
    </svg>
  );
}

const modes = [
  {
    icon: ListChecks,
    title: "Помощник",
    soon: false,
    text: "Пошаговый план варки с таймерами на экране — отмечайте шаги по ходу дня"
  },
  {
    icon: Cpu,
    title: "Автомат",
    soon: true,
    text: "Контроллер BrewForge ведёт варку по рецепту: нагрев, паузы затирания, таймеры хмеля"
  }
];

export function HomeBrewforge() {
  return (
    <section className="grid items-center gap-8 rounded-[2rem] bg-[#141417] p-6 text-zinc-100 sm:p-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">BrewForge</p>
        <h2 className="mt-3 text-balance text-2xl font-semibold leading-tight sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Наш проект автоматики варки
        </h2>
        <div className="mt-6 flex flex-col gap-3">
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <div key={mode.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-white/10 bg-[#1d1d22]">
                  <Icon className="h-4 w-4 text-zinc-300" aria-hidden />
                </span>
                <div>
                  <div className="flex items-center gap-2 text-[15px] font-semibold">
                    {mode.title}
                    {mode.soon ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
                        скоро
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 max-w-[42ch] text-[13.5px] leading-relaxed text-zinc-400">{mode.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <Link
          href="/brewforge"
          className="mt-7 inline-flex items-center rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
        >
          Подробнее о BrewForge
        </Link>
      </div>

      <div className="rounded-[1.25rem] border border-white/10 bg-[#1d1d22] p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-zinc-400">Затирание · пауза 2 из 3</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="home-live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            связь
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          <span className="text-[44px] font-extrabold leading-none tabular-nums" style={{ fontFamily: "var(--font-display)" }}>66.8 °C</span>
          <span className="text-sm tabular-nums text-zinc-400">цель 67.0 °C · осталось 18 мин</span>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Дальше: <span className="font-semibold text-zinc-100">осахаривание 72 °C</span> → кипячение <span className="tabular-nums">60 мин</span>
        </p>
        <div className="mt-4">
          <MashChart />
        </div>
        <div className="mt-2 flex justify-between text-[11.5px] text-zinc-500">
          <span>температура затора, °C</span>
          <span>последние 40 мин</span>
        </div>
      </div>
    </section>
  );
}
