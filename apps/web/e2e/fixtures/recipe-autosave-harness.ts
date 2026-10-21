import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";
import type { Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const hookSource = readFileSync(new URL("../../components/recipes/recipe-designer/hooks/use-recipe-autosave.ts", import.meta.url), "utf8");
const hookJs = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;

declare global {
  interface Window {
    autosaveHarness: {
      calls: Array<{ kind: string; id: string | null; title: string }>;
      current: { title: string; status: string; dirty: boolean; pending: boolean; id: string | null };
      settle: (index: number, outcome?: "ok" | "network" | "validation") => void;
      save: () => Promise<unknown>;
      markDeleted: () => void;
      unmount: () => void;
    };
  }
}

export async function mountRecipeAutosave(page: Page, mode: "create" | "edit" = "edit") {
  await page.clock.install();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ path: join(dirname(require.resolve("react")), "umd/react.development.js") });
  await page.addScriptTag({ path: join(dirname(require.resolve("react-dom")), "umd/react-dom.development.js") });
  await page.addScriptTag({ content: `
    const calls = [], pending = [];
    const initialRecipe = ${mode === "edit" ? JSON.stringify({ id: "recipe-1", title: "A", slug: "recipe", versionNumber: 1, versions: [] }) : "undefined"};
    const request = (kind, id, payload) => new Promise((resolve, reject) => {
      calls.push({ kind, id, title: payload.title });
      pending.push(outcome => {
        if (outcome === 'network') reject(new Error('offline'));
        else if (outcome === 'validation') resolve({ ok: false, message: 'Invalid title', fieldErrors: { title: 'Invalid title' } });
        else resolve({ ok: true, recipe: { id: id || 'recipe-1', slug: 'recipe', versionNumber: 1, versions: [], publicationState: payload.publicationState } });
      });
    });
    // Подменены только границы хука: сервер и синхронная доменная валидация.
    // React, состояния, эффекты, таймеры и сам useRecipeAutosave — настоящие.
    const dependencies = {
      react: React,
      '@/app/(app)/app/recipes/actions': {
        createRecipeAction: payload => request('create', null, payload),
        updateRecipeAction: (id, payload) => request('update', id, payload)
      },
      '../helpers': {
        buildAutosaveBlockedResult: () => null,
        isRecipeDraftWorthPersisting: () => true,
        normalizeEditorPublicationState: value => value,
        normalizeSavePayload: value => value,
        replaceRecipeEditorUrl: () => {}
      }
    };
    const hookExports = {};
    (function(require, exports) { ${hookJs} })(name => {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
      return dependencies[name];
    }, hookExports);
    const harness = window.autosaveHarness = { calls, settle: (index, outcome = 'ok') => pending[index](outcome) };
    function App() {
      const [title, setTitle] = React.useState('A');
      const [publicationState, setPublicationState] = React.useState('private');
      const [, setSavedPublicationState] = React.useState('private');
      const payload = React.useMemo(() => ({ title, publicationState }), [title, publicationState]);
      const state = hookExports.useRecipeAutosave({
        mode: '${mode}', initialRecipe, payload, currentSignature: JSON.stringify(payload),
        publicationState, setPublicationState, setSavedPublicationState
      });
      harness.current = { title, status: state.saveStatus, dirty: state.isDirty, pending: state.pendingSave, id: state.activeRecipeId };
      harness.save = () => state.persistRecipe({ force: true });
      harness.markDeleted = state.markDeleted;
      return React.createElement('input', { 'aria-label': 'Recipe title', value: title, onChange: event => setTitle(event.target.value) });
    }
    const root = ReactDOM.createRoot(document.getElementById('root'));
    harness.unmount = () => root.unmount();
    ReactDOM.flushSync(() => root.render(React.createElement(App)));
  ` });
}
