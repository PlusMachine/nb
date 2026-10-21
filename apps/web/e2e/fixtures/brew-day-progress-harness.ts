import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";
import type { Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../../features/brew-batches/components/use-brew-day-progress.ts", import.meta.url), "utf8");
const hookJs = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

export async function mountBrewDayProgress(page: Page) {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ path: join(dirname(require.resolve("react")), "umd/react.development.js") });
  await page.addScriptTag({ path: join(dirname(require.resolve("react-dom")), "umd/react-dom.development.js") });
  await page.addScriptTag({ content: `
    const pending = [], calls = [];
    const initial = { steps: {}, updatedAt: null };
    const dependencies = {
      react: React,
      '@/features/brew-batches/contracts': { emptyBrewDayProgress: initial },
      '@/app/(app)/app/brew-batches/[id]/actions': { setBrewDayStepStateAction: (id, step, patch) => new Promise((resolve, reject) => { calls.push({step, patch}); pending.push({resolve, reject}); }) }
    };
    const exports = {};
    (function(require, exports) { ${hookJs} })(name => dependencies[name], exports);
    window.progressHarness = { calls, settle: (index, result) => pending[index].resolve(result), fail: index => pending[index].reject(new Error('offline')) };
    function App() {
      const [batchId, setBatchId] = React.useState('batch');
      const controller = exports.useBrewDayProgress(batchId, initial);
      window.progressHarness.current = controller;
      window.progressHarness.switchBatch = setBatchId;
      return React.createElement('div', {},
        ...['a','b'].map(step => React.createElement('button', {key:step,onClick:()=>controller.patchStep(step,{done:true})},step)),
        React.createElement('output', {'data-testid':'state'}, JSON.stringify(controller.progress.steps)),
        controller.error ? React.createElement('p', {role:'alert'}, controller.error) : null
      );
    }
    ReactDOM.flushSync(() => ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App)));
  ` });
}
