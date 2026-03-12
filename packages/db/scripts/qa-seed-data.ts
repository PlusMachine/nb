export type SeedUser = {
  email: string;
  displayName: string;
  role: "user" | "editor" | "moderator" | "admin";
};

export type SeedCatalogItem = {
  type: "fermentable" | "hop" | "yeast" | "sugar" | "adjunct" | "fining" | "misc";
  subtype?: string;
  displayName: string;
  normalizedName: string;
  aliases?: string[];
  manufacturer?: string;
  country?: string;
  defaultUnit: "g" | "ml" | "item" | "pack";
  description?: string;
  fermentableColorEbc?: number;
  fermentableExtractYieldPct?: number;
  hopAlphaAcidPct?: number;
  hopForm?: "pellet" | "whole_cone" | "lupulin" | "cryo";
  hopSeason?: string;
  yeastAttenuationPct?: number;
  yeastType?: "ale" | "lager" | "wine";
  yeastForm?: "dry" | "liquid";
  yeastMinFermentationTempC?: number;
  yeastMaxFermentationTempC?: number;
  properties?: Record<string, unknown>;
};

export const seedUsers: SeedUser[] = [
  { email: "qa.admin@localhost", displayName: "QA Admin", role: "admin" },
  { email: "qa.moderator@localhost", displayName: "QA Moderator", role: "moderator" },
  { email: "qa.editor@localhost", displayName: "QA Editor", role: "editor" },
  { email: "qa.user@localhost", displayName: "QA Brewer", role: "user" }
];

export const seedCatalogItems: SeedCatalogItem[] = [
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Pilsner Malt",
    normalizedName: "pilsner malt",
    aliases: ["pilsner", "pils", "lager malt"],
    manufacturer: "BESTMALZ",
    country: "DE",
    defaultUnit: "g",
    fermentableColorEbc: 3.5,
    fermentableExtractYieldPct: 80,
    properties: { colorEbc: 3.5, extractFgdbPct: 80 }
  },
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Pale Ale Malt",
    normalizedName: "pale ale malt",
    aliases: ["pale malt", "pale ale", "2 row"],
    manufacturer: "Crisp",
    country: "GB",
    defaultUnit: "g",
    fermentableColorEbc: 6,
    fermentableExtractYieldPct: 79,
    properties: { colorEbc: 6, extractFgdbPct: 79 }
  },
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Wheat Malt",
    normalizedName: "wheat malt",
    aliases: ["wheat", "malted wheat"],
    manufacturer: "Weyermann",
    country: "DE",
    defaultUnit: "g",
    fermentableColorEbc: 4,
    fermentableExtractYieldPct: 84,
    properties: { colorEbc: 4, extractFgdbPct: 84 }
  },
  {
    type: "fermentable",
    subtype: "specialty-malt",
    displayName: "Munich Malt",
    normalizedName: "munich malt",
    aliases: ["munich"],
    manufacturer: "Weyermann",
    country: "DE",
    defaultUnit: "g",
    fermentableColorEbc: 18,
    fermentableExtractYieldPct: 78,
    properties: { colorEbc: 18, extractFgdbPct: 78 }
  },
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Vienna Malt",
    normalizedName: "vienna malt",
    aliases: ["vienna"],
    manufacturer: "BESTMALZ",
    country: "DE",
    defaultUnit: "g",
    fermentableColorEbc: 8,
    fermentableExtractYieldPct: 80,
    properties: { colorEbc: 8, extractFgdbPct: 80 }
  },
  {
    type: "fermentable",
    subtype: "base-malt",
    displayName: "Maris Otter Pale Malt",
    normalizedName: "maris otter pale malt",
    aliases: ["maris otter", "otter malt"],
    manufacturer: "Simpsons",
    country: "GB",
    defaultUnit: "g",
    fermentableColorEbc: 6.5,
    fermentableExtractYieldPct: 82,
    properties: { colorEbc: 6.5, extractFgdbPct: 82 }
  },
  {
    type: "fermentable",
    subtype: "specialty-malt",
    displayName: "CaraMunich I",
    normalizedName: "caramunich i",
    aliases: ["cara munich 1", "caramunich 1"],
    manufacturer: "Weyermann",
    country: "DE",
    defaultUnit: "g",
    fermentableColorEbc: 90,
    fermentableExtractYieldPct: 75,
    properties: { colorEbc: 90, extractFgdbPct: 75 }
  },
  {
    type: "fermentable",
    subtype: "specialty-malt",
    displayName: "Crystal 60L",
    normalizedName: "crystal 60l",
    aliases: ["crystal 60", "caramel 60l"],
    manufacturer: "Briess",
    country: "US",
    defaultUnit: "g",
    fermentableColorEbc: 118,
    fermentableExtractYieldPct: 74,
    properties: { colorEbc: 118, extractFgdbPct: 74 }
  },
  {
    type: "fermentable",
    subtype: "roasted-malt",
    displayName: "Chocolate Malt",
    normalizedName: "chocolate malt",
    aliases: ["chocolate"],
    manufacturer: "Crisp",
    country: "GB",
    defaultUnit: "g",
    fermentableColorEbc: 800,
    fermentableExtractYieldPct: 70,
    properties: { colorEbc: 800, extractFgdbPct: 70 }
  },
  {
    type: "fermentable",
    subtype: "roasted-grain",
    displayName: "Roasted Barley",
    normalizedName: "roasted barley",
    aliases: ["roast barley"],
    manufacturer: "Simpsons",
    country: "IE",
    defaultUnit: "g",
    fermentableColorEbc: 1300,
    fermentableExtractYieldPct: 65,
    properties: { colorEbc: 1300, extractFgdbPct: 65 }
  },

  {
    type: "hop",
    displayName: "Citra",
    normalizedName: "citra",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    hopAlphaAcidPct: 12,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 12 }
  },
  {
    type: "hop",
    displayName: "Mosaic",
    normalizedName: "mosaic",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    hopAlphaAcidPct: 11.5,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 11.5 }
  },
  {
    type: "hop",
    displayName: "Saaz",
    normalizedName: "saaz",
    manufacturer: "Bohemia Hop",
    country: "CZ",
    defaultUnit: "g",
    hopAlphaAcidPct: 4,
    hopForm: "whole_cone",
    hopSeason: "2024",
    properties: { alphaAcid: 4 }
  },
  {
    type: "hop",
    displayName: "Cascade",
    normalizedName: "cascade",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    hopAlphaAcidPct: 5.5,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 5.5 }
  },
  {
    type: "hop",
    displayName: "Centennial",
    normalizedName: "centennial",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    hopAlphaAcidPct: 10,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 10 }
  },
  {
    type: "hop",
    displayName: "Simcoe",
    normalizedName: "simcoe",
    manufacturer: "Yakima Chief",
    country: "US",
    defaultUnit: "g",
    hopAlphaAcidPct: 13,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 13 }
  },
  {
    type: "hop",
    displayName: "Amarillo",
    normalizedName: "amarillo",
    manufacturer: "Virgil Gamache Farms",
    country: "US",
    defaultUnit: "g",
    hopAlphaAcidPct: 9.5,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 9.5 }
  },
  {
    type: "hop",
    displayName: "Magnum",
    normalizedName: "magnum",
    manufacturer: "Hopsteiner",
    country: "DE",
    defaultUnit: "g",
    hopAlphaAcidPct: 13.5,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 13.5 }
  },
  {
    type: "hop",
    displayName: "Hallertau Mittelfruh",
    normalizedName: "hallertau mittelfruh",
    aliases: ["mittelfruh", "hallertau"],
    manufacturer: "BarthHaas",
    country: "DE",
    defaultUnit: "g",
    hopAlphaAcidPct: 4.5,
    hopForm: "whole_cone",
    hopSeason: "2024",
    properties: { alphaAcid: 4.5 }
  },
  {
    type: "hop",
    displayName: "Nelson Sauvin",
    normalizedName: "nelson sauvin",
    manufacturer: "NZ Hops",
    country: "NZ",
    defaultUnit: "g",
    hopAlphaAcidPct: 12,
    hopForm: "pellet",
    hopSeason: "2024",
    properties: { alphaAcid: 12 }
  },

  {
    type: "yeast",
    displayName: "SafAle US-05",
    normalizedName: "safale us-05",
    aliases: ["us-05", "us05", "safale 05"],
    manufacturer: "Fermentis",
    country: "FR",
    defaultUnit: "pack",
    yeastAttenuationPct: 78,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 18,
    yeastMaxFermentationTempC: 28,
    properties: { form: "dry", styles: ["american ale", "pale ale", "ipa"] }
  },
  {
    type: "yeast",
    displayName: "Mangrove Jack's M21 Belgian Wit",
    normalizedName: "mangrove jacks m21 belgian wit",
    aliases: ["m21", "m21 belgian wit", "mangrove jacks m21"],
    manufacturer: "Mangrove Jack's",
    country: "NZ",
    defaultUnit: "pack",
    yeastAttenuationPct: 72,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 18,
    yeastMaxFermentationTempC: 25,
    properties: { form: "dry", styles: ["witbier", "belgian ale"] }
  },
  {
    type: "yeast",
    displayName: "LalBrew Voss Kveik",
    normalizedName: "lalbrew voss kveik",
    aliases: ["voss kveik", "lalbrew voss"],
    manufacturer: "Lallemand",
    country: "CA",
    defaultUnit: "pack",
    yeastAttenuationPct: 77,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 25,
    yeastMaxFermentationTempC: 40,
    properties: { form: "dry", styles: ["kveik", "farmhouse"] }
  },
  {
    type: "yeast",
    displayName: "Saflager W-34/70",
    normalizedName: "saflager w-34-70",
    aliases: ["34/70", "w34/70", "34-70"],
    manufacturer: "Fermentis",
    country: "DE",
    defaultUnit: "pack",
    yeastAttenuationPct: 83,
    yeastType: "lager",
    yeastForm: "dry",
    yeastMinFermentationTempC: 12,
    yeastMaxFermentationTempC: 15,
    properties: { form: "dry", styles: ["lager", "pilsner"] }
  },
  {
    type: "yeast",
    displayName: "LalBrew Verdant IPA",
    normalizedName: "lalbrew verdant ipa",
    aliases: ["verdant ipa", "verdant"],
    manufacturer: "Lallemand",
    country: "CA",
    defaultUnit: "pack",
    yeastAttenuationPct: 78,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 18,
    yeastMaxFermentationTempC: 23,
    properties: { form: "dry", styles: ["ipa", "hazy ipa", "pale ale"] }
  },
  {
    type: "yeast",
    displayName: "Lallemand Nottingham Ale",
    normalizedName: "lallemand nottingham ale",
    aliases: ["nottingham", "nottingham ale"],
    manufacturer: "Lallemand",
    country: "CA",
    defaultUnit: "pack",
    yeastAttenuationPct: 78,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 14,
    yeastMaxFermentationTempC: 22,
    properties: { form: "dry", styles: ["english ale", "porter", "stout"] }
  },
  {
    type: "yeast",
    displayName: "Belle Saison",
    normalizedName: "belle saison",
    aliases: ["belle saison yeast"],
    manufacturer: "Lallemand",
    country: "CA",
    defaultUnit: "pack",
    yeastAttenuationPct: 86,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 17,
    yeastMaxFermentationTempC: 28,
    properties: { form: "dry", styles: ["saison", "farmhouse"] }
  },
  {
    type: "yeast",
    displayName: "Wyeast 1056 American Ale",
    normalizedName: "wyeast 1056 american ale",
    aliases: ["1056", "american ale 1056"],
    manufacturer: "Wyeast",
    country: "US",
    defaultUnit: "pack",
    yeastAttenuationPct: 75,
    yeastType: "ale",
    yeastForm: "liquid",
    yeastMinFermentationTempC: 18,
    yeastMaxFermentationTempC: 22,
    properties: { form: "liquid", styles: ["american ale", "ipa", "amber ale"] }
  },
  {
    type: "yeast",
    displayName: "White Labs WLP001 California Ale",
    normalizedName: "white labs wlp001 california ale",
    aliases: ["wlp001", "california ale"],
    manufacturer: "White Labs",
    country: "US",
    defaultUnit: "pack",
    yeastAttenuationPct: 76,
    yeastType: "ale",
    yeastForm: "liquid",
    yeastMinFermentationTempC: 19,
    yeastMaxFermentationTempC: 21,
    properties: { form: "liquid", styles: ["american ale", "ipa", "blonde ale"] }
  },
  {
    type: "yeast",
    displayName: "SafAle K-97",
    normalizedName: "safale k-97",
    aliases: ["k97", "k-97"],
    manufacturer: "Fermentis",
    country: "FR",
    defaultUnit: "pack",
    yeastAttenuationPct: 80,
    yeastType: "ale",
    yeastForm: "dry",
    yeastMinFermentationTempC: 15,
    yeastMaxFermentationTempC: 25,
    properties: { form: "dry", styles: ["kolsch", "wheat beer", "ale"] }
  },

  {
    type: "sugar",
    displayName: "Dextrose",
    normalizedName: "dextrose",
    aliases: ["corn sugar", "glucose"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Sucrose",
    normalizedName: "sucrose",
    aliases: ["table sugar", "cane sugar"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Lactose",
    normalizedName: "lactose",
    aliases: ["milk sugar"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Maltodextrin",
    normalizedName: "maltodextrin",
    aliases: ["maltodex"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Candi Sugar Clear",
    normalizedName: "candi sugar clear",
    aliases: ["belgian candi sugar", "clear candi sugar"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Candi Syrup D-45",
    normalizedName: "candi syrup d-45",
    aliases: ["d45", "belgian candi syrup d-45"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Turbinado Sugar",
    normalizedName: "turbinado sugar",
    aliases: ["raw sugar"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Honey",
    normalizedName: "honey",
    aliases: ["wildflower honey"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Maple Syrup",
    normalizedName: "maple syrup",
    aliases: ["maple"],
    defaultUnit: "g"
  },
  {
    type: "sugar",
    displayName: "Molasses",
    normalizedName: "molasses",
    aliases: ["blackstrap molasses"],
    defaultUnit: "g"
  },

  {
    type: "adjunct",
    displayName: "Flaked Oats",
    normalizedName: "flaked oats",
    aliases: ["oats", "rolled oats"],
    defaultUnit: "g",
    properties: { usage: "body and haze" }
  },
  {
    type: "adjunct",
    displayName: "Flaked Barley",
    normalizedName: "flaked barley",
    aliases: ["barley flakes"],
    defaultUnit: "g",
    properties: { usage: "foam and body" }
  },
  {
    type: "adjunct",
    displayName: "Flaked Wheat",
    normalizedName: "flaked wheat",
    aliases: ["wheat flakes"],
    defaultUnit: "g",
    properties: { usage: "head retention" }
  },
  {
    type: "adjunct",
    displayName: "Flaked Rye",
    normalizedName: "flaked rye",
    aliases: ["rye flakes"],
    defaultUnit: "g",
    properties: { usage: "spice and body" }
  },
  {
    type: "adjunct",
    displayName: "Flaked Maize",
    normalizedName: "flaked maize",
    aliases: ["corn flakes", "maize flakes"],
    defaultUnit: "g",
    properties: { usage: "light body and crispness" }
  },
  {
    type: "adjunct",
    displayName: "Rice Hulls",
    normalizedName: "rice hulls",
    aliases: ["hulls"],
    defaultUnit: "g",
    properties: { usage: "lautering aid" }
  },
  {
    type: "adjunct",
    displayName: "Torrified Wheat",
    normalizedName: "torrified wheat",
    aliases: ["torrified"],
    defaultUnit: "g",
    properties: { usage: "foam stability" }
  },
  {
    type: "adjunct",
    displayName: "Cocoa Nibs",
    normalizedName: "cocoa nibs",
    aliases: ["cacao nibs"],
    defaultUnit: "g",
    properties: { usage: "flavor adjunct" }
  },
  {
    type: "adjunct",
    displayName: "Peanut Butter Powder",
    normalizedName: "peanut butter powder",
    aliases: ["pb powder"],
    defaultUnit: "g",
    properties: { usage: "dessert stout flavor" }
  },
  {
    type: "adjunct",
    displayName: "Coconut Flakes",
    normalizedName: "coconut flakes",
    aliases: ["toasted coconut"],
    defaultUnit: "g",
    properties: { usage: "flavor adjunct" }
  },

  {
    type: "fining",
    displayName: "Irish Moss",
    normalizedName: "irish moss",
    defaultUnit: "g",
    properties: { stage: "boil" }
  },
  {
    type: "fining",
    displayName: "Whirlfloc",
    normalizedName: "whirlfloc",
    aliases: ["whirlfloc tablet"],
    defaultUnit: "item",
    properties: { stage: "boil" }
  },
  {
    type: "fining",
    displayName: "Gelatin",
    normalizedName: "gelatin",
    aliases: ["gelatine"],
    defaultUnit: "g",
    properties: { stage: "cold-side" }
  },
  {
    type: "fining",
    displayName: "Biofine Clear",
    normalizedName: "biofine clear",
    aliases: ["biofine"],
    defaultUnit: "ml",
    properties: { stage: "cold-side" }
  },
  {
    type: "fining",
    displayName: "Isinglass",
    normalizedName: "isinglass",
    defaultUnit: "ml",
    properties: { stage: "conditioning" }
  },
  {
    type: "fining",
    displayName: "Super Moss",
    normalizedName: "super moss",
    defaultUnit: "g",
    properties: { stage: "boil" }
  },
  {
    type: "fining",
    displayName: "Kieselsol",
    normalizedName: "kieselsol",
    defaultUnit: "ml",
    properties: { stage: "conditioning" }
  },
  {
    type: "fining",
    displayName: "Chitosan",
    normalizedName: "chitosan",
    defaultUnit: "ml",
    properties: { stage: "conditioning" }
  },
  {
    type: "fining",
    displayName: "PVPP",
    normalizedName: "pvpp",
    aliases: ["polyclar"],
    defaultUnit: "g",
    properties: { stage: "cold-side" }
  },
  {
    type: "fining",
    displayName: "Sparkolloid",
    normalizedName: "sparkolloid",
    defaultUnit: "g",
    properties: { stage: "conditioning" }
  },

  {
    type: "misc",
    displayName: "Yeast Nutrient",
    normalizedName: "yeast nutrient",
    aliases: ["nutrient"],
    defaultUnit: "g",
    properties: { stage: "boil" }
  },
  {
    type: "misc",
    displayName: "Servomyces",
    normalizedName: "servomyces",
    aliases: ["servomyces capsule"],
    defaultUnit: "item",
    properties: { stage: "boil" }
  },
  {
    type: "misc",
    displayName: "Campden Tablet",
    normalizedName: "campden tablet",
    aliases: ["metabisulfite tablet"],
    defaultUnit: "item",
    properties: { stage: "water-treatment" }
  },
  {
    type: "misc",
    displayName: "Gypsum",
    normalizedName: "gypsum",
    aliases: ["calcium sulfate"],
    defaultUnit: "g",
    properties: { stage: "water-treatment" }
  },
  {
    type: "misc",
    displayName: "Calcium Chloride",
    normalizedName: "calcium chloride",
    aliases: ["cacl2"],
    defaultUnit: "g",
    properties: { stage: "water-treatment" }
  },
  {
    type: "misc",
    displayName: "Epsom Salt",
    normalizedName: "epsom salt",
    aliases: ["magnesium sulfate"],
    defaultUnit: "g",
    properties: { stage: "water-treatment" }
  },
  {
    type: "misc",
    displayName: "Lactic Acid 88%",
    normalizedName: "lactic acid 88",
    aliases: ["lactic acid"],
    defaultUnit: "ml",
    properties: { stage: "water-treatment" }
  },
  {
    type: "misc",
    displayName: "Phosphoric Acid 10%",
    normalizedName: "phosphoric acid 10",
    aliases: ["phosphoric acid"],
    defaultUnit: "ml",
    properties: { stage: "water-treatment" }
  },
  {
    type: "misc",
    displayName: "Potassium Metabisulfite",
    normalizedName: "potassium metabisulfite",
    aliases: ["k-meta"],
    defaultUnit: "g",
    properties: { stage: "packaging" }
  },
  {
    type: "misc",
    displayName: "Star San",
    normalizedName: "star san",
    aliases: ["sanitizer"],
    defaultUnit: "ml",
    properties: { stage: "sanitation" }
  }
];
