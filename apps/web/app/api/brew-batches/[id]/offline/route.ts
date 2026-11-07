import { NextResponse } from "next/server";
import { z } from "zod";

import { offlineBrewRequestSchema } from "@/features/brew-batches/offline/model";
import { getOfflineBrewSnapshot, syncOfflineBrewOperation } from "@/features/brew-batches/offline/service";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { readLimitedText } from "@/lib/read-limited-text";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

function reply(body: object, status = 200, retryAfter?: string) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store",
    ...(retryAfter ? { "Retry-After": retryAfter } : {})
  } });
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "NOT_FOUND") return reply({ error: code }, 404);
  if (code === "RATE_LIMITED") return reply({ error: code }, 429, "60");
  if (code === "BREW_MEASUREMENT_QUOTA_REACHED") return reply({ error: code }, 422);
  if (code === "OPERATION_ID_REUSED" || code === "UNKNOWN_STEP" || code === "INVALID_STAGE") return reply({ error: code }, 422);
  return reply({ error: "UNAVAILABLE" }, 503);
}

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user || new URL(request.url).searchParams.get("owner") !== user.id) return reply({ error: "UNAUTHORIZED" }, 401);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return reply({ error: "NOT_FOUND" }, 404);
  try {
    return reply({ snapshot: await getOfflineBrewSnapshot(user.id, id.data, user.preferredGravityUnit) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const origin = request.headers.get("origin");
  const publicOrigin = new URL(getServerEnv().APP_URL).origin;
  const url = new URL(request.url);
  // Next can reconstruct request.url with its bind address instead of Host.
  // The browser's Host header identifies the origin used for this connection.
  const host = request.headers.get("host");
  const connectionOrigin = host ? `${url.protocol}//${host}` : url.origin;
  if (!origin || (origin !== connectionOrigin && origin !== publicOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ error: "FORBIDDEN" }, 403);
  }
  const user = await getSessionUser();
  if (!user) return reply({ error: "UNAUTHORIZED" }, 401);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return reply({ error: "NOT_FOUND" }, 404);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "INVALID_INPUT" }, 400);
  const body = await readLimitedText(request, 320_000);
  if (body === null) return reply({ error: "TOO_LARGE" }, 413);
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return reply({ error: "INVALID_INPUT" }, 400); }
  const parsed = offlineBrewRequestSchema.safeParse(raw);
  if (!parsed.success) return reply({ error: "INVALID_INPUT" }, 400);
  if (parsed.data.ownerId !== user.id) return reply({ error: "UNAUTHORIZED" }, 401);

  try {
    const result = await syncOfflineBrewOperation(user.id, id.data, user.preferredGravityUnit, parsed.data.operation);
    return reply(result, result.status === "conflict" ? 409 : 200);
  } catch (error) {
    return failure(error);
  }
}
