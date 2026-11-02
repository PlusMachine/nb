import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type { CalculatorSlug } from "../../features/calculators/catalog";

const require = createRequire(import.meta.url);
// Используем сборщик из установленного тестового стека Vitest → Vite.
const viteRequire = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const boundaryModules: Record<string, string> = {
  "next/link": "export default function Link({ children }) { return children; }",
  "next/navigation": "const params = new URLSearchParams(location.search); export const useSearchParams = () => params; export const usePathname = () => location.pathname;",
  "@/features/system/gravity-unit-actions": "export const loadViewerPreferredGravityUnit = () => window.gravityProfilePromise;",
  "@/components/ingredients/ingredient-picker": "export const IngredientPicker = () => null; export const buildIngredientSearchParams = () => new URLSearchParams();",
  "@/app/(app)/app/brew-batches/[id]/actions": `
    export const addBrewMeasurementAction = async (id, input) => {
      window.gravitySubmittedMeasurements.push(input);
      return { ok: true, message: 'ok' };
    };
    export const deleteBrewMeasurementAction = async () => ({ ok: true });
    export const setBrewMeasurementFinalAction = async () => ({ ok: true });
  `,
  "@/components/calculators/keg-carbonation-block": "export const KegCarbonationBlock = () => null;"
};

const buildBundle = () => build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ToastProvider } from '@nb/ui';
      import { CalculatorPageClient } from './components/calculators/calculator-page-client';
      import { LabelStudio } from './components/recipes/labels/label-studio';
      import { formatGravityNumber } from './features/system/gravity-units';
      import { BrewJournal } from './features/brew-batches/components/brew-journal';
      import { summarizeBrewMeasurements } from './features/brew-batches/measurements';
      import { FgSettingsPopover } from './components/recipes/recipe-designer/fg-settings-popover';
      import { recipeCalculationMetaSchema } from './features/recipes/contracts';
      function App() {
        const [unit, setUnit] = React.useState(window.gravityProfileUnit);
        const [meta, setMeta] = React.useState(() => recipeCalculationMetaSchema.parse({ manualFgOverrideValue: 1.012 }));
        window.changeGravityInputUnit = setUnit;
        window.gravityManualFgValue = meta.manualFgOverrideValue;
        const slots = React.useMemo(() => ({
          title: 'Тестовое пиво', styleName: null, abvText: null, ibu: null, ebc: null,
          ogText: formatGravityNumber(1.05, unit), fgText: formatGravityNumber(1.012, unit),
          gravityUnitText: unit === 'sg' ? null : unit === 'brix' ? '°Bx' : '°P',
          malts: [], hops: [], yeast: null, description: null, showLogo: true, showIbuScale: true,
          volumeText: null, batchText: null, authorName: null, bottlingDateText: null, qrUrl: null, brandText: 'NB'
        }), [unit]);
        if (window.gravityView === 'labels') return React.createElement(LabelStudio, {
          endpoint: '/api/labels/custom', heading: 'Наклейки', defaultSlots: slots,
          gravityUnit: unit, qrUnavailableReason: 'custom'
        });
        if (window.gravityView === 'journal') return React.createElement(BrewJournal, {
          brewBatchId: 'test-batch', measurements: [], preferredGravityUnit: unit, measurementKind: 'og',
          summary: summarizeBrewMeasurements([], { og: 1.05, fg: 1.012, abv: 5 })
        });
        if (window.gravityView === 'manual-fg') return React.createElement(FgSettingsPopover, {
          preview: null, calculationMeta: meta, onChange: setMeta, preferredGravityUnit: unit
        });
        return React.createElement(CalculatorPageClient, { slug: window.gravityCalculatorSlug });
      }
      createRoot(document.getElementById('root')).render(
        React.createElement(ToastProvider, {}, React.createElement(App))
      );
    `,
    resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    loader: "tsx"
  },
  tsconfig: fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "server-boundaries",
    setup(builder: { onResolve: Function; onLoad: Function }) {
      builder.onResolve({ filter: /.*/ }, (args: { path: string }) => {
        const path = args.path.endsWith("gravity-unit-actions") ? "@/features/system/gravity-unit-actions" : args.path;
        return path in boundaryModules ? { path, namespace: "boundary" } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args: { path: string }) => ({ contents: boundaryModules[args.path] }));
    }
  }]
}).then((result: { outputFiles: Array<{ text: string }> }) => result.outputFiles[0]!.text);
let bundle: Promise<string> | undefined;

export async function mountGravityCalculator(page: Page, {
  unit = "plato",
  slug = "refractometer-correction",
  view = "calculator",
  storedState,
  query = "",
  reload = false,
  delayedProfile = false
}: {
  unit?: "sg" | "plato" | "brix";
  slug?: CalculatorSlug;
  view?: "calculator" | "labels" | "journal" | "manual-fg";
  storedState?: Record<string, unknown>;
  query?: string;
  reload?: boolean;
  delayedProfile?: boolean;
} = {}) {
  if (reload) {
    await page.reload();
  } else {
    await page.route("https://gravity.test/**", route => route.fulfill({
      contentType: route.request().url().includes("/api/") ? "image/svg+xml" : "text/html",
      body: route.request().url().includes("/api/") ? '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' : '<div id="root"></div>'
    }));
    await page.goto(`https://gravity.test/${query ? `?${query}` : ""}`);
  }
  await page.evaluate(({ unit, delayedProfile, slug, view, storedState }) => {
    Object.assign(window, {
      gravityProfileUnit: unit, gravityCalculatorSlug: slug, gravityView: view,
      gravitySubmittedMeasurements: []
    });
    if (storedState) localStorage.setItem(`hmelo.calculators.${slug}.lastState`, JSON.stringify(storedState));
    const harness = window as unknown as {
      gravityProfilePromise: Promise<string>;
      resolveGravityProfile: () => void;
    };
    harness.gravityProfilePromise = new Promise(resolve => {
      harness.resolveGravityProfile = () => resolve(unit);
      if (!delayedProfile) harness.resolveGravityProfile();
    });
  }, { unit, delayedProfile, slug, view, storedState });
  await page.addScriptTag({ content: await (bundle ??= buildBundle()) });
}
