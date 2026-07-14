import { NextResponse } from "next/server";

import { assertRateLimit } from "@nb/auth";

import {
  INGEST_BODY_MAX_BYTES,
  INGEST_IP_RATE_LIMIT,
  INGEST_IP_RATE_WINDOW_SECONDS
} from "@/features/device-streams/contracts";
import { findRaptIntegrationByToken } from "@/features/device-streams/integrations";
import { ingestRaptWebhook } from "@/features/device-streams/ingest-rapt";
import { clientIpFrom } from "@/lib/anti-abuse";

// =============================================================================
//  /api/ingest/rapt/[token] — вебхук RAPT Cloud (M4, §8.1/§8.4/§8.5).
//
//  Публичный эндпоинт БЕЗ сессии: вебхук шлёт облако RAPT (KegLand), токен —
//  часть пути (та же причина, что у /api/ingest/[token] — устройство/облако не
//  умеет кастомные заголовки авторизации). Auth — по токену ПОДКЛЮЧЕНИЯ
//  (user_integrations), не устройства: одно подключение кормит несколько
//  RAPT-устройств одним вебхуком (Pill + камера + BrewZilla, автообнаружение
//  по @device_id внутри ingestRaptWebhook).
// =============================================================================

export const dynamic = "force-dynamic";

// GET — проверка URL из браузера на экране подключения (F1-RAPT): без записи.
// Не раскрываем существование/владельца чужого токена — валидный и
// отсутствующий токен визуально неразличимы (200 vs 404).
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const ip = clientIpFrom(request);
    if (ip) {
      try {
        await assertRateLimit(`ip:${ip}`, "rapt_ingest_ip", INGEST_IP_RATE_LIMIT, INGEST_IP_RATE_WINDOW_SECONDS);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "RATE_LIMITED") {
          throw error;
        }
        return NextResponse.json({ ok: false }, { status: 429 });
      }
    }

    const integration = await findRaptIntegrationByToken(token);
    const ok = integration !== null;
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    console.error("[ingest/rapt] сбой GET:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// POST — приём одного пуш-пакета вебхука.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    // Лимит тела (§8.5): сперва дешёвая проверка заявленного Content-Length.
    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > INGEST_BODY_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }

    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > INGEST_BODY_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }

    // IP-потолок (§8.5): превышение — 200 ok:true,stored:false, НЕ 429 (RAPT
    // тоже может агрессивно ретраить вебхук на 4xx/5xx). null IP — пропускаем
    // проверку (нет доверенных прокси-хопов), а не валим общим ключом.
    const ip = clientIpFrom(request);
    if (ip) {
      try {
        await assertRateLimit(`ip:${ip}`, "rapt_ingest_ip", INGEST_IP_RATE_LIMIT, INGEST_IP_RATE_WINDOW_SECONDS);
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

    const result = await ingestRaptWebhook({ rawToken: token, body, clientIp: ip });

    switch (result.kind) {
      case "stored":
        return NextResponse.json({ ok: true });
      case "throttled":
        return NextResponse.json({ ok: true, stored: false });
      case "not_found":
        // Не 401 — не раскрываем существование/владельца токена.
        return NextResponse.json({ ok: false }, { status: 404 });
      case "bad_format":
        return NextResponse.json({ ok: false, error: "bad_format" }, { status: 400 });
    }
  } catch (error) {
    console.error("[ingest/rapt] сбой:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
