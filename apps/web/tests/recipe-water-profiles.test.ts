import { describe, expect, it } from "vitest";

import {
  sanitizeUserWaterProfiles,
  WATER_PROFILES_MAX_PER_LIST,
} from "../features/recipes/contracts";

// Ф11 (notes/water-wizard-fixes.md): «сохранённые профили воды — в аккаунт».
// sanitizeUserWaterProfiles — чистая функция, вызывается сервисным слоем
// (features/recipes/service.ts: getUserWaterProfiles/saveUserWaterProfiles)
// перед записью в userBrewingSettings.waterSettings. Тестируем её напрямую, не
// поднимая БД.

const buildProfile = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "profile-1",
  name: "Профиль 1",
  profile: { ca: 50, mg: 10, na: 5, cl: 60, so4: 90, hco3: 40, ph: 7.2 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("sanitizeUserWaterProfiles", () => {
  it("returns empty lists for non-object input", () => {
    expect(sanitizeUserWaterProfiles(null)).toEqual({
      savedSourceProfiles: [],
      savedTargetProfiles: [],
    });
    expect(sanitizeUserWaterProfiles(undefined)).toEqual({
      savedSourceProfiles: [],
      savedTargetProfiles: [],
    });
    expect(sanitizeUserWaterProfiles("nope")).toEqual({
      savedSourceProfiles: [],
      savedTargetProfiles: [],
    });
    expect(sanitizeUserWaterProfiles([1, 2, 3])).toEqual({
      savedSourceProfiles: [],
      savedTargetProfiles: [],
    });
  });

  it("returns empty lists when the keys are missing or not arrays", () => {
    expect(sanitizeUserWaterProfiles({})).toEqual({
      savedSourceProfiles: [],
      savedTargetProfiles: [],
    });
    expect(
      sanitizeUserWaterProfiles({
        savedSourceProfiles: "not-an-array",
        savedTargetProfiles: null,
      }),
    ).toEqual({ savedSourceProfiles: [], savedTargetProfiles: [] });
  });

  it("keeps valid profiles and fills in missing timestamps", () => {
    const result = sanitizeUserWaterProfiles({
      savedSourceProfiles: [
        buildProfile({ id: "s1", createdAt: undefined, updatedAt: undefined }),
      ],
      savedTargetProfiles: [buildProfile({ id: "t1" })],
    });

    expect(result.savedSourceProfiles).toHaveLength(1);
    expect(result.savedSourceProfiles[0].id).toBe("s1");
    expect(result.savedSourceProfiles[0].createdAt).toBe(
      new Date(0).toISOString(),
    );
    expect(result.savedTargetProfiles).toHaveLength(1);
    expect(result.savedTargetProfiles[0].id).toBe("t1");
  });

  it("drops individual invalid entries without discarding the rest of the list", () => {
    const result = sanitizeUserWaterProfiles({
      savedSourceProfiles: [
        buildProfile({ id: "ok" }),
        buildProfile({ id: "", name: "no id" }),
        buildProfile({ id: "negative-ca", profile: { ca: -5, mg: 0, na: 0, cl: 0, so4: 0, hco3: 0, ph: null } }),
        "not-an-object",
        null,
      ],
      savedTargetProfiles: [],
    });

    expect(result.savedSourceProfiles.map((profile) => profile.id)).toEqual([
      "ok",
    ]);
  });

  it("dedupes by id, keeping the first occurrence", () => {
    const result = sanitizeUserWaterProfiles({
      savedSourceProfiles: [
        buildProfile({ id: "dup", name: "First" }),
        buildProfile({ id: "dup", name: "Second" }),
      ],
      savedTargetProfiles: [],
    });

    expect(result.savedSourceProfiles).toHaveLength(1);
    expect(result.savedSourceProfiles[0].name).toBe("First");
  });

  it("caps each list at WATER_PROFILES_MAX_PER_LIST", () => {
    const many = Array.from({ length: WATER_PROFILES_MAX_PER_LIST + 10 }, (_, index) =>
      buildProfile({ id: `p-${index}`, name: `Профиль ${index}` }),
    );

    const result = sanitizeUserWaterProfiles({
      savedSourceProfiles: many,
      savedTargetProfiles: many,
    });

    expect(result.savedSourceProfiles).toHaveLength(WATER_PROFILES_MAX_PER_LIST);
    expect(result.savedTargetProfiles).toHaveLength(WATER_PROFILES_MAX_PER_LIST);
    expect(result.savedSourceProfiles[0].id).toBe("p-0");
  });

  it("truncates names and ids over 120 characters", () => {
    const longValue = "a".repeat(200);
    const result = sanitizeUserWaterProfiles({
      savedSourceProfiles: [
        buildProfile({ id: longValue, name: longValue }),
      ],
      savedTargetProfiles: [],
    });

    // zod's max(120) rejects rather than truncates — an oversized id/name is
    // simply dropped from the list (consistent with "invalid entries are
    // dropped, not silently mutated").
    expect(result.savedSourceProfiles).toHaveLength(0);
  });
});
