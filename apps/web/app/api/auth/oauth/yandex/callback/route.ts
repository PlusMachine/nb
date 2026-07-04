import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { oauthFinalize } from "@/lib/auth";
import { consumeOAuthCallback } from "@/lib/oauth";
import { SIGNUP_CONSENT_COOKIE } from "@/lib/oauth-consent";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const consent = Boolean((await cookies()).get(SIGNUP_CONSENT_COOKIE)?.value);
    const profile = await consumeOAuthCallback("yandex", String(searchParams.get("state") ?? ""), String(searchParams.get("code") ?? ""));
    await oauthFinalize(profile, consent);
    return NextResponse.redirect(new URL("/app", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_yandex_callback", request.url));
  }
}
