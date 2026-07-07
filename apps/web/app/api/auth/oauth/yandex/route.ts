import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { buildAuthorizationUrl } from "@/lib/oauth";

export async function GET() {
  try {
    const url = await buildAuthorizationUrl("yandex");
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_yandex", getServerEnv().APP_URL));
  }
}
