import { File as NodeFile } from "node:buffer";
import { vi } from "vitest";

// Next supplies this marker; isolated Node tests do not load it at runtime.
vi.mock("server-only", () => ({}));

if (!globalThis.File) {
  Object.defineProperty(globalThis, "File", { value: NodeFile, configurable: true });
}

import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true
  });
}
