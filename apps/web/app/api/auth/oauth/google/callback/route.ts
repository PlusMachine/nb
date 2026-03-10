import { NextResponse } from "next/server";

import { oauthFinalize } from "@/lib/auth";
import { consumeOAuthCallback } from "@/lib/oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const profile = await consumeOAuthCallback("google", String(searchParams.get("state") ?? ""), String(searchParams.get("code") ?? ""));
    await oauthFinalize(profile);
    return NextResponse.redirect(new URL("/app", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_google_callback", request.url));
  }
}
