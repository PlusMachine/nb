"use client";

// =============================================================================
//  features/brew-controller/components/channel-badge.tsx
//  Честная индикация канала связи портала с устройством (Phase 6c): LAN — прямой
//  (низкая латентность), облако — через мост (зависит от интернета). Демо и
//  неизвестный канал не мозолят. Общий чип для sticky-хедера пульта и тела зоны A.
// =============================================================================
import { Cloud, Wifi } from "lucide-react";

import type { DeviceChannel } from "@/features/brew-controller/telemetry-source";

export function ChannelBadge({ channel }: { channel?: DeviceChannel | null }) {
  if (channel !== "lan" && channel !== "cloud") return null;
  const isCloud = channel === "cloud";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
      title={isCloud ? "Через мост (облако) — зависит от интернета" : "Прямой канал (LAN)"}
    >
      {isCloud ? <Cloud className="h-3.5 w-3.5" aria-hidden /> : <Wifi className="h-3.5 w-3.5" aria-hidden />}
      {isCloud ? "Облако" : "LAN"}
    </span>
  );
}
