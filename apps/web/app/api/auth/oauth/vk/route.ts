import { NextResponse } from "next/server";

import { buildAuthorizationUrl } from "@/lib/oauth";

export async function GET() {
  try {
    const url = await buildAuthorizationUrl("vk");
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_vk", "http://localhost:3000"));
  }
}
