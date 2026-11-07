import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [source, buildId] = await Promise.all([
    readFile(join(process.cwd(), "features/pwa/service-worker.js"), "utf8"),
    process.env.NODE_ENV === "production"
      ? readFile(join(process.cwd(), process.env.NEXT_DIST_DIR ?? ".next", "BUILD_ID"), "utf8").then(value => value.trim())
      : Promise.resolve("development")
  ]);
  return new Response(`self.NB_BUILD_ID = ${JSON.stringify(buildId)};\n${source}`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
