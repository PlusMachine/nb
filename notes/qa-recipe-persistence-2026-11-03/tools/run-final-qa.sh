#!/usr/bin/env bash
set -u
cd /home/dopefish/projects/nb
source notes/qa-recipe-batch-2026-11-03/tools/qa-env.sh
qa_out=notes/qa-recipe-persistence-2026-11-03/tools
node --import tsx packages/db/scripts/migrate.ts > "$qa_out/migration-final.log" 2>&1 || exit $?
(cd apps/web && APP_URL=http://localhost:3000 node ../../node_modules/vitest/vitest.mjs run --maxWorkers=4) > "$qa_out/all-web-unit.log" 2>&1
qa_unit=$?
tail -n 18 "$qa_out/all-web-unit.log"
(cd packages/brewing-core && node ../../node_modules/vitest/vitest.mjs run) > "$qa_out/brewing-core.log" 2>&1
qa_core=$?
tail -n 12 "$qa_out/brewing-core.log"
(cd apps/web && node ../../node_modules/vitest/vitest.mjs run --config integration/vitest.config.ts) > "$qa_out/all-targeted-integration.log" 2>&1
qa_integration=$?
tail -n 32 "$qa_out/all-targeted-integration.log"
node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit > "$qa_out/typecheck.log" 2>&1
qa_types=$?
node node_modules/typescript/bin/tsc --project packages/db/tsconfig.json --noEmit > "$qa_out/db-typecheck.log" 2>&1
qa_db_types=$?
tail -n 18 "$qa_out/typecheck.log"
E2E_BASE_URL=http://127.0.0.1:3000 node node_modules/@playwright/test/cli.js test --config apps/web/playwright.config.ts recipe-autosave.spec.ts --project laptop --workers 2 > "$qa_out/autosave-hooks-after-fix.log" 2>&1
qa_hooks=$?
tail -n 12 "$qa_out/autosave-hooks-after-fix.log"
printf '{"unitExit":%s,"coreExit":%s,"integrationExit":%s,"typecheckExit":%s,"autosaveHooksExit":%s,"dbTypecheckExit":%s}\n' "$qa_unit" "$qa_core" "$qa_integration" "$qa_types" "$qa_hooks" "$qa_db_types" > "$qa_out/final-checks.json"
exit $((qa_unit + qa_core + qa_integration + qa_types + qa_hooks + qa_db_types > 0))
