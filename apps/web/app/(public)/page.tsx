import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Wheat, Leaf, FlaskConical, Plus } from "lucide-react";
import { getBjcpCatalogData, type BjcpCatalogStyle } from "@nb/content";
import { BeerPresentation } from "@/components/beer/beer-presentation";
import { getBeerPresentationBySlug } from "@/features/beer-page/service";
import { HomeExperience, HomeLabels, type HomeRecipePreview } from "@/components/home/home-experience";
import { HomeBrewPreview } from "@/components/home/home-brew-preview";
import { buildBrewPlanSnapshot } from "@/features/brew-batches/brew-plan";
import { buildBrewDaySteps } from "@/features/brew-batches/brew-day";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { getHomeFeaturedContentArticles, getHomeLatestPublicRecipes, getHomePublicRecipeDetails } from "@/features/home/home-data-cache";
import { getHomeIngredients, getHomeLabelImages } from "@/features/home/landing-data";
import { homeAuthorName, homeLoginHref, homeNumber, homeStyleDescriptions, pickHomeArticles } from "@/features/home/landing-model";
import { parseNumericRange } from "@/features/home/style-vitals";
import { getCalculatorBySlug, type CalculatorSlug } from "@/features/calculators/catalog";
import { isCalculatorPublic } from "@/features/calculators/visibility";
import { articleCoverFromSlug } from "@/features/content-articles/article-cover";
import { getSectionOgImage } from "@/features/og/section";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import "./home.css";
const HOME_DESCRIPTION = "NB — бесплатный помощник домашнего пивовара: склад ингредиентов, рецепты, журнал партий, этикетки и калькуляторы. Каталог ингредиентов — на русском.";
export const metadata: Metadata = {
  description: HOME_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: getServerEnv().SITE_NAME,
    url: "/",
    description: HOME_DESCRIPTION,
    images: [getSectionOgImage("home")]
  }
};
const calculatorCards: {
  slug: CalculatorSlug;
  image: number;
  title: string;
  description: string;
  action: string;
}[] = [{
  slug: "abv-attenuation",
  image: 2,
  title: "Крепость и сбраживание",
  description: "По начальной и конечной плотности",
  action: "Рассчитать крепость"
}, {
  slug: "keg-carbonation",
  image: 1,
  title: "Карбонизация в кеге",
  description: "Давление CO₂ с учётом температуры пива",
  action: "Рассчитать давление"
}, {
  slug: "refractometer-correction",
  image: 3,
  title: "Поправка рефрактометра",
  description: "Плотность с поправкой на спирт",
  action: "Скорректировать показания"
}, {
  slug: "hydrometer-correction",
  image: 4,
  title: "Поправка ареометра",
  description: "Плотность с учётом температуры пробы",
  action: "Скорректировать показания"
}, {
  slug: "unit-converter",
  image: 6,
  title: "Перевод единиц",
  description: "Плотность, цвет, объём, масса и температура",
  action: "Перевести единицы"
}];
function rangeText(value: string | null | undefined, suffix = "") {
  const range = parseNumericRange(value);
  return range ? `${homeNumber(range.min)}${range.max !== range.min ? `–${homeNumber(range.max)}` : ""}${suffix}` : "—";
}
function recipeRanges(style?: BjcpCatalogStyle): HomeRecipePreview["ranges"] {
  const result: HomeRecipePreview["ranges"] = {};
  if (!style) return result;
  for (const [key, raw, factor] of [["og", style.vitalStatistics.og, 1], ["abv", style.vitalStatistics.abv, 1], ["ibu", style.vitalStatistics.ibu, 1], ["ebc", style.vitalStatistics.srm, 1.97]] as const) {
    const range = parseNumericRange(raw);
    if (range) result[key] = [range.min * factor, range.max * factor];
  }
  return result;
}
export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/app");
  const [latest, catalog, ingredients, featuredArticles] = await Promise.all([getHomeLatestPublicRecipes(), getBjcpCatalogData(), getHomeIngredients(), getHomeFeaturedContentArticles(6)]);
  const articles = pickHomeArticles(featuredArticles);
  const details = await getHomePublicRecipeDetails(latest.items.map(recipe => recipe.id));
  const previews: HomeRecipePreview[] = details.flatMap(recipe => {
    const card = latest.items.find(item => item.id === recipe.id);
    return card ? [{
      recipe,
      card,
      ranges: recipeRanges(catalog.styles.find(style => style.bjcpId === card.style?.code))
    }] : [];
  });
  const first = previews[0];
  const brewSteps = first ? buildBrewDaySteps(buildBrewPlanSnapshot(first.recipe))
    .filter(group => group.stage !== "fermentation" && group.stage !== "packaging")
    .flatMap(group => group.steps) : [];
  const [labels, beer] = first ? await Promise.all([getHomeLabelImages(first.recipe), getBeerPresentationBySlug({
    slug: first.recipe.slug
  })]) : [null, null];
  const styles = ["4A", "21A", "15B"].flatMap(code => catalog.styles.find(style => style.bjcpId === code) ?? []);
  const env = getServerEnv();
  return <main className="home-main">
    <script {...jsonLdScriptProps({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: env.SITE_NAME,
      url: env.APP_URL,
      logo: `${env.APP_URL}/images/pwa/icon-512.png`
    })} />
    <script {...jsonLdScriptProps({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: env.SITE_NAME,
      url: env.APP_URL
    })} />
    <HomeExperience previews={previews} />
    {first && <HomeBrewPreview key={first.recipe.id} recipe={first.recipe} steps={brewSteps} />}
    {first && labels ? <HomeLabels images={labels} title={first.recipe.title} slug={first.recipe.slug} author={homeAuthorName(first.recipe.authorDisplayName)} beerPreview={beer ? <BeerPresentation beer={{ ...beer, author: { ...beer.author, displayName: homeAuthorName(beer.author.displayName) } }} embedded /> : null} /> : <section><div className="home-section-heading"><div><h2>Этикетки для вашего пива</h2><p className="home-section-lead">Распечатайте этикетку. По QR-коду гости откроют описание вашего пива.</p></div></div><Link href="/labels" className="home-button">Создать свою этикетку <ArrowRight /></Link></section>}
    <section id="home-catalog"><div className="home-section-heading"><h2>Каталог ингредиентов<br />на русском</h2><Link href="/catalog">Все ингредиенты ↗</Link></div><div className="home-catalog-grid">{ingredients.map(item => <article key={item.id} className={`home-ingredient ${item.category}`}><div className="home-ingredient-top"><span>{item.category === "fermentable" ? "Солод" : item.category === "hop" ? "Хмель" : "Дрожжи"}</span>{item.category === "hop" ? <Leaf /> : item.category === "yeast" ? <FlaskConical /> : <Wheat />}</div><div className="home-ingredient-name">{item.producer && <span>{item.producer}</span>}<h3><Link href={`/catalog/system/${item.id}`}>{item.name}</Link></h3></div><div className="home-ingredient-bottom">{item.metric && <span>{item.metric} <strong>{item.value}</strong></span>}<Link href={homeLoginHref(`/app/ingredients?addSource=catalog&addId=${encodeURIComponent(item.id)}`)}><Plus />На склад</Link></div></article>)}</div>{!ingredients.length && <p className="home-panel-empty">В каталоге пока нет опубликованных ингредиентов.</p>}</section>
    <section id="home-styles"><div className="home-section-heading"><h2>Стили пива</h2><Link href="/bjcp">Справочник BJCP · 2021 ↗</Link></div><div className="home-style-grid">{styles.map(style => <article className="home-style" key={style.bjcpId}><Link href={`/bjcp/${style.slug}`} className="home-style-photo" aria-label={style.title}>{style.heroImageUrl && <img src={style.heroImageUrl} alt={style.title} loading="lazy" />}</Link><div className="home-style-body"><span className="home-style-code">{style.bjcpId} · {style.familyNameRu}</span><h3><Link href={`/bjcp/${style.slug}`}>{style.title}</Link></h3><p>{homeStyleDescriptions[style.bjcpId] ?? style.description}</p><dl><div><dt>Крепость</dt><dd>{rangeText(style.vitalStatistics.abv, "%")}</dd></div><div><dt>Горечь, IBU</dt><dd>{rangeText(style.vitalStatistics.ibu)}</dd></div></dl><Link href={`/bjcp/${style.slug}`} className="home-inline-link">О стиле ↗</Link></div></article>)}</div></section>
    <section id="home-calculators"><div className="home-section-heading"><h2>Калькуляторы</h2><span>Без регистрации</span></div><div className="home-calculator-grid">{calculatorCards.filter(item => isCalculatorPublic(item.slug)).map((item, index) => <Link key={item.slug} href={getCalculatorBySlug(item.slug)!.href} className={`home-calculator ${index === 0 ? "featured" : ""}`} style={{
          backgroundImage: `url('/images/calculators/${item.image}-Photoroom.png')`
        }}><div><h3>{item.title}</h3><p>{item.description}</p></div><span className="home-calculator-action">{item.action}<ArrowRight /></span></Link>)}</div></section>
    <section id="home-articles"><div className="home-section-heading"><h2>Статьи о пивоварении</h2>{articles.length > 0 && <Link href="/articles">Все статьи ↗</Link>}</div>{articles.length > 0 ? <div className="home-article-grid" data-count={articles.length}>{articles.map((article, index) => <article key={article.id} className={index === 0 ? "home-article-feature" : "home-article-topic"}>{index === 0 && <Link href={`/articles/${article.slug}`} className="home-article-photo" aria-label={article.title} style={article.coverImageUrl ? undefined : {
            background: articleCoverFromSlug(article.slug).background
          }}>{article.coverImageUrl && <img src={article.coverImageUrl} alt="" loading="lazy" />}</Link>}<div><h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3>{index === 0 && article.excerpt && <p>{article.slug === "kontrol-temperatury-brozheniya" ? "Как поддерживать температуру во время брожения." : article.excerpt}</p>}<Link href={`/articles/${article.slug}`} className="home-inline-link">Читать статью <ArrowRight /></Link></div></article>)}</div> : <div className="home-articles-coming"><p>Готовим к публикации</p><div><h3>Как сварить первое пиво</h3><h3>Сколько сахара добавить перед розливом</h3><h3>Как понять, что брожение закончилось</h3></div></div>}</section>
    <section className="home-final"><h2>Начните с рецепта или запасов</h2><div className="home-actions"><Link href={homeLoginHref("/app/ingredients?add=1")} className="home-button home-primary">Добавить запасы <ArrowRight /></Link><Link href={homeLoginHref("/app/recipes/new")} className="home-button">Создать рецепт</Link></div></section>
  </main>;
}
