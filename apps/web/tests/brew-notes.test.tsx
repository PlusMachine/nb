import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Экшены сохранения не участвуют в рендере — мокаем, чтобы импорт клиентского
// компонента не тянул за собой server actions (db-слой).
vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({
  updateBrewBatchNotesAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  updateBrewBatchTastingNotesAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { BrewNotes } from "../features/brew-batches/components/brew-notes";

describe("BrewNotes — заметки о варке и дегустация (A4)", () => {
  it("секция «Заметки о варке» держит якорь #brew-notes и показывает текст заметок", () => {
    const html = renderToStaticMarkup(
      <BrewNotes brewBatchId="bb-1" kind="brew" notes="Попал в OG, охлаждение затянулось" />
    );

    expect(html).toContain("Заметки о варке");
    expect(html).toContain("Попал в OG, охлаждение затянулось");
    // Якорь мобильного дока (brew-quick-dock.tsx, кнопка «Заметка») — не менять.
    expect(html).toContain('id="brew-notes"');
  });

  it("секция «Дегустация» — своё поле и свой якорь", () => {
    const html = renderToStaticMarkup(
      <BrewNotes brewBatchId="bb-1" kind="tasting" notes="Хлебный солод, мягкая горечь" />
    );

    expect(html).toContain("Дегустация");
    expect(html).toContain("Хлебный солод, мягкая горечь");
    expect(html).toContain('id="tasting-notes"');
  });

  // Корень дефекта A4: на завершённой партии заголовок секции переключался на
  // «Дегустационные заметки», хотя под ним оставалось то же поле notes — дегустация
  // затирала заметки варки. Заголовок больше не «переезжает».
  it("не переименовывает секцию заметок в дегустацию (регресс A4)", () => {
    const html = renderToStaticMarkup(
      <BrewNotes brewBatchId="bb-1" kind="brew" notes="Заметки варочного дня" />
    );

    expect(html).not.toContain("Дегустацион");
    expect(html).not.toContain('id="tasting-notes"');
  });

  it("пустое поле рендерится с плейсхолдером своей секции", () => {
    const brewHtml = renderToStaticMarkup(<BrewNotes brewBatchId="bb-1" kind="brew" notes={null} />);
    const tastingHtml = renderToStaticMarkup(<BrewNotes brewBatchId="bb-1" kind="tasting" notes={null} />);

    expect(brewHtml).toContain("Как прошла варка");
    expect(tastingHtml).toContain("Аромат, вкус, тело");
  });
});
