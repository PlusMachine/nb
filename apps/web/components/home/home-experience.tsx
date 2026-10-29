"use client";

import { useMemo, useRef, useState, useId, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, FlaskConical, Expand, NotebookPen } from "lucide-react";
import type { PublicRecipeDetailDto, PublicRecipeListItem } from "@/features/recipes/contracts";
import { scaleRecipeDetailForBrew, scaleRecipeToVolume, scaleRecipeWaterPlan, type ScaledRecipeView } from "@/features/recipes/scale";
import { createHomeDemoStock, homeCoverage, homeLoginHref, homeNumber, homeQuantity, homeRequirements, homeStockPreview, type HomeStock } from "@/features/home/landing-model";
import { HomeIngredientDetails } from "./home-ingredient-details";
import { HomeBrewPreview } from "./home-brew-preview";
import { recipeIngredientCategoryOf, recipeIngredientTimeMinutes, recipeIngredientDurationDays, recipeIngredientUseType } from "@/features/recipes/ingredient-presentation";
import { hopUseTypeLabels } from "@/features/recipes/ingredient-labels";
import { pluralize } from "@/lib/pluralize";
import { formatGravity } from "@/features/system/gravity-units";
export type HomeRecipePreview = {
  recipe: PublicRecipeDetailDto;
  card: PublicRecipeListItem;
  ranges: Partial<Record<"og" | "abv" | "ibu" | "ebc", [number, number]>>;
};
const tabs = [["composition", "Состав и расчёты"], ["water", "Вода"], ["process", "Затирание и брожение"], ["equipment", "Оборудование"]];
const metricValue = (value: number | null | undefined, unit = "", digits = 1) => value == null ? "—" : `${homeNumber(value, digits)}${unit}`;
export function HomeExperience({
  previews
}: {
  previews: HomeRecipePreview[];
}) {
  const first = previews[0];
  const [stock, setStock] = useState<HomeStock[]>(() => createHomeDemoStock(previews.map(item => item.recipe)));
  const [stockExpanded, setStockExpanded] = useState(false);
  const [selected, setSelected] = useState(first?.recipe.id ?? "");
  const [volumeFactor, setVolumeFactor] = useState(1);
  const [tab, setTab] = useState("composition");
  const preview = previews.find(item => item.recipe.id === selected) ?? first;
  const recipe = preview?.recipe;
  const scaled = useMemo(() => recipe ? scaleRecipeToVolume(recipe, Number(recipe.batchSizeNormalizedQuantity) * (recipe.batchSizeNormalizedUnit === "ml" ? .001 : 1) * volumeFactor) : null, [recipe, volumeFactor]);
  const brewRecipe = useMemo(() => recipe && scaled ? scaleRecipeDetailForBrew(recipe, { targetLitres: scaled.targetBatchLitres }) : null, [recipe, scaled]);
  const stockPreview = homeStockPreview(stock);
  const visibleStock = stockExpanded ? stock : stockPreview;
  const stockHref = homeLoginHref("/app/ingredients?add=1");
  return <>
    <section className="home-hero" id="home-top">
      <div className="home-hero-copy"><p className="home-free">Бесплатный сервис для домашних пивоваров</p><h1>Что сварить из ваших запасов</h1><p className="home-lead">Выберите рецепт, пересчитайте его под свой объём и узнайте, что нужно докупить.</p><div className="home-actions"><Link className="home-button home-primary" href={stockHref}>Добавить свои запасы <ArrowRight /></Link><Link className="home-button" href="/recipes">Выбрать рецепт</Link></div><p className="home-hero-note">Рецепты, расчёты и журнал ваших варок.</p></div>
      <div className="home-stock" id="home-stock"><div className="home-stock-title"><h2>Ваши запасы</h2><span>Пример склада</span></div>
        {stock.length > 0 && <p className="home-stock-hint">Измените количество — рецепты ниже пересчитаются.</p>}
        <div className="home-stock-list" id="home-stock-example">{visibleStock.map(item => <div className="home-stock-row home-stock-example-row" key={item.key}><HomeIngredientDetails ingredient={item.ingredient} name={item.name} badgeLimit={1} /><StockQuantity item={item} onCommit={quantity => setStock(values => values.map(row => row.key === item.key ? {
              ...row,
              quantity
            } : row))} /></div>)}</div>
        {!visibleStock.length && <div className="home-empty"><p>Добавьте ингредиенты, чтобы сравнивать запасы с рецептами.</p><Link href={stockHref}>Добавить запасы</Link></div>}
        {stock.length > stockPreview.length && <button type="button" className="home-stock-more" aria-expanded={stockExpanded} aria-controls="home-stock-example" onClick={() => setStockExpanded(value => !value)}>{stockExpanded ? "Свернуть список" : `Ещё ${stock.length - stockPreview.length} ${pluralize(stock.length - stockPreview.length, ["ингредиент", "ингредиента", "ингредиентов"])}`}</button>}
      </div>
    </section>
    <section id="home-recipes"><div className="home-section-heading"><div><h2>Что можно сварить</h2>{previews.length > 0 && <p className="home-section-lead home-example-caption">Рецепты по запасам из примера</p>}</div><Link href="/recipes">Все рецепты ↗</Link></div>
      {previews.length ? <div className="home-recipe-grid">{previews.map(({
          recipe: item,
          card
        }) => {
          const requirements = homeRequirements(item);
          const match = homeCoverage(requirements, stock);
          const image = card.heroImage?.thumbUrl || card.styleImageUrl;
          return <article key={item.id} className="home-recipe-card"><Link href={`/recipes/${item.slug}`} className="home-recipe-photo" aria-label={`Рецепт: ${item.title}`}>{image ? <img src={image} alt={card.heroImage ? item.title : `Стиль: ${card.style?.name ?? "пиво"}`} loading="lazy" /> : <div className="home-photo-placeholder"><FlaskConical /></div>}</Link><div className="home-recipe-body"><h3><Link href={`/recipes/${item.slug}`}>{item.title}</Link></h3><ul className="home-recipe-values"><li>{metricValue(card.batchSizeL, " л")}</li><li>{metricValue(item.abv, "% об.")}</li><li>{metricValue(item.ibu, " IBU", 0)}</li></ul>
          <div className="home-recipe-stock home-recipe-availability" aria-live="polite"><p className="home-availability-title" data-missing={match.missing.length > 0}>{!requirements.length ? "Ингредиенты не указаны" : match.missing.length ? match.missing.length === 1 ? "Не хватает одного ингредиента" : `Не хватает ${match.missing.length} ингредиентов` : <><Check aria-hidden />{card.batchSizeL != null ? `Хватает на ${homeNumber(card.batchSizeL)} л` : "Все ингредиенты есть"}</>}</p><div className="home-recipe-ingredient-list">
            {!match.missing.length && requirements.length > 0 && <p className="home-recipe-composition-label">В составе</p>}
            {(match.missing.length ? match.missing.slice(0, 2) : ["fermentable", "hop", "yeast"].flatMap(category => {
              const line = requirements.find(line => line.category === category || category === "fermentable" && line.category === "malt");
              return line ? [line] : [];
            }).slice(0, 2)).map(line => <div className="home-recipe-ingredient" key={line.key}>
              <HomeIngredientDetails ingredient={line.ingredient} name={line.name} badgeLimit={0} compact />
              <strong className="home-ingredient-amount">{homeQuantity(line.quantity, line.unit)}</strong>
            </div>)}
            {match.missing.length > 2 && <span>Ещё {match.missing.length - 2} поз.</span>}
          </div>{match.missing.length > 0 && <Link className="home-shopping-link" href={homeLoginHref("/app/shopping")}>В список покупок <ArrowRight aria-hidden /></Link>}</div>
          <Link className="home-text-action" href={`/recipes/${item.slug}`}>Открыть рецепт <ArrowRight /></Link></div></article>;
        })}</div> : <div className="home-empty"><p>Рецепты сообщества пока не опубликованы.</p><Link href={homeLoginHref("/app/recipes/new")}>Создать свой рецепт <ArrowRight /></Link></div>}
    </section>
    <section id="home-master"><div className="home-section-heading"><div><h2>Редактор рецептов</h2><p className="home-section-lead">Измените объём — состав пересчитается, а пример варки ниже обновится.</p></div><Link href={homeLoginHref("/app/recipes/new")}>Создать рецепт ↗</Link></div>
      {recipe && scaled && preview ? <div className="home-master"><div className="home-master-title"><select aria-label="Пример рецепта" value={selected} onChange={event => {
            setSelected(event.target.value);
            setVolumeFactor(1);
          }}>{previews.map(item => <option key={item.recipe.id} value={item.recipe.id}>{item.recipe.title}</option>)}</select><label>Объём партии<select aria-label="Объём партии" value={volumeFactor} onChange={event => setVolumeFactor(Number(event.target.value))}>{[1, .5, 2].map(factor => <option key={factor} value={factor}>{homeNumber(scaled.baseBatchLitres * factor)} л</option>)}</select></label></div>
        <div className="home-master-tabs" role="tablist" aria-label="Разделы редактора">{tabs.map(([key, label]) => <button type="button" id={`home-tab-${key}`} key={key} role="tab" aria-controls={`home-panel-${key}`} aria-selected={tab === key} onClick={() => setTab(key!)}>{label}</button>)}</div>
        <div className="home-master-panels">
          <div role="tabpanel" id="home-panel-composition" aria-labelledby="home-tab-composition" hidden={tab !== "composition"}><div className="home-two-columns home-composition-columns"><div><h3>Ингредиенты</h3><HomeRecipeComposition key={recipe.id} recipe={recipe} scaled={scaled} /></div><div className="home-style-comparison"><h3>Сравнение со стилем</h3>{preview.card.style ? <Link href={preview.card.styleHref || "/bjcp"}>{preview.card.style.name} · BJCP {preview.card.style.code}</Link> : <span>Стиль не указан</span>}
            {([["og", "Начальная плотность", recipe.og, formatGravity(recipe.og, "plato").replace(".", ",")], ["abv", "Крепость", recipe.abv, metricValue(recipe.abv, "%")], ["ibu", "Горечь", recipe.ibu, metricValue(recipe.ibu, " IBU", 0)], ["ebc", "Цвет", preview.card.colorEbc, metricValue(preview.card.colorEbc, " EBC", 0)]] as const).map(([key, title, value, text]) => <StyleMetric key={key} title={title} value={value} text={text} range={preview.ranges[key]} />)}
          </div></div></div>
          <div role="tabpanel" id="home-panel-water" aria-labelledby="home-tab-water" hidden={tab !== "water"}><WaterPanel recipe={recipe} factor={scaled.factor} /></div>
          <div role="tabpanel" id="home-panel-process" aria-labelledby="home-tab-process" hidden={tab !== "process"}><div className="home-two-columns"><div><h3>Затирание</h3>{recipe.processMeta.mashProfile.steps.length ? <ol className="home-process-steps">{recipe.processMeta.mashProfile.steps.map(step => <li key={step.id}><span>{step.name}</span><strong>{homeNumber(step.temperatureC)} °C<small>{homeNumber(step.durationMinutes)} мин</small></strong></li>)}</ol> : <p className="home-panel-empty">Паузы затирания в этом рецепте не заданы.</p>}<dl className="home-facts"><div><dt>Кипячение</dt><dd>{homeNumber(recipe.boilTimeMinutes)} мин</dd></div></dl></div><div><h3>Брожение</h3><dl className="home-facts"><div><dt>Температура брожения</dt><dd>{metricValue(recipe.processMeta.fermentationProfile.primaryTemperatureC, " °C")}</dd></div><div><dt>Длительность</dt><dd>{metricValue(recipe.processMeta.fermentationProfile.primaryDurationDays, " дн.")}</dd></div>{recipe.processMeta.fermentationProfile.coldCrash.enabled && <div><dt>Колд-краш</dt><dd>{metricValue(recipe.processMeta.fermentationProfile.coldCrash.temperatureC, " °C")} · {metricValue(recipe.processMeta.fermentationProfile.coldCrash.durationDays, " дн.")}</dd></div>}</dl></div></div></div>
          <div role="tabpanel" id="home-panel-equipment" aria-labelledby="home-tab-equipment" hidden={tab !== "equipment"}><EquipmentPanel recipe={recipe} /></div>
        </div><div className="home-editor-footer"><span>Импорт из Brewfather и BeerXML</span><a href="#home-brew">Перейти к примеру варки ↓</a></div>
      </div> : <div className="home-empty"><p>Создайте рецепт, задайте объём и подберите ингредиенты.</p><Link className="home-button" href={homeLoginHref("/app/recipes/new")}>Открыть редактор <ArrowRight /></Link></div>}
    </section>
    {brewRecipe && <HomeBrewPreview key={brewRecipe.id} recipe={brewRecipe} />}
  </>;
}
function HomeRecipeComposition({ recipe, scaled }: { recipe: PublicRecipeDetailDto; scaled: ScaledRecipeView }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const previewIds = new Set<string>();
  for (const category of ["fermentable", "fermentable", "hop", "yeast"]) {
    const ingredient = recipe.ingredients.find(line => recipeIngredientCategoryOf(line) === category && !previewIds.has(line.id));
    if (ingredient) previewIds.add(ingredient.id);
  }
  for (const ingredient of recipe.ingredients) {
    if (previewIds.size >= 4) break;
    previewIds.add(ingredient.id);
  }
  const totalGrams = recipe.ingredients.reduce((total, line) => total + (recipeIngredientCategoryOf(line) === "fermentable" && line.amountNormalizedUnit === "g" ? line.amountNormalizedQuantity : 0), 0);
  const visible = recipe.ingredients.filter(line => expanded || previewIds.has(line.id));
  return <div className="home-composition">
      <ul id={id} className="home-composition-list">{visible.map(ingredient => {
        const category = recipeIngredientCategoryOf(ingredient);
        const line = scaled.ingredients.find(line => line.id === ingredient.id)!;
        const minutes = recipeIngredientTimeMinutes(ingredient);
        const days = recipeIngredientDurationDays(ingredient);
        const use = category === "hop" ? recipeIngredientUseType(ingredient) : null;
        const stage = use && Object.hasOwn(hopUseTypeLabels, use)
          ? hopUseTypeLabels[use as keyof typeof hopUseTypeLabels]
          : { mash: "Затирание", boil: "Кипячение", whirlpool: "Вирпул", fermentation: "Брожение", packaging: "Розлив", other: "Другое" }[line.stage];
        const temperature = ingredient.stepMeta?.temperatureC ?? ingredient.stepMeta?.fermentationTempC;
        const share = category === "fermentable" && ingredient.amountNormalizedUnit === "g" && totalGrams > 0
          ? ingredient.amountNormalizedQuantity / totalGrams * 100 : null;
        return <li className="home-editor-ingredient" data-category={category} key={line.id}>
          <HomeIngredientDetails ingredient={ingredient} name={line.displayNameRu || line.displayName || "Ингредиент"} badgeLimit={1} showSecondaryName={false}>
            <p className="home-ingredient-stage">{stage}{minutes != null && ` · ${homeNumber(minutes)} мин`}{days != null && ` · ${homeNumber(days)} дн.`}{typeof temperature === "number" && ` · ${homeNumber(temperature)} °C`}</p>
          </HomeIngredientDetails>
          <div className="home-editor-amount"><strong className="home-ingredient-amount">{homeQuantity(line.amountEnteredQuantity, line.amountEnteredUnit)}</strong>{share != null && <span>{homeNumber(share, 1)}% засыпи</span>}</div>
        </li>;
      })}</ul>
      {recipe.ingredients.length > previewIds.size && <button type="button" className="home-stock-more" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "Свернуть состав" : `Показать весь состав · ${recipe.ingredients.length} ${pluralize(recipe.ingredients.length, ["позиция", "позиции", "позиций"])}`}</button>}
    </div>;
}

function StockQuantity({
  item,
  onCommit
}: {
  item: HomeStock;
  onCommit: (quantity: number) => void;
}) {
  const [multiplier] = useState(() => item.unit === "g" && item.quantity >= 1000 && ["fermentable", "malt"].includes(item.category) ? 1000 : 1);
  const unit = multiplier === 1000 ? "кг" : homeQuantity(1, item.unit).split(" ").slice(1).join(" ");
  const [draft, setDraft] = useState(homeNumber(item.quantity / multiplier, 3));
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  function commit() {
    const value = Number(draft.replace(/\s/g, "").replace(",", "."));
    if (!draft.trim() || !Number.isFinite(value) || value < 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(Math.round(value * multiplier * 1000) / 1000);
  }
  return <div className="home-stock-quantity-wrap"><label className="home-stock-quantity"><input type="text" inputMode="decimal" value={draft} aria-label={`Остаток ${item.name}, ${unit}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={event => {
        setDraft(event.target.value);
        setInvalid(false);
      }} onBlur={commit} onKeyDown={event => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") {
          setDraft(homeNumber(item.quantity / multiplier, 3));
          setInvalid(false);
        }
      }} /><span>{unit}</span></label>{invalid && <p id={errorId} className="home-input-error" role="alert">Введите число не меньше нуля.</p>}</div>;
}
function StyleMetric({
  title,
  value,
  text,
  range
}: {
  title: string;
  value: number | null;
  text: string;
  range?: [number, number];
}) {
  const delta = range ? range[1] - range[0] : 0;
  const position = range && value != null ? Math.max(2, Math.min(98, delta ? 15 + 70 * (value - range[0]) / delta : 50)) : null;
  return <div className="home-metric"><div><span>{title}</span><strong>{text}</strong></div>{range && <><div className="home-range" aria-hidden><span />{position != null && <i style={{
          left: `${position}%`
        }} />}</div><div className="home-range-limits"><span>{title === "Начальная плотность" ? formatGravity(range[0], "plato").replace(".", ",") : homeNumber(range[0])}</span><span>{title === "Начальная плотность" ? formatGravity(range[1], "plato").replace(".", ",") : homeNumber(range[1])}</span></div></>}</div>;
}
function WaterPanel({
  recipe,
  factor
}: {
  recipe: PublicRecipeDetailDto;
  factor: number;
}) {
  const water = scaleRecipeWaterPlan(recipe.waterPlanMeta, factor);
  return water?.setupEnabled ? <div className="home-two-columns"><div><h3>Профиль воды</h3><dl className="home-facts"><div><dt>Исходная вода</dt><dd>{water.sourceProfileName || (water.sourceProfileMode === "ro_distilled" ? "Обратный осмос" : "Вода рецепта")}</dd></div><div><dt>Целевой профиль</dt><dd>{water.targetProfileName || "По рецепту"}</dd></div></dl>{water.targetProfile && <><div className="home-ions">{([["ca", "Ca²⁺"], ["mg", "Mg²⁺"], ["na", "Na⁺"], ["cl", "Cl⁻"], ["so4", "SO₄²⁻"], ["hco3", "HCO₃⁻"]] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{homeNumber(water.targetProfile![key])}</strong></div>)}</div><p className="home-panel-note">Целевые концентрации, мг/л</p></>}</div><div><h3>Вода на варку</h3><dl className="home-facts"><div><dt>Заторная</dt><dd>{metricValue(water.mashWaterVolumeL, " л")}</dd></div><div><dt>Промывочная</dt><dd>{metricValue(water.spargeWaterVolumeL, " л")}</dd></div><div><dt>Целевой pH затора</dt><dd>{metricValue(water.targetMashPh, "", 2)}</dd></div></dl></div></div> : <div className="home-panel-empty"><h3>Водоподготовка</h3><p>Профиль воды для этого рецепта ещё не настроен.</p><Link href={homeLoginHref("/app/recipes/new")}>Настроить воду в редакторе ↗</Link></div>;
}
function EquipmentPanel({
  recipe
}: {
  recipe: PublicRecipeDetailDto;
}) {
  const equipment = recipe.equipmentProfileSnapshot;
  return equipment ? <div><h3>{equipment.name}</h3><dl className="home-facts home-equipment-facts">{[["Скорость выкипания", `${homeNumber(equipment.evaporationRateLPerHr)} л/ч`], ["Потери на осадке и в чиллере", `${homeNumber(equipment.trubChillerLossL)} л`], ["Поглощение воды зерном", `${homeNumber(equipment.grainAbsorptionLPerKg)} л/кг`], ["Уменьшение объёма при охлаждении", `${homeNumber(equipment.coolingShrinkagePct)}%`]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></div> : <div className="home-panel-empty"><h3>Профиль оборудования</h3><p>В этом рецепте оборудование не указано.</p><Link href={homeLoginHref("/app/equipment")}>Добавить своё оборудование ↗</Link></div>;
}
export function HomeLabels({
  images,
  title,
  slug,
  author,
  beerPreview
}: {
  images: [string, string];
  title: string;
  slug: string;
  author: string | null;
  beerPreview: ReactNode;
}) {
  const [template, setTemplate] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  return <section id="home-labels"><div className="home-section-heading"><div><h2>Этикетки для вашего пива</h2><p className="home-section-lead">Распечатайте этикетку. По QR-коду гости откроют описание вашего пива.</p></div></div><div className="home-share" data-expanded={expanded} onKeyDown={event => {
      if (event.key === "Escape") setExpanded(false);
    }}><div className="home-label-side"><div className="home-batch"><NotebookPen /><div><strong>{title}</strong>{author && <span>{author}</span>}</div></div><div className="home-label-tabs" role="group" aria-label="Шаблоны этикеток">{["Типографика", "Крафт"].map((name, index) => <button type="button" key={name} aria-pressed={index === template} onClick={() => setTemplate(index)}>{name}</button>)}</div><button type="button" className="home-expand" aria-expanded={expanded} onClick={() => {
          setExpanded(!expanded);
          region.current?.scrollTo({
            left: 0
          });
        }}><Expand />{expanded ? "Свернуть этикетку" : "Рассмотреть этикетку"}</button><div className="home-label-image" ref={region} role="region" aria-label="Этикетка, при увеличении доступна горизонтальная прокрутка"><img src={images[template]} alt={`Этикетка «${template ? "Крафт" : "Типографика"}»: ${title}`} /></div><Link href="/labels" className="home-inline-link">Создать свою этикетку ↗</Link><Link href={`/beer/${slug}`} className="home-inline-link home-beer-mobile-link">Страница пива ↗</Link></div><div className="home-beer-preview"><h3><Link href={`/beer/${slug}`}>Страница пива ↗</Link></h3><div className="home-beer-frame">{beerPreview}</div></div></div></section>;
}
