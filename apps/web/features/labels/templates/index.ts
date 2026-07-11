import type { LabelTemplateId } from "../contracts";

import { craftTemplate } from "./craft";
import { typographicTemplate } from "./typographic";
import type { LabelTemplate } from "./types";

export const LABEL_TEMPLATES: Record<LabelTemplateId, LabelTemplate> = {
  typographic: typographicTemplate,
  craft: craftTemplate
};

export const getLabelTemplate = (id: LabelTemplateId): LabelTemplate => LABEL_TEMPLATES[id];

export type { LabelRenderContext, LabelTemplate } from "./types";
