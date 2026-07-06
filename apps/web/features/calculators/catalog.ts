export type CalculatorGroup = "Измерения" | "Варка" | "Вода" | "Брожение" | "Розлив" | "Сырье";

export type CalculatorSection =
  | "Измерения и плотность"
  | "Варка и рецепт"
  | "Ингредиенты и подготовка"
  | "Розлив и карбонизация";

export type CalculatorSlug =
  | "dilution-boiloff"
  | "abv-attenuation"
  | "refractometer-correction"
  | "hydrometer-correction"
  | "ibu"
  | "priming-sugar"
  | "water-ph"
  | "yeast-starter"
  | "keg-carbonation"
  | "brewing-water-volume"
  | "beer-color"
  | "bottling"
  | "speise-krausen"
  | "hop-freshness"
  | "unit-converter";

export type CalculatorCatalogItem = {
  slug: CalculatorSlug;
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  whenToUse: string;
  section: CalculatorSection;
  groups: CalculatorGroup[];
  aliases: string[];
  stageChips: string[];
  accentClassName: string;
  href: string;
  relatedSlugs: CalculatorSlug[];
  // Ссылки за пределы /calculators — куда вести дальше по знаниевому контуру
  // (рецепты, стили, гайды). Не заполняем, если внешнего назначения нет.
  related?: { href: string; label: string }[];
  formula: string;
  assumptions: string[];
  commonMistakes: string[];
  nextSteps: string[];
  meaning: string[];
};

export const calculatorFilterChips = [
  "Все",
  "Измерения",
  "Варка",
  "Вода",
  "Брожение",
  "Розлив",
  "Сырье"
] as const;

export type CalculatorFilterChip = (typeof calculatorFilterChips)[number];

export const calculatorQuickChips: Array<{ label: string; slug: CalculatorSlug; query?: Record<string, string> }> = [
  { label: "Сколько алкоголя?", slug: "abv-attenuation" },
  { label: "Поправка рефрактометра", slug: "refractometer-correction" },
  { label: "Поправка ареометра", slug: "hydrometer-correction" },
  { label: "IBU", slug: "ibu" },
  { label: "Вода и pH", slug: "water-ph" },
  { label: "Сколько сахара на карбонизацию?", slug: "priming-sugar" },
  { label: "Давление в кеге", slug: "keg-carbonation" },
  { label: "Разбавить сусло", slug: "dilution-boiloff", query: { mode: "dilute_to_gravity" } },
  { label: "Сколько воды на варку?", slug: "brewing-water-volume" }
];

export const calculatorSections: CalculatorSection[] = [
  "Измерения и плотность",
  "Варка и рецепт",
  "Ингредиенты и подготовка",
  "Розлив и карбонизация"
];

export const popularCalculatorSlugs: CalculatorSlug[] = [
  "abv-attenuation",
  "refractometer-correction",
  "hydrometer-correction",
  "ibu",
  "water-ph",
  "keg-carbonation",
  "priming-sugar",
  "dilution-boiloff"
];

// Калькуляторы, прошедшие ревизию терминологии/UX и провалидированные вручную.
// Пометка статуса показывается ТОЛЬКО в dev (см. calculators-index и calculator-page-client),
// чтобы не забыть постепенно проверить остальные. Пополняй по мере валидации.
export const verifiedCalculatorSlugs: CalculatorSlug[] = [
  "abv-attenuation",
  "refractometer-correction",
  "hydrometer-correction",
  "unit-converter"
];

export const isCalculatorVerified = (slug: CalculatorSlug): boolean => (
  verifiedCalculatorSlugs.includes(slug)
);

const sharedAssumptions = [
  "Результат рассчитан как практическая оценка для домашней пивоварни.",
  "Проверьте единицы измерения перед переносом результата в рецепт или журнал варки."
];

export const calculators: CalculatorCatalogItem[] = [
  {
    slug: "abv-attenuation",
    title: "Крепость, сбраживание и калории",
    shortTitle: "Крепость и сбраживание",
    description: "ABV, ABW, степень сбраживания и калорийность по OG и FG.",
    intro: "Используйте после замера начальной и конечной плотности или для быстрой проверки прогноза рецепта.",
    whenToUse: "Когда есть OG и FG, нужно понять крепость, степень сбраживания и примерную калорийность порции.",
    section: "Измерения и плотность",
    groups: ["Измерения", "Брожение"],
    aliases: ["алкоголь", "abv", "abw", "attenuation", "сбраживание", "калории", "og", "fg"],
    stageChips: ["Плотность", "Брожение"],
    accentClassName: "border-l-amber-400",
    href: "/calculators/abv-attenuation",
    relatedSlugs: ["hydrometer-correction", "refractometer-correction", "priming-sugar", "keg-carbonation", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "ABV ≈ (OG − FG) × 131,25. Альтернативная формула точнее для крепкого пива — вносит поправку на плотность спирта.",
    assumptions: sharedAssumptions,
    commonMistakes: ["FG снята рефрактометром без поправки на спирт — ABV получится заниженным. Сначала пересчитайте показание в калькуляторе поправки рефрактометра."],
    nextSteps: ["Перейдите к карбонизации сахаром или давлению в кеге.", "Сохраните ссылку с OG/FG для повторной проверки партии."],
    meaning: ["ABV показывает объемную долю спирта.", "Видимое сбраживание помогает понять, насколько глубоко дрожжи переработали сусло."]
  },
  {
    slug: "refractometer-correction",
    title: "Поправка рефрактометра на спирт",
    shortTitle: "Поправка рефрактометра",
    description: "Пересчет показаний Brix до брожения и после появления спирта.",
    intro: "До брожения вносит поправку на сусло, после старта — на спирт.",
    whenToUse: "Когда замер текущей плотности сделан рефрактометром, особенно во время или после брожения.",
    section: "Измерения и плотность",
    groups: ["Измерения", "Брожение"],
    aliases: ["brix", "рефрактометр", "novotny", "terrill", "коррекция", "fg"],
    stageChips: ["Brix", "Брожение"],
    accentClassName: "border-l-sky-400",
    href: "/calculators/refractometer-correction",
    relatedSlugs: ["abv-attenuation", "hydrometer-correction", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "До брожения показание просто делится на WCF и переводится в плотность. После старта брожения спирт искажает преломление, поэтому реальную плотность оценивает эмпирическая формула (Terrill или Bonham) — по начальному и текущему показанию. WCF — индивидуальная поправка прибора; её можно измерить встроенным калибратором по суслу до брожения.",
    assumptions: [...sharedAssumptions, "WCF по умолчанию 1.04; точнее — откалибровать под свой прибор встроенным калькулятором WCF (один раз по суслу до брожения)."],
    commonMistakes: [],
    nextSteps: ["Передайте corrected SG как FG в калькулятор ABV.", "Сравните с ареометром, если партия выглядит подозрительно."],
    meaning: ["Corrected SG ближе к реальной конечной плотности.", "Оценка ABV использует исходную плотность и corrected SG."]
  },
  {
    slug: "hydrometer-correction",
    title: "Поправка ареометра по температуре",
    shortTitle: "Поправка ареометра",
    description: "Температурная поправка SG/Plato относительно калибровки прибора.",
    intro: "Ареометр калибруется на конкретную температуру, поэтому горячая или холодная проба требует поправки.",
    whenToUse: "Когда проба заметно теплее или холоднее температуры калибровки ареометра.",
    section: "Измерения и плотность",
    groups: ["Измерения"],
    aliases: ["ареометр", "hydrometer", "температура", "sg", "plato", "og", "fg"],
    stageChips: ["SG", "Температура"],
    accentClassName: "border-l-blue-400",
    href: "/calculators/hydrometer-correction",
    relatedSlugs: ["abv-attenuation", "refractometer-correction", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "Скорректированная плотность = показание × f(темп. пробы) / f(темп. калибровки) + поправка прибора.",
    assumptions: sharedAssumptions,
    commonMistakes: ["Пузырьки CO₂ в бродящем пиве налипают на ареометр и приподнимают его — пробу нужно дегазировать (размешать) перед замером.", "Температуру калибровки берут «по умолчанию» 20 °C, хотя у многих ареометров она 15,6 °C — смотрите на шкалу прибора."],
    nextSteps: ["Передайте corrected SG как OG или FG в ABV.", "Охладите пробу, если поправка становится слишком большой."],
    meaning: ["Поправка обычно небольшая, но на горячем сусле может заметно изменить OG."]
  },
  {
    slug: "dilution-boiloff",
    title: "Коррекция объема и плотности сусла",
    shortTitle: "Объем и плотность сусла",
    description: "Разбавить, уварить или добавить экстракт до нужной плотности.",
    intro: "Считает, сколько долить воды, сколько уварить или сколько добавить экстракта, чтобы попасть в плотность.",
    whenToUse: "Во время кипячения, после замера плотности до и после кипячения или при корректировке экстрактом.",
    section: "Варка и рецепт",
    groups: ["Варка", "Измерения"],
    aliases: ["разбавить", "уварить", "boiloff", "dme", "сахар", "плотность", "сусло"],
    stageChips: ["Варка", "Сусло"],
    accentClassName: "border-l-orange-400",
    href: "/calculators/dilution-boiloff",
    relatedSlugs: ["abv-attenuation", "ibu", "brewing-water-volume", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "Считаем в пунктах плотности (SG − 1) × 1000 — они пропорциональны количеству экстракта и сохраняются при разбавлении и уваривании: V₁ × П₁ = V₂ × П₂. Пример: 20 л при 1.060 (14,7 °P) → чтобы получить 1.050 (12,4 °P), доливаем 4 л воды (24 л).",
    assumptions: [...sharedAssumptions, "Добавление сухого экстракта или сахара считается по типовой экстрактивности: DME и сахар дают разный прирост плотности на килограмм."],
    commonMistakes: ["Сравнивают горячий объем с холодным без поправки на усадку при охлаждении.", "Используют показание ареометра без поправки на температуру."],
    nextSteps: ["Передайте новый объем в IBU.", "Проверьте расчет воды на следующую варку."],
    meaning: ["Если объем растет, плотность падает; если объем уходит в испарение, плотность растет."]
  },
  {
    slug: "ibu",
    title: "Горечь пива (IBU)",
    shortTitle: "Горечь (IBU)",
    description: "Расчет горечи по хмелю, времени внесения и объему.",
    intro: "Подходит для быстрой оценки горечи без полного рецепта, включая поздние внесения и вирпул.",
    whenToUse: "При проектировании хмелевого графика или пересчете AA% после хранения хмеля.",
    section: "Варка и рецепт",
    groups: ["Варка", "Сырье"],
    aliases: ["ibu", "tinseth", "rager", "хмель", "горечь", "whirlpool", "fwh", "dry hop"],
    stageChips: ["Хмель", "IBU"],
    accentClassName: "border-l-emerald-400",
    href: "/calculators/ibu",
    relatedSlugs: ["hop-freshness", "dilution-boiloff", "beer-color", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "Доступны формулы Tinseth (классическая и с вирпулом) и Rager. Усвоение = фактор плотности сусла × фактор времени кипячения; горечь от вирпула считается по температуре отстоя после кипячения.",
    assumptions: [...sharedAssumptions, "Горечь от вирпула остается приближением и зависит от температуры и времени отстоя."],
    commonMistakes: ["Вводят AA% из рецепта, а не с реальной упаковки — от урожая к урожаю он заметно отличается.", "Не снижают AA% для хмеля, который долго хранился или был вскрыт."],
    nextSteps: ["Проверьте свежесть хмеля и вернитесь с уточненным AA%.", "Сравните BU:GU с OG партии."],
    meaning: ["IBU показывает расчетную горечь, а BU:GU помогает понять баланс относительно плотности."]
  },
  {
    slug: "brewing-water-volume",
    title: "Сколько воды нужно на варку",
    shortTitle: "Вода на варку",
    description: "Общий объем, затор, промывка, объемы до и после кипячения.",
    intro: "Быстрый расчет воды по цели в ферментере, зерну, испарению и потерям оборудования.",
    whenToUse: "Перед затиранием, когда нужно понять общий объем воды и разделение на затор/промывку.",
    section: "Варка и рецепт",
    groups: ["Варка", "Вода"],
    aliases: ["вода на варку", "mash water", "sparge", "pre boil", "biab", "объем воды"],
    stageChips: ["Вода", "Варка"],
    accentClassName: "border-l-cyan-400",
    href: "/calculators/brewing-water-volume",
    relatedSlugs: ["water-ph", "dilution-boiloff", "ibu", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "Всего воды = объем до кипячения + впитывание зерном + потери в котле. Объем до кипячения = горячий объем после кипячения + испарение, а горячий объем после кипячения считается от объема в ферментер и потерь на осадок/чиллер с поправкой на усадку при охлаждении.",
    assumptions: [...sharedAssumptions, "Усадка при охлаждении по умолчанию 4%."],
    commonMistakes: ["Оставляют нулевые потери на осадок и в котле — расчет сойдется, но пива в ферментере окажется меньше.", "Путают объем в ферментер и объем после кипячения."],
    nextSteps: ["Перенесите объемы затора и промывки в калькулятор воды и pH.", "Уточните свое испарение по реальным варкам."],
    meaning: ["Расчет показывает, где теряется объем и сколько воды нужно подготовить заранее."]
  },
  {
    slug: "water-ph",
    title: "Вода и pH затора",
    shortTitle: "Вода и pH",
    description: "Ионы, соли, кислота, соотношение SO4:Cl и ориентировочный pH затора.",
    intro: "Легкий расчет профиля воды и pH затора без обязательного рецепта.",
    whenToUse: "Когда нужно быстро оценить соли, кислоту и pH затора перед варкой.",
    section: "Ингредиенты и подготовка",
    groups: ["Вода", "Варка"],
    aliases: ["вода", "ph", "mash ph", "соли", "ca", "mg", "so4", "cl", "hco3", "кислота"],
    stageChips: ["Вода", "pH"],
    accentClassName: "border-l-sky-400",
    href: "/calculators/water-ph",
    relatedSlugs: ["brewing-water-volume", "unit-converter", "beer-color"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "Щелочность (как CaCO₃) = HCO₃ × 50 / 61; итоговый профиль воды складывается из добавок солей в ppm.",
    assumptions: [...sharedAssumptions, "Расчет pH затора — ориентировочная модель, не замена pH-метру."],
    commonMistakes: ["Вводят щелочность (CaCO3) вместо гидрокарбоната HCO3.", "Не разделяют объем заторной и промывочной воды."],
    nextSteps: ["Перенесите расчетные объемы из калькулятора воды на варку.", "Проверьте цветность, если pH выглядит слишком высоким или низким."],
    meaning: ["Итоговый профиль (ppm) — вода после добавок.", "Соотношение сульфат:хлорид подсказывает баланс: больше сульфата — суше и горче, больше хлорида — плотнее и солоднее."]
  },
  {
    slug: "yeast-starter",
    title: "Засев дрожжей и стартер",
    shortTitle: "Засев дрожжей",
    description: "Норма засева, живые клетки, недобор/избыток и объем стартера.",
    intro: "Оценивает, достаточно ли дрожжей для партии и нужен ли стартер.",
    whenToUse: "Перед внесением дрожжей, особенно для лагеров, крепких элей и старых жидких дрожжей.",
    section: "Ингредиенты и подготовка",
    groups: ["Брожение"],
    aliases: ["дрожжи", "стартер", "pitch rate", "viability", "cells", "lager", "ale"],
    stageChips: ["Дрожжи", "Pitch"],
    accentClassName: "border-l-violet-400",
    href: "/calculators/yeast-starter",
    relatedSlugs: ["abv-attenuation", "unit-converter"],
    related: [{ href: "/recipes", label: "Рецепты сообщества" }],
    formula: "Нужно клеток = объем (мл) × Plato × норма засева, где эль = 0,75, лагер = 1,5, гибрид = 1,0 млн клеток/мл/°P.",
    assumptions: [...sharedAssumptions, "Жизнеспособность по дате — оценка; у разных производителей дрожжей она может отличаться."],
    commonMistakes: ["Считают один пакет достаточным для лагера на 20 л.", "Не учитывают возраст жидких дрожжей."],
    nextSteps: ["Подготовьте стартер 1.035-1.040 (8,8–10,0 °P) и охладите перед внесением.", "Если известен только SG, переведите его в Plato через конвертер единиц."],
    meaning: ["Недостаточный засев повышает риск затяжного старта и лишних эфиров.", "Избыточный засев не всегда проблема, но может сгладить профиль."]
  },
  {
    slug: "priming-sugar",
    title: "Карбонизация сахаром",
    shortTitle: "Карбонизация сахаром",
    description: "Сколько декстрозы, обычного сахара, сухого солодового экстракта или меда нужно на объем и бутылку.",
    intro: "Считает остаточный CO2 по температуре и дозу сахара на весь объем или на бутылку.",
    whenToUse: "Перед розливом в бутылки, когда известны объем пива, температура и целевой CO2.",
    section: "Розлив и карбонизация",
    groups: ["Розлив"],
    aliases: ["прайминг", "карбонизация", "сахар", "декстроза", "бутылки", "co2"],
    stageChips: ["Розлив", "CO2"],
    accentClassName: "border-l-rose-400",
    href: "/calculators/priming-sugar",
    relatedSlugs: ["bottling", "speise-krausen", "keg-carbonation", "abv-attenuation"],
    related: [{ href: "/bjcp", label: "Стили пива" }],
    formula: "Остаточный CO₂ = 3,0378 − 0,050062 × T + 0,00026555 × T², где T — температура пива в °F.",
    assumptions: [...sharedAssumptions, "Остаточный CO2 считается по температуре пива в конце брожения: CO2, вышедший из пива при этой температуре, после охлаждения обратно уже не растворяется."],
    commonMistakes: ["Вводят температуру уже охлаждённого пива — праймера выходит меньше нужного, карбонизация слабая. Нужна температура в конце брожения.", "Разливают с сахаром пиво, не добродившее до стабильной FG — перекарбонизация вплоть до взрыва бутылок."],
    nextSteps: ["Передайте объем в калькулятор «Бутылки и розлив».", "Сравните с шпайзе или кройценом, если хотите натуральную карбонизацию суслом."],
    meaning: ["Чем теплее пиво было после брожения, тем меньше остаточного CO2 и тем больше сахара нужно."]
  },
  {
    slug: "keg-carbonation",
    title: "Карбонизация в кеге",
    shortTitle: "Карбонизация в кеге",
    description: "Давление (PSI/bar/kPa) для целевого CO2 при заданной температуре.",
    intro: "Таблица температура × давление со всем ландшафтом CO2 сразу, подсветкой под стиль пива и точным обратным расчётом давления для кега или шпунта.",
    whenToUse: "Перед принудительной карбонизацией, настройкой давления подачи или шпунт-клапана.",
    section: "Розлив и карбонизация",
    groups: ["Розлив"],
    aliases: ["кег", "давление", "psi", "bar", "kpa", "co2", "spunding", "шпунтование"],
    stageChips: ["Кег", "Давление"],
    accentClassName: "border-l-lime-400",
    href: "/calculators/keg-carbonation",
    relatedSlugs: ["priming-sugar", "speise-krausen", "unit-converter", "abv-attenuation"],
    related: [{ href: "/bjcp", label: "Стили пива" }],
    formula: "Давление CO₂ по полиному от температуры пива (°F) и целевого уровня карбонизации.",
    assumptions: [...sharedAssumptions, "Давление подачи зависит еще и от длины и диаметра пивной линии и высоты подъема."],
    commonMistakes: ["Ставят одно и то же давление для карбонизации и подачи, не балансируя линию розлива."],
    nextSteps: ["Переведите давление в нужные единицы.", "Сравните с сахарной карбонизацией для бутылочной партии."],
    meaning: ["Чем холоднее пиво, тем меньше давление нужно для того же CO2."]
  },
  {
    slug: "bottling",
    title: "Бутылки и объем розлива",
    shortTitle: "Бутылки и розлив",
    description: "Сколько бутылок нужно, остаток объема и сахар на бутылку.",
    intro: "Помогает подготовить тару и оценить остатки после потерь при розливе.",
    whenToUse: "Перед розливом, когда нужно понять количество бутылок одного или смешанного размера.",
    section: "Розлив и карбонизация",
    groups: ["Розлив"],
    aliases: ["бутылки", "розлив", "bottling", "0.5", "тара", "packaging loss"],
    stageChips: ["Розлив", "Тара"],
    accentClassName: "border-l-fuchsia-400",
    href: "/calculators/bottling",
    relatedSlugs: ["priming-sugar", "speise-krausen", "unit-converter"],
    formula: "Бутылок = целое от ((объем пива − потери при розливе) / объем бутылки).",
    assumptions: sharedAssumptions,
    commonMistakes: [],
    nextSteps: ["Вернитесь в карбонизацию сахаром, если поменялся объем розлива.", "Подготовьте несколько запасных бутылок меньшего размера."],
    meaning: ["Остаток — сколько пива не влезет в целые бутылки выбранного размера."]
  },
  {
    slug: "speise-krausen",
    title: "Карбонизация суслом (шпайзе, кройцен)",
    shortTitle: "Шпайзе и кройцен",
    description: "Объем сусла или кройцена для натуральной карбонизации.",
    intro: "Альтернатива карбонизации сахаром, когда газируют суслом или активно бродящим пивом.",
    whenToUse: "Перед розливом, если газируете шпайзе, кройценом или гайлом вместо сахара.",
    section: "Розлив и карбонизация",
    groups: ["Розлив", "Брожение"],
    aliases: ["шпайзе", "speise", "krausen", "кройцен", "gyle", "карбонизация"],
    stageChips: ["Розлив", "Натуральная CO2"],
    accentClassName: "border-l-amber-400",
    href: "/calculators/speise-krausen",
    relatedSlugs: ["priming-sugar", "bottling", "keg-carbonation", "unit-converter"],
    related: [{ href: "/bjcp", label: "Стили пива" }],
    formula: "Нужный CO₂ переводим в массу: 1 об. CO₂ = 1,96 г/л. Килограмм сброженного экстракта дает ~463 г CO₂; реально сбраживается ~63% экстракта шпайзе (у кройцена меньше — часть уже выброжена). Отсюда объем шпайзе по его плотности.",
    assumptions: [...sharedAssumptions, "Расчет приблизительный: фактическая сбраживаемость шпайзе и кройцена отличается от расчетной."],
    commonMistakes: ["Хранят шпайзе нестерильно — это несброженное сусло, его нужно заморозить или пастеризовать, иначе можно заразить всю партию.", "Плотность шпайзе берут «по рецепту», а не замером — доза зависит от нее напрямую."],
    nextSteps: ["Проверьте количество бутылок.", "Сравните дозировку с карбонизацией сахаром."],
    meaning: ["Результат показывает объем сусла, который должен дать недостающий CO2."]
  },
  {
    slug: "beer-color",
    title: "Цвет пива: SRM / EBC / Lovibond",
    shortTitle: "Цвет пива (SRM / EBC)",
    description: "Расчет цветности по засыпи и объему партии.",
    intro: "Быстрая оценка цвета по объему партии и списку солодов и экстрактов.",
    whenToUse: "При наброске засыпи или проверке цвета без открытия полного рецепта.",
    section: "Варка и рецепт",
    groups: ["Сырье", "Варка"],
    aliases: ["цвет", "srm", "ebc", "lovibond", "morey", "mcu", "солод"],
    stageChips: ["Солод", "Цвет"],
    accentClassName: "border-l-yellow-500",
    href: "/calculators/beer-color",
    relatedSlugs: ["ibu", "water-ph", "unit-converter"],
    related: [{ href: "/bjcp", label: "Стили пива" }],
    formula: "MCU = сумма(вес в фунтах × цвет в Lovibond) / объем в галлонах; SRM = 1,4922 × MCU^0,6859; EBC = SRM × 1,97.",
    assumptions: sharedAssumptions,
    commonMistakes: ["Вводят цвет солода не в той шкале: у поставщиков встречается и EBC, и Lovibond, а разница между ними — почти в два раза."],
    nextSteps: ["Сравните с калькулятором воды и pH затора.", "Сопоставьте цвет и IBU для баланса рецепта."],
    meaning: ["SRM/EBC дают числовую оценку цвета, но реальный оттенок зависит от мутности и стекла."]
  },
  {
    slug: "hop-freshness",
    title: "Свежесть хмеля и потеря альфа-кислот",
    shortTitle: "Свежесть хмеля",
    description: "Оценка текущей альфа-кислоты, коэффициента свежести и новой навески.",
    intro: "Помогает не завысить расчет IBU старым или вскрытым хмелем.",
    whenToUse: "Перед внесением старого хмеля или пересчетом рецепта под другую упаковку.",
    section: "Ингредиенты и подготовка",
    groups: ["Сырье"],
    aliases: ["хмель", "aa", "alpha", "свежесть", "hsi", "storage", "потеря альфа"],
    stageChips: ["Хмель", "AA%"],
    accentClassName: "border-l-green-500",
    href: "/calculators/hop-freshness",
    relatedSlugs: ["ibu", "unit-converter"],
    formula: "Потеря альфа-кислот моделируется по индексу HSI, возрасту, температуре хранения, типу упаковки и форме хмеля.",
    assumptions: [...sharedAssumptions, "Модель свежести приблизительная и не заменяет лабораторный анализ AA%."],
    commonMistakes: ["Возраст хмеля считают от даты покупки, а не от урожая — AA% на упаковке измерен при сборе, и деградация идет с того момента."],
    nextSteps: ["Передайте расчетный AA% в IBU."],
    meaning: ["Коэффициент свежести 0.80 — от исходной альфа-кислоты осталось ~80%."]
  },
  {
    slug: "unit-converter",
    title: "Конвертер единиц пивовара",
    shortTitle: "Конвертер единиц",
    description: "Плотность, цвет, объем, вес, температура, давление и концентрации.",
    intro: "Введите значение в любой единице — остальные пересчитаются автоматически.",
    whenToUse: "Когда нужно быстро перевести SG/Plato, PSI/bar, литры/галлоны или SRM/EBC.",
    section: "Измерения и плотность",
    groups: ["Измерения", "Сырье", "Вода", "Розлив"],
    aliases: ["конвертер", "unit", "sg", "plato", "brix", "srm", "ebc", "psi", "bar", "литры", "галлоны"],
    stageChips: ["Единицы", "Перевод"],
    accentClassName: "border-l-zinc-400",
    href: "/calculators/unit-converter",
    relatedSlugs: ["abv-attenuation", "ibu", "water-ph", "keg-carbonation"],
    formula: [
      "Плотность: SG↔Plato↔Brix — по эмпирическому полиному, не линейно.",
      "Цвет: EBC = SRM × 1,97; Lovibond = (SRM + 0,76) / 1,3546.",
      "Объём: мл, л, унции, кварты, галлоны (US) — линейные коэффициенты.",
      "Вес: граммы, килограммы, унции, фунты — линейные коэффициенты.",
      "Температура: °F = °C × 9/5 + 32; K = °C + 273,15.",
      "Давление: PSI, bar, kPa — линейные коэффициенты.",
      "Концентрация: ppm численно равен мг/л; г/л отличается в 1000 раз."
    ].join("\n"),
    assumptions: sharedAssumptions,
    commonMistakes: ["Путают US gallons и imperial gallons.", "Используют Brix после брожения без коррекции."],
    nextSteps: ["Скопируйте нужную единицу в связанный калькулятор.", "Для Brix после брожения используйте калькулятор поправки рефрактометра."],
    meaning: ["Конвертер нормализует частые пивоваренные единицы в одном месте."]
  }
];

export const calculatorBySlug = Object.fromEntries(
  calculators.map((calculator) => [calculator.slug, calculator])
) as Record<CalculatorSlug, CalculatorCatalogItem>;

export const getCalculatorBySlug = (slug: string): CalculatorCatalogItem | null => (
  slug in calculatorBySlug ? calculatorBySlug[slug as CalculatorSlug] : null
);

export const buildCalculatorHref = (slug: CalculatorSlug, query?: Record<string, string | number | null | undefined>) => {
  const base = `/calculators/${slug}`;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized ? `${base}?${serialized}` : base;
};
