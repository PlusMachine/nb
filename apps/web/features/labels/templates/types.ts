import type { LabelDpi, LabelOrientation, LabelSlots, LabelTemplateId, LabelTier } from "../contracts";

export type LabelRenderContext = {
  slots: LabelSlots;
  tier: LabelTier;
  /** Ориентация пресета: у tier «L» она решает, одна колонка или две. */
  orientation: LabelOrientation;
  widthPx: number;
  heightPx: number;
  dpi: LabelDpi;
  /** mm → px на сетке текущего dpi (округлено до целого). */
  mm: (valueMm: number) => number;
};

export type LabelTemplate = {
  id: LabelTemplateId;
  nameRu: string;
  /** Возвращает полный самодостаточный <svg> (белый фон, чёрная графика). */
  render: (ctx: LabelRenderContext) => string;
};
