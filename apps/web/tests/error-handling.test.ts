import { describe, expect, it } from "vitest";

import { toActionResult } from "@/lib/error-handling";

describe("toActionResult", () => {
  it("returns ok:true with the resolved data and optional successMessage", async () => {
    const result = await toActionResult(async () => 42, {
      fallbackMessage: "Не удалось выполнить операцию",
      successMessage: "Готово"
    });

    expect(result).toEqual({ ok: true, data: 42, message: "Готово" });
  });

  it("omits message when successMessage is not provided", async () => {
    const result = await toActionResult(async () => "value", {
      fallbackMessage: "Не удалось выполнить операцию"
    });

    expect(result).toEqual({ ok: true, data: "value", message: undefined });
  });

  it("maps a known error code (Error.message) to its configured text", async () => {
    const result = await toActionResult(
      async () => {
        throw new Error("NOT_FOUND");
      },
      {
        knownErrors: { NOT_FOUND: "Не найдено" },
        fallbackMessage: "Что-то пошло не так"
      }
    );

    expect(result).toEqual({ ok: false, message: "Не найдено", code: "NOT_FOUND" });
  });

  it("falls back to fallbackMessage for an unknown error code", async () => {
    const result = await toActionResult(
      async () => {
        throw new Error("SOME_UNMAPPED_CODE");
      },
      {
        knownErrors: { NOT_FOUND: "Не найдено" },
        fallbackMessage: "Что-то пошло не так"
      }
    );

    expect(result).toEqual({ ok: false, message: "Что-то пошло не так", code: "SOME_UNMAPPED_CODE" });
  });

  it("falls back to fallbackMessage for non-Error throws (code stays undefined)", async () => {
    const result = await toActionResult(
      async () => {
        throw "boom";
      },
      { fallbackMessage: "Что-то пошло не так" }
    );

    expect(result).toEqual({ ok: false, message: "Что-то пошло не так", code: undefined });
  });
});
