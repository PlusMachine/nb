import { firstBrewGuide } from "./kak-svarit-pervoe-pivo";
import type { EditorialArticle } from "./types";

export type { EditorialArticle } from "./types";

// Реестр редакционных статей репозитория; порядок не важен, ключ — slug.
export const EDITORIAL_ARTICLES: EditorialArticle[] = [firstBrewGuide];
