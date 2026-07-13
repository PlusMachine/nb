import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCOUNT_BLOCKED_ERROR } from "@nb/auth";

import { oauthFinalize } from "@/lib/auth";
import { consumeOAuthCallback } from "@/lib/oauth";
import { SIGNUP_CONSENT_COOKIE } from "@/lib/oauth-consent";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const consent = Boolean((await cookies()).get(SIGNUP_CONSENT_COOKIE)?.value);
    const profile = await consumeOAuthCallback("vk", String(searchParams.get("state") ?? ""), String(searchParams.get("code") ?? ""));
    await oauthFinalize(profile, consent);
    return NextResponse.redirect(new URL("/app", request.url));
  } catch (error) {
    // Блокировку показываем как блокировку: под общим «вход через VK недоступен»
    // забаненный будет думать, что сломался провайдер, и ломиться снова.
    if (error instanceof Error && error.message === ACCOUNT_BLOCKED_ERROR) {
      return NextResponse.redirect(new URL(`/login?error=${ACCOUNT_BLOCKED_ERROR}`, request.url));
    }
    return NextResponse.redirect(new URL("/login?error=oauth_vk_callback", request.url));
  }
}
