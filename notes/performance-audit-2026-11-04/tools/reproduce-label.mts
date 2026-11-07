import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { textEl } from '../../../apps/web/features/labels/svg.ts';
import { renderLabelSvg } from '../../../apps/web/features/labels/render.ts';
import { buildLabelSlots } from '../../../apps/web/features/labels/slots.ts';
import { getPublicRecipeById, searchPublicRecipes } from '../../../apps/web/features/recipes/service.ts';
import { parsePublicRecipeFilters } from '../../../apps/web/features/recipes/public-recipe-query.ts';
import { pickHomeRecipes } from '../../../apps/web/features/home/landing-model.ts';
import { pool } from '../../../packages/db/src/index.ts';

const fragment = textEl({x:10,y:30,fontId:'bodyMedium',sizePx:20,text:'QA'});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">${fragment}</svg>`;
let error: string | null = null;
try { new Resvg(svg).render(); } catch (value) { error = String(value); }
if(new URL(process.env.DATABASE_URL!).pathname !== '/nb_perf_audit') throw new Error('ISOLATED_DB_REQUIRED');
const latest = await searchPublicRecipes({...parsePublicRecipeFilters({}),sort:'newest',page:1,pageSize:12});
const first = pickHomeRecipes(latest.items)[0];
const recipe = await getPublicRecipeById(first.id);
const slots = buildLabelSlots({recipe,baseUrl:process.env.APP_URL!});
if(/^qa(?:[\s._-]|$)/i.test(slots.authorName || '')) slots.authorName=null;
const cases=[];
for(const template of ['typographic','craft'] as const) {
  const full=renderLabelSvg({template,preset:'LW',dpi:203,slots}).svg;
  let fullError:string|null=null;
  try {new Resvg(full).render();} catch(value) {fullError=String(value);}
  writeFileSync(new URL(`../label-${template}.svg`,import.meta.url),full);
  cases.push({template,error:fullError,chars:full.length,fragmentAtError:full.slice(560,760)});
}
writeFileSync(new URL('../label-svg-reproduction.json',import.meta.url),JSON.stringify({minimalText:{fragment,error},recipeTitle:recipe.title,cases},null,2)+'\n');
console.log({recipeTitle:recipe.title,cases});
await pool.end();
