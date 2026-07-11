import type { LabelDpi, LabelSlots, LabelTemplateId, LabelTier } from "../contracts";

export type LabelRenderContext = {
  slots: LabelSlots;
  tier: LabelTier;
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
