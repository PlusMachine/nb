import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { minify, transform } from "next/dist/build/swc";
import { expect, it } from "vitest";
import { hopMarkPath } from "../features/labels/svg";
import { HOP_MARK_D, HOP_MARK_HEIGHT, HOP_MARK_WIDTH } from "../features/labels/hop-mark";

it("preserves the hop emblem after production constant folding", async () => {
  // Read the actual source: Function.toString() inside Vitest contains Vite's
  // instrumented import names rather than the code compiled by Next.
  const module = readFileSync(new URL("../features/labels/svg.ts", import.meta.url), "utf8");
  const functionSource = module.slice(module.indexOf("const HOP_MARK_INNER_R"), module.indexOf("export const yeastIconPath")).replace("export const", "const");
  const source = `const HOP_MARK_WIDTH=${HOP_MARK_WIDTH},HOP_MARK_HEIGHT=${HOP_MARK_HEIGHT},HOP_MARK_D=${JSON.stringify(HOP_MARK_D)};${functionSource};globalThis.result=hopMarkPath();`;
  const javascript = await transform(source, { jsc: { parser: { syntax: "typescript" } } });
  const compiled = await minify(javascript.code, { compress: true, mangle: true });
  const context: { result?: string } = {};
  runInNewContext(compiled.code, context, { timeout: 1000 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">${context.result}</svg>`;
  expect(context.result).toBe(hopMarkPath());
  expect(new Resvg(svg).render().asPng().byteLength).toBeGreaterThan(100);
});
