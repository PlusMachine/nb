import { describe, expect, it } from "vitest";

import {
  appendBatchIdParam,
  LABEL_STUDIO_FIELD_KEYS,
  parseLabelStudioQuery,
  readBatchIdParam,
  serializeLabelStudioState,
  type LabelStudioFields,
  type LabelStudioState
} from "../features/labels/label-studio-url";

const emptyFields: LabelStudioFields = LABEL_STUDIO_FIELD_KEYS.reduce((acc, key) => {
  acc[key] = "";
  return acc;
}, {} as LabelStudioFields);

const baseDefaults: LabelStudioState = {
  template: "typographic",
  preset: "M",
  layout: "single",
  dpi: 203,
  gravityUnit: "plato",
  bottlingDate: "2026-07-11",
  fields: { ...emptyFields, title: "Моё пиво" },
  withQr: true,
  withLogo: true,
  withIbuScale: true,
  recipeSlug: ""
};

describe("label studio URL round-trip", () => {
  it("serialize→parse восстанавливает изменённые поля/настройки", () => {
    const state: LabelStudioState = {
      template: "craft",
      preset: "L",
      layout: "a4",
      dpi: 300,
      gravityUnit: "sg",
      bottlingDate: "2026-08-01",
      fields: { ...emptyFields, title: "IPA Экватор", volume: "0,5 л", batch: "3", ibu: "42" },
      withQr: true,
      withLogo: true,
      withIbuScale: false,
      recipeSlug: "ekvator-ipa"
    };

    const params = serializeLabelStudioState(state, baseDefaults);
    const query = Object.fromEntries(params.entries());

    expect(query.template).toBe("craft");
    expect(query.preset).toBe("L");
    expect(query.layout).toBe("a4");
    expect(query.dpi).toBe("300");
    expect(query.bottlingDate).toBe("2026-08-01");
    expect(query.title).toBe("IPA Экватор");
    expect(query.volume).toBe("0,5 л");
    expect(query.batch).toBe("3");
    expect(query.ibu).toBe("42");
    expect(query.recipeSlug).toBe("ekvator-ipa");
    // withQr и withLogo совпадают с дефолтом (true) — писать нечего.
    expect(query.qr).toBeUndefined();
    expect(query.logo).toBeUndefined();
    expect(query.ibuScale).toBe("0");

    const restored = parseLabelStudioQuery(query, { qrAvailable: true });
    expect(restored.template).toBe("craft");
    expect(restored.preset).toBe("L");
    expect(restored.layout).toBe("a4");
    expect(restored.dpi).toBe(300);
    expect(restored.bottlingDate).toBe("2026-08-01");
    expect(restored.fields?.title).toBe("IPA Экватор");
    expect(restored.fields?.volume).toBe("0,5 л");
    expect(restored.fields?.batch).toBe("3");
    expect(restored.fields?.ibu).toBe("42");
    expect(restored.recipeSlug).toBe("ekvator-ipa");
    expect(restored.withIbuScale).toBe(false);
    expect(restored.withLogo).toBeUndefined();
  });

  it("очищенная дата розлива переживает пересылку ссылки (пустое ≠ дефолт-сегодня)", () => {
    // Пользователь стёр дату, чтобы она не печаталась. serialize пишет
    // 'bottlingDate=' (пусто ≠ дефолт-сегодня). При разборе пустое значение =
    // «дата очищена», а не «ключа нет» — иначе у получателя дата молча вернулась
    // бы к его сегодняшнему числу (studioDefaults).
    const cleared: LabelStudioState = { ...baseDefaults, bottlingDate: "" };
    const params = serializeLabelStudioState(cleared, baseDefaults);
    expect(params.get("bottlingDate")).toBe("");

    const restored = parseLabelStudioQuery({ bottlingDate: "" }, { qrAvailable: true });
    expect(restored.bottlingDate).toBe("");
  });

  it("дефолтные значения не попадают в query (чистая форма = чистый URL)", () => {
    const params = serializeLabelStudioState(baseDefaults, baseDefaults);
    expect(params.toString()).toBe("");
  });

  it("qr=0 сериализуется и восстанавливается (выключить QR можно всегда)", () => {
    const state: LabelStudioState = { ...baseDefaults, withQr: false };
    const params = serializeLabelStudioState(state, baseDefaults);
    expect(Object.fromEntries(params.entries()).qr).toBe("0");

    const restored = parseLabelStudioQuery({ qr: "0" }, { qrAvailable: true });
    expect(restored.withQr).toBe(false);
    const restoredWhenUnavailable = parseLabelStudioQuery({ qr: "0" }, { qrAvailable: false });
    expect(restoredWhenUnavailable.withQr).toBe(false);
  });

  it("служебные ключи рендера (format/preview/download/sheet) никогда не сериализуются", () => {
    const state: LabelStudioState = { ...baseDefaults, layout: "a4", preset: "L", withQr: false };
    const params = serializeLabelStudioState(state, baseDefaults);

    expect(params.has("format")).toBe(false);
    expect(params.has("preview")).toBe(false);
    expect(params.has("download")).toBe(false);
    expect(params.has("sheet")).toBe(false);
    // Режим листа страницы кодируется отдельным ключом — не "sheet".
    expect(params.get("layout")).toBe("a4");
  });

  // Аналог ловушки двойной конверсии шкал (features/calculators/definitions.ts:1113):
  // чужая ссылка с ?qr=1 не должна включать QR там, где он физически недоступен
  // (черновик рецепта, пресет S без места под QR, ручной режим без выбранного рецепта).
  it("qr=1 при недоступном QR (qrAvailable=false) не включает QR", () => {
    const restored = parseLabelStudioQuery({ qr: "1" }, { qrAvailable: false });
    expect(restored.withQr).toBeUndefined();
  });

  it("qr=1 при доступном QR (qrAvailable=true) включает QR", () => {
    const restored = parseLabelStudioQuery({ qr: "1" }, { qrAvailable: true });
    expect(restored.withQr).toBe(true);
  });

  it("batchId — контекст партии, не поле наклейки: переживает пересериализацию state", () => {
    // studio перезаписывает URL на каждую правку через serializeLabelStudioState,
    // который ничего не знает про batchId (это passthrough из label-studio.tsx,
    // не часть LabelStudioState) — appendBatchIdParam должен дописать его поверх
    // ЛЮБОГО состояния, иначе после первой же правки поля ссылка «К партии»
    // тихо превращается в «К рецепту».
    const state: LabelStudioState = { ...baseDefaults, fields: { ...emptyFields, title: "IPA Экватор" } };
    const params = appendBatchIdParam(serializeLabelStudioState(state, baseDefaults), readBatchIdParam({ batchId: "b-42" }));

    expect(params.get("batchId")).toBe("b-42");
    expect(params.get("title")).toBe("IPA Экватор");
    expect((LABEL_STUDIO_FIELD_KEYS as readonly string[]).includes("batchId")).toBe(false);
  });

  it("readBatchIdParam игнорирует отсутствующий/пустой параметр", () => {
    expect(readBatchIdParam({})).toBeNull();
    expect(readBatchIdParam({ batchId: "" })).toBeNull();
    expect(readBatchIdParam({ batchId: "  " })).toBeNull();

    const params = appendBatchIdParam(serializeLabelStudioState(baseDefaults, baseDefaults), null);
    expect(params.has("batchId")).toBe(false);
  });

  it("мусорные/неизвестные значения template/preset/dpi/layout игнорируются", () => {
    const restored = parseLabelStudioQuery(
      { template: "bogus", preset: "XL", dpi: "999", layout: "poster" },
      { qrAvailable: true }
    );
    expect(restored.template).toBeUndefined();
    expect(restored.preset).toBeUndefined();
    expect(restored.dpi).toBeUndefined();
    expect(restored.layout).toBeUndefined();
  });
});
