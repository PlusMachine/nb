import { NextResponse } from "next/server";
import { assertRateLimit } from "@nb/auth";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { COOKIE_CONSENT_COOKIE, parseCookieConsent } from "@/lib/consent";
import { parseActivityInput } from "@/features/product-analytics/contracts";
import { recordProductActivity } from "@/features/product-analytics/service";
import { readLimitedText } from "@/lib/read-limited-text";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Reverse proxies can leave request.url on an internal host. Accept the
  // configured public origin too, while still rejecting browser cross-site POSTs.
  const publicOrigin = new URL(getServerEnv().APP_URL).origin;
  if (!origin || (origin !== new URL(request.url).origin && origin !== publicOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (parseCookieConsent((await cookies()).get(COOKIE_CONSENT_COOKIE)?.value) !== "all") return new NextResponse(null, { status: 204 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const body = await readLimitedText(request, 512);
  if (body === null) return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  let input;
  try { input = parseActivityInput(JSON.parse(body)); } catch { input = null; }
  if (!input) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try { await assertRateLimit(`user:${user.id}`, "product_activity", 120, 60); }
  catch { return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 }); }
  try { await recordProductActivity(user.id, input); }
  catch { return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 }); }
  return new NextResponse(null, { status: 204 });
}
