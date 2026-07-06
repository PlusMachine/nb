import React from "react";

import type { PassportStatItem } from "./bjcp-article-page";

/** Одна карточка «паспорта» стиля (НП/КП/ABV/IBU/цвет) — общая для сервера и клиента. */
export function PassportStatCard({ stat }: { stat: PassportStatItem }) {
  return (
    <div
      className={`h-full min-h-[6.5rem] overflow-hidden rounded-[1.5rem] border border-border bg-muted px-4 py-3 text-foreground ${stat.wide ? "sm:col-span-2" : ""}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
      <p
        className={`mt-2 whitespace-pre-line break-words text-foreground ${stat.isTextual
          ? "text-[13px] font-semibold leading-5 sm:text-sm"
          : "text-base font-semibold leading-tight tabular-nums sm:text-lg"
        }`}
      >
        {stat.value}
        {stat.key === "srm" && !stat.isTextual ? " SRM" : ""}
      </p>
      {stat.supportingText ? (
        <p
          className={`mt-1.5 whitespace-pre-line break-words text-[11px] font-medium text-muted-foreground ${stat.isTextual ? "" : "tabular-nums"}`}
        >
          {stat.supportingText}
        </p>
      ) : (
        <p className="mt-1.5 text-xs font-medium text-transparent">.</p>
      )}
      {stat.accent ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.16)]">
          <div
            className="h-full rounded-full"
            style={{
              backgroundImage: `linear-gradient(90deg, ${stat.accent.startHex} 0%, ${stat.accent.averageHex} 52%, ${stat.accent.endHex} 100%)`
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
