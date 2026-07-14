import { NextResponse } from "next/server";

import { assertRateLimit } from "@nb/auth";

import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import {
  INGEST_BODY_MAX_BYTES,
  INGEST_IP_RATE_LIMIT,
  INGEST_IP_RATE_WINDOW_SECONDS
} from "@/features/device-streams/contracts";
import { ingestStreamPacket } from "@/features/device-streams/ingest";
import { findDeviceByToken } from "@/features/devices/service";
import { clientIpFrom } from "@/lib/anti-abuse";

// =============================================================================
//  /api/ingest/[token] — generic-приём телеметрии сторонних устройств ферментации
//  (iSpindel/GravityMon native, Brewfather custom stream, Tilt cloud logging).
//  Спека: docs/specs/third-party-fermentation-devices.md §8.1/§8.5.
//
//  Публичный эндпоинт БЕЗ сессии: устройства не умеют куки/заголовки авторизации,
//  только URL с токеном в пути. Никаких редиректов — их прошивки тоже не умеют.
//  RAPT-вебхук (`/api/ingest/rapt/[token]`) — отдельная волна M4, здесь не делаем.
// =============================================================================

export const dynamic = "force-dynamic";

/** true, если токен принадлежит существующему стрим-устройству (не BrewForge). */
const isValidStreamToken = async (token: string): Promise<boolean> => {
  const device = await findDeviceByToken(token);
  return device !== null && device.providerId === STREAM_PROVIDER_ID;
};

// GET — проверка URL из браузера на экране подключения (визард F1): без записи.
// Не раскрываем существование/тип чужого токена — валидный стрим-токен и
// отсутствующий/чужой (BrewForge) токен визуально неразличимы (200 vs 404).
// В отличие от POST, GET дёргают люди (устройства только POSTят), поэтому при
// превышении IP-потолка можно честно отдать 429 — батарею прошивок это не тронет.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const ip = clientIpFrom(request);
    if (ip) {
      try {
        await assertRateLimit(`ip:${ip}`, "stream_ingest_ip", INGEST_IP_RATE_LIMIT, INGEST_IP_RATE_WINDOW_SECONDS);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "RATE_LIMITED") {
          throw error;
        }
        return NextResponse.json({ ok: false }, { status: 429 });
      }
    }

    const ok = await isValidStreamToken(token);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    console.error("[ingest] сбой GET:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// POST — приём одного пуш-пакета.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    // Лимит тела (§8.5): сперва дешёвая проверка заявленного Content-Length —
    // избегаем чтения заведомо огромного тела в память.
    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > INGEST_BODY_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }

    const text = await request.text();
    // Content-Length мог соврать (или отсутствовать) — считаем по факту прочитанного.
    if (Buffer.byteLength(text, "utf8") > INGEST_BODY_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }

    // IP-потолок (§8.5): защита от перебора/спама чужими токенами. Превышение —
    // 200 ok:true,stored:false, НЕ 429: прошивки на 4xx/5xx уходят в агрессивные
    // ретраи и жрут батарею поплавка. null IP (нет доверенных прокси-хопов,
    // см. clientIpFrom) — пропускаем проверку, а не валим общим ключом.
    const ip = clientIpFrom(request);
    if (ip) {
      try {
        await assertRateLimit(`ip:${ip}`, "stream_ingest_ip", INGEST_IP_RATE_LIMIT, INGEST_IP_RATE_WINDOW_SECONDS);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "RATE_LIMITED") {
          throw error;
        }
        return NextResponse.json({ ok: true, stored: false });
      }
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const result = await ingestStreamPacket({ rawToken: token, body, clientIp: ip });

    switch (result.kind) {
      case "stored":
        return NextResponse.json({ ok: true });
      case "throttled":
        return NextResponse.json({ ok: true, stored: false });
      case "not_found":
        // Не 401 — не раскрываем существование/тип токена.
        return NextResponse.json({ ok: false }, { status: 404 });
      case "bad_format":
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
  } catch (error) {
    console.error("[ingest] сбой:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
