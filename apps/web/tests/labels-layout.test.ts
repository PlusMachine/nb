import { describe, expect, it } from "vitest";

import { beerStyleTaglinesRu } from "@nb/brewing-core";

import { A4_SHEET, computeA4Grid, LABEL_PRESETS, mmToPx, QR_SIZE_MM_M, type LabelSlots } from "../features/labels/contracts";
import { fitTextLines, inkExtentsPx, measureTextPx } from "../features/labels/fonts";
import { buildQrSvg } from "../features/labels/qr";
import {
  renderLabelSvg,
  resolveDescriptionFixes,
  resolveDescriptionPrintState,
  resolveQrPrintState
} from "../features/labels/render";
import { HOP_MARK_D } from "../features/labels/hop-mark";
import { fitNamesToLines, joinWithOverflow } from "../features/labels/templates/blocks";

const fullSlots: LabelSlots = {
  title: "Жигулёвское юбилейное нефильтрованное",
  styleName: "Чешский премиум пейл-лагер",
  abvText: "~5.2%",
  ibu: 38,
  ebc: 12,
  ogText: "1.048",
  fgText: "1.011",
  gravityUnitText: null,
  hops: ["Saaz", "Sladek"],
  malts: ["Pilsner"],
  yeast: "Fermentis W-34/70",
  volumeText: "0,5 л",
  batchText: "3",
  authorName: "Артём",
  bottlingDateText: "11.07.2026",
  qrUrl: "https://example.com/recipes/test",
  description: null,
  showLogo: true,
  showIbuScale: true,
  brandText: "BREWED WITH NB"
};

const emptySlots: LabelSlots = {
  title: "IPA",
  styleName: null,
  abvText: null,
  ibu: null,
  ebc: null,
  ogText: null,
  fgText: null,
  gravityUnitText: null,
  hops: [],
  malts: [],
  yeast: null,
  volumeText: null,
  batchText: null,
  authorName: null,
  bottlingDateText: null,
  qrUrl: null,
  description: null,
  showLogo: true,
  showIbuScale: true,
  brandText: "BREWED WITH NB"
};

describe("раскладка A4", () => {
  it("количество наклеек на листе для каждого пресета", () => {
    // 43×25 → 4×10, 58×40 → 3×6, 75×120 → 2×2 при полях 8 мм и резе 3 мм.
    expect(computeA4Grid(LABEL_PRESETS.S)).toMatchObject({ cols: 4, rows: 10, count: 40 });
    expect(computeA4Grid(LABEL_PRESETS.M)).toMatchObject({ cols: 3, rows: 6, count: 18 });
    expect(computeA4Grid(LABEL_PRESETS.L)).toMatchObject({ cols: 2, rows: 2, count: 4 });
    expect(computeA4Grid(LABEL_PRESETS.LW)).toMatchObject({ cols: 1, rows: 3, count: 3 });
  });

  it("сетка не выходит за поля листа, между наклейками есть поле реза", () => {
    for (const preset of Object.values(LABEL_PRESETS)) {
      const grid = computeA4Grid(preset);
      for (const pos of grid.positions) {
        expect(pos.xMm).toBeGreaterThanOrEqual(A4_SHEET.marginMm - 1e-6);
        expect(pos.yMm).toBeGreaterThanOrEqual(A4_SHEET.marginMm - 1e-6);
        expect(pos.xMm + preset.widthMm).toBeLessThanOrEqual(A4_SHEET.widthMm - A4_SHEET.marginMm + 1e-6);
        expect(pos.yMm + preset.heightMm).toBeLessThanOrEqual(A4_SHEET.heightMm - A4_SHEET.marginMm + 1e-6);
      }
      const sorted = [...grid.positions].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
      const second = sorted[1];
      if (second && second.yMm === sorted[0].yMm) {
        expect(second.xMm - (sorted[0].xMm + preset.widthMm)).toBeCloseTo(A4_SHEET.gapMm, 6);
      }
    }
  });
});

describe("кириллический межстрочник заголовка", () => {
  // Строки заголовка из SVG: заголовок — единственный текст шрифтом displayBold
  // (Oswald 700), у него уникальный font-family+вес. Возвращаем базовую линию,
  // кегль и сам текст — этого хватает, чтобы посчитать реальные чернила строки.
  type TitleLine = { baseline: number; size: number; text: string };
  const titleLines = (svg: string): TitleLine[] => {
    const stackY: number[] = [0];
    const lines: TitleLine[] = [];
    // Порядок атрибутов в textEl: x, y, text-anchor, font-family, font-weight,
    // font-size, …, fill — поэтому y ловим раньше, чем font-size.
    const tokens = svg.matchAll(
      /<g transform="translate\([-\d.]+ ([-\d.]+)\)[^"]*"|<\/g>|<text[^>]*\sy="([-\d.]+)"[^>]*font-family="Oswald"[^>]*font-weight="700"[^>]*font-size="([-\d.]+)"[^>]*>([^<]*)<\/text>/g
    );
    for (const token of tokens) {
      if (token[0].startsWith("<g")) {
        stackY.push(stackY[stackY.length - 1] + Number(token[1]));
      } else if (token[0] === "</g>") {
        if (stackY.length > 1) {
          stackY.pop();
        }
      } else {
        lines.push({ baseline: stackY[stackY.length - 1] + Number(token[2]), size: Number(token[3]), text: token[4] });
      }
    }
    return lines.sort((a, b) => a.baseline - b.baseline);
  };

  // Строка с выносными («Щ», «Д») над строкой с акцентами («Ё», «Й») — худший
  // для кириллицы случай: на межстрочнике по кеглю чернила строк налезают.
  const collide: LabelSlots = { ...fullSlots, title: "Пивоварня Рощи Ёлкинъ Двор" };

  it("чернила соседних строк заголовка не пересекаются", () => {
    for (const template of ["typographic", "craft"] as const) {
      for (const preset of ["S", "M", "L", "LW"] as const) {
        const { svg } = renderLabelSvg({ template, preset, dpi: 203, slots: collide });
        const lines = titleLines(svg);
        for (let i = 1; i < lines.length; i += 1) {
          const prev = lines[i - 1];
          const next = lines[i];
          const prevBottom = prev.baseline + inkExtentsPx(prev.text, "displayBold", prev.size).below;
          const nextTop = next.baseline - inkExtentsPx(next.text, "displayBold", next.size).above;
          // Между чернилами строк должен оставаться воздух, а не наложение.
          expect(nextTop - prevBottom, `${template}/${preset}: «${prev.text}» / «${next.text}»`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("inkExtentsPx ловит акценты и выносные кириллицы", () => {
    // «Ё» поднимается над обычной прописной, «Щ» опускается ниже базовой линии.
    const plain = inkExtentsPx("НОВА", "displayBold", 100);
    const accented = inkExtentsPx("ЁЖ", "displayBold", 100);
    const descender = inkExtentsPx("ЩУ", "displayBold", 100);
    expect(accented.above).toBeGreaterThan(plain.above + 5);
    expect(descender.below).toBeGreaterThan(5);
    expect(inkExtentsPx("", "displayBold", 100)).toEqual({ above: 0, below: 0 });
  });
});

describe("tier-логика и переполнение текста", () => {
  it("длинное название уменьшается, но не превышает 2 строк", () => {
    const fitted = fitTextLines("ЖИГУЛЁВСКОЕ ЮБИЛЕЙНОЕ НЕФИЛЬТРОВАННОЕ ОСОБОЕ", {
      fontId: "displayBold",
      maxWidthPx: 300,
      maxLines: 2,
      maxSizePx: 52,
      minSizePx: 24
    });
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    expect(fitted.fontSizePx).toBeLessThan(52);
  });

  it("непомещающееся даже минимальным кеглем название обрезается с «…»", () => {
    const fitted = fitTextLines("Экстраординарное сверхдлинное название которое никуда не влезает вообще никак", {
      fontId: "displayBold",
      maxWidthPx: 120,
      maxLines: 2,
      maxSizePx: 40,
      minSizePx: 24
    });
    expect(fitted.ellipsized).toBe(true);
    expect(fitted.lines[fitted.lines.length - 1]).toContain("…");
  });

  it("пустые поля схлопываются: в SVG нет меток отсутствующих блоков", () => {
    for (const template of ["typographic", "craft"] as const) {
      for (const preset of ["S", "M", "L", "LW"] as const) {
        const { svg } = renderLabelSvg({ template, preset, dpi: 203, slots: emptySlots });
        expect(svg).not.toContain("IBU");
        expect(svg).not.toContain("ЦВЕТ");
        expect(svg).not.toContain("СОЛОД");
        expect(svg).not.toContain("РОЗЛИВ");
        expect(svg).not.toContain("—"); // никаких прочерков-заглушек
      }
    }
  });

  it("полные данные рендерят все блоки на L", () => {
    for (const template of ["typographic", "craft"] as const) {
      const { svg } = renderLabelSvg({ template, preset: "L", dpi: 203, slots: fullSlots });
      for (const marker of ["ABV", "IBU", "ЦВЕТ", "СОЛОД", "ХМЕЛЬ", "ДРОЖЖИ", "РОЗЛИВ", "BREWED WITH NB"]) {
        expect(svg, `${template}: ${marker}`).toContain(marker);
      }
    }
  });

  it("QR-гейтинг: без qrUrl в SVG нет QR-блока и подписи «рецепт»", () => {
    const withQr = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: fullSlots }).svg;
    const withoutQr = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: { ...fullSlots, qrUrl: null } }).svg;
    expect(withQr).toContain("рецепт");
    expect(withQr).toContain("crispEdges");
    expect(withoutQr).not.toContain("рецепт");
    expect(withoutQr).not.toContain("crispEdges");
  });

  it("пиксельные размеры пресетов точны под dpi", () => {
    expect(mmToPx(58, 203)).toBe(464);
    expect(mmToPx(40, 203)).toBe(320);
    const { widthPx, heightPx } = renderLabelSvg({ template: "typographic", preset: "M", dpi: 203, slots: fullSlots });
    expect(widthPx).toBe(464);
    expect(heightPx).toBe(320);
  });
});

describe("вертикальная раскладка M", () => {
  // Разреженные данные на 58×40 мм раньше липли к верхнему краю, а низ наклейки
  // оставался пустым: renderM писал блоки в поток и не центрировал колонку.
  const sparse: LabelSlots = { ...emptySlots, title: "Лагер", styleName: "Czech Pale Lager" };

  it("при разреженных данных контент центрируется, а не липнет к верху", () => {
    for (const template of ["typographic", "craft"] as const) {
      const { svg, heightPx } = renderLabelSvg({ template, preset: "M", dpi: 203, slots: sparse });
      const baselines = [...svg.matchAll(/<text[^>]*\sy="(\d+)"/g)].map((match) => Number(match[1]));
      expect(baselines.length, template).toBeGreaterThan(0);

      // Сдвиг колонки применяется одним transform поверх контента.
      const shift = Number(/<g transform="translate\(0 (\d+)\)">/.exec(svg)?.[1] ?? 0);
      const top = Math.min(...baselines) + shift;
      const bottom = Math.max(...baselines) + shift;
      // Поля сверху и снизу сопоставимы: колонка стоит по центру, а не сверху.
      expect(Math.abs(top - (heightPx - bottom)), template).toBeLessThan(heightPx * 0.2);
    }
  });

  it("полные данные на M не уезжают за нижнюю границу", () => {
    for (const template of ["typographic", "craft"] as const) {
      const { svg, heightPx } = renderLabelSvg({ template, preset: "M", dpi: 203, slots: fullSlots });
      const shift = Number(/<g transform="translate\(0 (\d+)\)">/.exec(svg)?.[1] ?? 0);
      const baselines = [...svg.matchAll(/<text[^>]*\sy="(\d+)"/g)].map((match) => Number(match[1]) + shift);
      expect(Math.max(...baselines), template).toBeLessThan(heightPx);
    }
  });
});

describe("объём тары и номер партии", () => {
  it("печатаются одной строкой, номер — с «№»", () => {
    const { svg } = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: fullSlots });
    expect(svg).toContain("0,5 Л · ПАРТИЯ №3");
  });

  it("уже введённый «№» не удваивается", () => {
    const { svg } = renderLabelSvg({
      template: "craft",
      preset: "L",
      dpi: 203,
      slots: { ...fullSlots, batchText: "№12" }
    });
    expect(svg).toContain("ПАРТИЯ №12");
    expect(svg).not.toContain("№№");
  });

  it("пустые поля схлопываются: строки нет", () => {
    const { svg } = renderLabelSvg({
      template: "typographic",
      preset: "L",
      dpi: 203,
      slots: { ...fullSlots, volumeText: null, batchText: null }
    });
    expect(svg).not.toContain("ПАРТИЯ");
  });

  it("только объём — печатается без номера партии", () => {
    const { svg } = renderLabelSvg({
      template: "typographic",
      preset: "L",
      dpi: 203,
      slots: { ...fullSlots, batchText: null }
    });
    expect(svg).toContain("0,5 Л");
    expect(svg).not.toContain("ПАРТИЯ");
  });
});

describe("QR: печатается или честно сообщаем, что не влез", () => {
  it("на 43×25 мм QR не печатается — состояние dropped", () => {
    expect(resolveQrPrintState({ template: "craft", preset: "S", dpi: 203, slots: fullSlots })).toBe("dropped");
  });

  it("на 58×40 и 75×120 QR печатается", () => {
    expect(resolveQrPrintState({ template: "craft", preset: "M", dpi: 203, slots: fullSlots })).toBe("ok");
    expect(resolveQrPrintState({ template: "craft", preset: "L", dpi: 203, slots: fullSlots })).toBe("ok");
  });

  it("без qrUrl состояние none, а не dropped", () => {
    expect(
      resolveQrPrintState({ template: "craft", preset: "M", dpi: 203, slots: { ...fullSlots, qrUrl: null } })
    ).toBe("none");
  });

  it("длинный слаг: понижение уровня коррекции спасает QR на M", () => {
    // Длинный URL поднимает версию кода; при уровне «M» модуль становится
    // мельче печатного минимума и QR молча исчезал. Фолбэк на «L» его сохраняет.
    const longUrl = `https://hmelo.ru/recipes/${"a".repeat(60)}`;
    const qr = buildQrSvg(longUrl, mmToPx(QR_SIZE_MM_M, 203));
    expect(qr).not.toBeNull();
    expect(qr?.modulePx).toBeGreaterThanOrEqual(2);
    expect(
      resolveQrPrintState({ template: "craft", preset: "M", dpi: 203, slots: { ...fullSlots, qrUrl: longUrl } })
    ).toBe("ok");
  });
});

describe("описание и переключатели блоков (75×120 мм)", () => {
  const long =
    "Классический светлый лагер: медовая корочка солода, лёгкая хмелевая горчинка и сухой финиш. Пить холодным, из бокала, в жару.";

  it("описание не выдавливает QR: при нехватке высоты режется само", () => {
    // Короткое название оставляет описанию две строки — их и печатаем, обрезав.
    const slots: LabelSlots = { ...fullSlots, title: "Жигулёвское", description: long };
    expect(resolveQrPrintState({ template: "craft", preset: "L", dpi: 203, slots })).toBe("ok");
    expect(resolveDescriptionPrintState({ template: "craft", preset: "L", dpi: 203, slots })).toBe("trimmed");
  });

  it("обрезок в одну строку не печатается вовсе", () => {
    // Длинное название занимает две строки, и описанию остаётся меньше двух:
    // одна строка, оборванная «…» посреди фразы, читается как брак печати —
    // честнее не печатать её и сказать об этом в студии.
    const slots: LabelSlots = { ...fullSlots, description: long };
    expect(resolveQrPrintState({ template: "craft", preset: "L", dpi: 203, slots })).toBe("ok");
    expect(resolveDescriptionPrintState({ template: "craft", preset: "L", dpi: 203, slots })).toBe("dropped");
    expect(renderLabelSvg({ template: "craft", preset: "L", dpi: 203, slots }).svg).not.toContain("…");
  });

  it("без эмблемы и шкалы IBU описание печатается целиком", () => {
    const slots: LabelSlots = { ...fullSlots, description: long, showLogo: false, showIbuScale: false };
    expect(resolveDescriptionPrintState({ template: "craft", preset: "L", dpi: 203, slots })).toBe("ok");
    expect(resolveQrPrintState({ template: "craft", preset: "L", dpi: 203, slots })).toBe("ok");
  });

  it("описания нет на 58×40 мм: блок туда не помещается", () => {
    const slots: LabelSlots = { ...fullSlots, description: long };
    expect(resolveDescriptionPrintState({ template: "craft", preset: "M", dpi: 203, slots })).toBe("dropped");
  });

  it("стилевые тайглайны печатаются на большой наклейке (не выбрасываются)", () => {
    // Тайглайн стиля подставляется в описание при генерации наклейки из рецепта
    // (slots.ts). На большой наклейке в обеих ориентациях он обязан помещаться
    // хотя бы частично — «dropped» означало бы, что описание молча пропало.
    const rich: LabelSlots = {
      ...fullSlots,
      title: "Образец пива",
      malts: ["Pale Ale", "Munich", "Carahell"],
      hops: ["Citra", "Mosaic", "Simcoe"]
    };
    const dropped: string[] = [];
    for (const [id, text] of Object.entries(beerStyleTaglinesRu)) {
      for (const preset of ["L", "LW"] as const) {
        for (const template of ["typographic", "craft"] as const) {
          const state = resolveDescriptionPrintState({ template, preset, dpi: 203, slots: { ...rich, description: text } });
          if (state === "dropped") {
            dropped.push(`${id} ${preset}/${template}`);
          }
        }
      }
    }
    expect(dropped).toEqual([]);
  });

  it("на «Типографском» L описание вытесняет шкалу цвета, но не наоборот", () => {
    // Обе шкалы + полный состав не оставляют места описанию. EBC есть числом в
    // панели «ЦВЕТ», поэтому при заданном описании (и полном наборе данных, где
    // без жертвы оно не влезло бы) уступает именно шкала цвета. Маркер шкалы —
    // её дизеринг-паттерн `ebc-seg`, уникальный для colorScale.
    const hasColorScale = (svg: string) => svg.includes("ebc-seg");
    const slots: LabelSlots = { ...fullSlots, description: long };
    const withDesc = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots }).svg;
    expect(resolveDescriptionPrintState({ template: "typographic", preset: "L", dpi: 203, slots })).not.toBe("dropped");
    expect(hasColorScale(withDesc)).toBe(false);

    // Без описания шкала цвета остаётся на месте.
    const noDesc = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: fullSlots }).svg;
    expect(hasColorScale(noDesc)).toBe(true);
  });

  it("showIbuScale=false убирает шкалу, showLogo=false — эмблему", () => {
    const withAll = renderLabelSvg({ template: "craft", preset: "L", dpi: 203, slots: fullSlots }).svg;
    const withoutScale = renderLabelSvg({
      template: "craft",
      preset: "L",
      dpi: 203,
      slots: { ...fullSlots, showIbuScale: false }
    }).svg;
    const withoutLogo = renderLabelSvg({
      template: "craft",
      preset: "L",
      dpi: 203,
      slots: { ...fullSlots, showLogo: false }
    }).svg;

    // Шкала — единственный блок с делениями «0…100»; эмблема — единственная, кто
    // печатает знак хмеля (его путь начинается с этой команды).
    const markMarker = HOP_MARK_D.slice(0, 24);
    expect(withAll).toContain(markMarker);
    expect(withoutScale).toContain(markMarker);
    expect(withoutLogo).not.toContain(markMarker);
    const ticks = (svg: string) => (svg.match(/>100</g) ?? []).length;
    expect(ticks(withAll)).toBeGreaterThan(0);
    expect(ticks(withoutScale)).toBe(0);
  });
});

describe("горизонтальная большая наклейка (120×75 мм)", () => {
  /**
   * Правый край и низ занятого контентом поля. Координаты в SVG живут внутри
   * вложенных `<g transform="translate(x y)">` (колонки сдвигаются каждая
   * своим сдвигом), поэтому считаем их со стеком трансформаций — иначе тест
   * «контент не уехал за рамку» проверял бы не то, что напечатается.
   */
  const contentBox = (source: string) => {
    // Внутри <defs> лежат плитки дизеринга: их координаты — в системе паттерна,
    // а не наклейки, и в габарит контента не входят.
    const svg = source.replaceAll(/<defs>.*?<\/defs>/gs, "");
    const stack: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
    let maxX = 0;
    let maxY = 0;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    const track = (x: number, y: number) => {
      const top = stack[stack.length - 1];
      maxX = Math.max(maxX, x + top.x);
      maxY = Math.max(maxY, y + top.y);
      minX = Math.min(minX, x + top.x);
      minY = Math.min(minY, y + top.y);
    };
    const tokens = svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)[^"]*"|<\/g>|<text[^>]*\sx="([-\d.]+)"[^>]*\sy="([-\d.]+)"|<rect[^>]*\sx="([-\d.]+)"\sy="([-\d.]+)"\swidth="([-\d.]+)"\sheight="([-\d.]+)"/g);
    for (const token of tokens) {
      if (token[0].startsWith("<g")) {
        const top = stack[stack.length - 1];
        stack.push({ x: top.x + Number(token[1]), y: top.y + Number(token[2]) });
      } else if (token[0] === "</g>") {
        if (stack.length > 1) {
          stack.pop();
        }
      } else if (token[0].startsWith("<text")) {
        track(Number(token[3]), Number(token[4]));
      } else {
        track(Number(token[5]), Number(token[6]));
        track(Number(token[5]) + Number(token[7]), Number(token[6]) + Number(token[8]));
      }
    }
    return { maxX, maxY, minX, minY };
  };

  const withDescription: LabelSlots = {
    ...fullSlots,
    malts: ["Pilsner", "Munich", "Carahell"],
    hops: ["Saaz", "Sladek", "Citra"],
    description: "Классический светлый лагер: медовая корочка солода и сухой финиш."
  };

  it("несёт тот же набор блоков, что и вертикальная", () => {
    for (const template of ["typographic", "craft"] as const) {
      const { svg } = renderLabelSvg({ template, preset: "LW", dpi: 203, slots: withDescription });
      for (const marker of ["ABV", "IBU", "ЦВЕТ", "СОЛОД", "ХМЕЛЬ", "ДРОЖЖИ", "РОЗЛИВ", "BREWED WITH NB", "рецепт"]) {
        expect(svg, `${template}: ${marker}`).toContain(marker);
      }
    }
  });

  it("контент не выходит за рамку наклейки", () => {
    for (const template of ["typographic", "craft"] as const) {
      for (const slots of [withDescription, emptySlots]) {
        const { svg, widthPx, heightPx } = renderLabelSvg({ template, preset: "LW", dpi: 203, slots });
        const box = contentBox(svg);
        // Рамка — самый крайний элемент: она стоит ровно в 2 мм от края.
        const inset = mmToPx(2, 203);
        expect(box.minX, template).toBeGreaterThanOrEqual(inset - 1);
        expect(box.minY, template).toBeGreaterThanOrEqual(inset - 1);
        expect(box.maxX, template).toBeLessThanOrEqual(widthPx - inset + 1);
        expect(box.maxY, template).toBeLessThanOrEqual(heightPx - inset + 1);
      }
    }
  });

  it("QR и описание печатаются", () => {
    for (const template of ["typographic", "craft"] as const) {
      expect(resolveQrPrintState({ template, preset: "LW", dpi: 203, slots: withDescription })).toBe("ok");
      expect(resolveDescriptionPrintState({ template, preset: "LW", dpi: 203, slots: withDescription })).toBe("ok");
    }
  });

  it("выключатели эмблемы и шкалы IBU работают и в горизонтальной", () => {
    const withScale = renderLabelSvg({ template: "craft", preset: "LW", dpi: 203, slots: fullSlots }).svg;
    const noScale = renderLabelSvg({
      template: "craft",
      preset: "LW",
      dpi: 203,
      slots: { ...fullSlots, showIbuScale: false, showLogo: false }
    }).svg;
    const markMarker = HOP_MARK_D.slice(0, 24);
    expect(withScale).toContain(markMarker);
    expect(noScale).not.toContain(markMarker);
    expect((withScale.match(/>100</g) ?? []).length).toBeGreaterThan(0);
    expect((noScale.match(/>100</g) ?? []).length).toBe(0);
  });
});

describe("горизонтальная 120×75: описание, подвал и ширина колонок", () => {
  // Тот самый рецепт, на котором описание не влезало: эмблема, полный набор
  // данных и пара предложений о пиве.
  const slots: LabelSlots = {
    ...fullSlots,
    title: "Каскад цветочно-ванильный",
    styleName: "Американский пейл-эль",
    malts: ["Пэйл эль"],
    hops: ["Каскад"],
    yeast: "US-05",
    description:
      "Светлый американский эль: цитрус, хвоя и косточковые фрукты от американского хмеля на аккуратной солодовой подложке. Свежесть и бодрая горчинка."
  };

  it("описание печатается целиком: подвал с QR уступает ему место, уехав в колонку данных", () => {
    for (const template of ["typographic", "craft"] as const) {
      const params = { template, preset: "LW" as const, dpi: 203 as const, slots };
      expect(resolveDescriptionPrintState(params), template).toBe("ok");
      expect(resolveQrPrintState(params), template).toBe("ok");
    }
    // QR стоит в правой половине наклейки — там, где раньше пустовала колонка
    // данных, а не под лицом, где он отнимал строки у описания.
    const { svg, widthPx } = renderLabelSvg({ template: "craft", preset: "LW", dpi: 203, slots });
    const qr = /<g transform="translate\((\d+) \d+\)"><g shape-rendering="crispEdges"/.exec(svg);
    expect(qr).not.toBeNull();
    expect(Number(qr?.[1])).toBeGreaterThan(widthPx / 2);
  });

  it("ширину у состава не отнимают: имена сортов не режутся ради описания", () => {
    // Богатый состав + длинное описание: раскладка вправе расширить лицевую
    // колонку, но не настолько, чтобы сорта ушли в «…».
    const rich: LabelSlots = {
      ...slots,
      malts: ["Pale Ale 62%", "Мюнхенский 12%", "Карамельный 60 8%"],
      hops: ["Magnum", "Chinook", "Columbus"],
      yeast: "Lallemand Windsor"
    };
    for (const template of ["typographic", "craft"] as const) {
      const { svg } = renderLabelSvg({ template, preset: "LW", dpi: 203, slots: rich });
      expect(svg, template).toContain("PALE ALE 62%");
      expect(svg, template).toContain("LALLEMAND WINDSOR");
    }
  });

  it("совет по описанию честен: предлагаем только тумблеры, которые правда дают место", () => {
    const params = { template: "craft" as const, preset: "LW" as const, dpi: 203 as const, slots };
    // Всё влезло — советовать нечего.
    expect(resolveDescriptionFixes(params)).toEqual([]);

    // Набит состав: описание урезано, и оба тумблера действительно его спасают
    // (эмблема освобождает лицевую колонку, шкала — высоту под подвал справа).
    const packed: LabelSlots = {
      ...slots,
      malts: ["Pale Ale 62%", "Мюнхенский 12%", "Карамельный 60 8%", "Шоколадный 7%", "Жжёный 5%", "Овёс 6%"],
      hops: ["Magnum", "Chinook", "Columbus", "Simcoe"],
      yeast: "Lallemand Windsor"
    };
    const packedParams = { ...params, slots: packed };
    expect(resolveDescriptionPrintState(packedParams)).toBe("trimmed");
    for (const fix of resolveDescriptionFixes(packedParams)) {
      const relaxed: LabelSlots =
        fix === "logo" ? { ...packed, showLogo: false } : { ...packed, showIbuScale: false };
      expect(resolveDescriptionPrintState({ ...params, slots: relaxed }), fix).toBe("ok");
    }
  });
});

describe("строка состава: разделители и перенос", () => {
  it("длинное слово не вылезает за ширину: строка меряется целиком", () => {
    // Слово, начавшее новую строку последним, раньше не измерялось вовсе —
    // «ЦВЕТОЧНО-ВАНИЛЬНЫЙ» печаталось поверх всей наклейки.
    const maxWidthPx = 430;
    const fitted = fitTextLines("КАСКАД ЦВЕТОЧНО-ВАНИЛЬНЫЙ", {
      fontId: "displayBold",
      maxWidthPx,
      maxLines: 2,
      maxSizePx: 64,
      minSizePx: 32
    });
    for (const line of fitted.lines) {
      expect(measureTextPx(line, "displayBold", fitted.fontSizePx)).toBeLessThanOrEqual(maxWidthPx);
    }
  });


  it("имена соединяются точками, остаток сворачивается в «+N»", () => {
    expect(joinWithOverflow(["Citra", "Mosaic", "Simcoe"], 3)).toBe("Citra • Mosaic • Simcoe");
    expect(joinWithOverflow(["Citra", "Mosaic", "Simcoe"], 2)).toBe("Citra • Mosaic +1");
  });

  it("перенос идёт по границе сорта, а не по пробелу внутри имени", () => {
    // «CARA CLAIR 7%», разорванное между строками, читается как два разных солода
    // (а «7%» в начале строки — вообще как отдельный ингредиент).
    const names = ["Pale Ale 78%", "Munich 12%", "Cara Clair 7%", "Овсяные хлопья 3%"];
    const lines = fitNamesToLines(names, {
      maxNames: 8,
      fontId: "body",
      sizePx: 28,
      // Ширина заведомо мала для одной строки — раскладка обязана перенести.
      maxWidthPx: 420,
      maxLines: 2
    });

    expect(lines.length).toBeGreaterThan(1);
    const printable = new Set(names.map((name) => name.toUpperCase()));
    for (const line of lines) {
      for (const token of line.split(" • ")) {
        // Последний токен строки может нести хвост «+N».
        const name = token.replace(/ \+\d+$/, "");
        expect(printable.has(name)).toBe(true);
      }
    }
  });
});
