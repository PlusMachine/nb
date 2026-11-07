#!/usr/bin/env bash
set -euo pipefail
repo=/home/dopefish/projects/nb
out=$repo/notes/performance-fixes-2026-11-04
cd "$repo"
source "$out/tools/qa-env.sh"
export NEXT_DIST_DIR=.next-perf-verified-20261104
stage=${1:-status}
if [ "$stage" = status ]; then
  echo "WSL distribution: ${WSL_DISTRO_NAME:-unknown}"
  tail -n 14 "$out/tools/build-inventory-client.log"
  test ! -f apps/web/$NEXT_DIST_DIR/BUILD_ID || cat apps/web/$NEXT_DIST_DIR/BUILD_ID
  docker ps --filter name=nb-perf-fixes-20261104 --format '{{.Names}} {{.Status}}'
  ss -H -ltn | rg ':3018|:3019|:55437' || true
  exit
fi
if [ "$stage" = log ]; then
  name=${2:?log filename required}
  [[ "$name" != */* ]] || exit 2
  tail -n 100 "$out/tools/$name"
  exit
fi
if [ "$stage" = all ]; then
  if ! grep -q 'server-rendered on demand' "$out/tools/build-inventory-client.log"; then
    while pgrep -f '^node ../../node_modules/next/dist/bin/next build$' >/dev/null; do sleep 5; done
    if ! grep -q 'server-rendered on demand' "$out/tools/build-inventory-client.log"; then
      (cd apps/web && node ../../node_modules/next/dist/bin/next build > "$out/tools/build-inventory-client.log" 2>&1)
    fi
  fi
  docker inspect nb-perf-fixes-20261104 >/dev/null
  docker start nb-perf-fixes-20261104 >/dev/null
  docker exec nb-perf-fixes-20261104 psql -U postgres -d nb_perf_fixes -Atc 'SELECT count(*) FROM users' >/dev/null
  test -d apps/web/.storage/qa-performance-fixes-20261104
  node --import tsx "$out/tools/auth.mts" > "$out/tools/auth-final.log" 2>&1
  if ss -H -ltn | awk '{print $4}' | grep -q ':3018$'; then echo 'PORT_3018_ALREADY_IN_USE'; exit 1; fi
  (cd apps/web && exec node ../../node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3018) > "$out/tools/server-final.log" 2>&1 &
  server_pid=$!
  echo "$server_pid" > "$out/tools/final-server.pid"
  trap 'kill "$server_pid" 2>/dev/null || true' EXIT
  for attempt in $(seq 1 30); do
    if curl --silent --fail http://127.0.0.1:3018/api/inventory >/dev/null; then break; fi
    if curl --silent -o /dev/null -w '%{http_code}' http://127.0.0.1:3018/api/inventory | grep -q 401; then break; fi
    sleep 1
  done
  cd apps/web
  PERFORMANCE_QA=1 E2E_BASE_URL=http://127.0.0.1:3018 node ../../node_modules/@playwright/test/cli.js test --config=e2e/performance-regression.config.ts --grep='inventory search|clear wins' --repeat-each=3 --max-failures=1 > "$out/tools/search-final.log" 2>&1
  tail -n 3 "$out/tools/search-final.log"
  PERFORMANCE_QA=1 E2E_BASE_URL=http://127.0.0.1:3018 node ../../node_modules/@playwright/test/cli.js test --config=e2e/performance-regression.config.ts > "$out/tools/e2e-final.log" 2>&1
  tail -n 3 "$out/tools/e2e-final.log"
  PWA_BASE_URL=http://127.0.0.1:3018 node ../../node_modules/@playwright/test/cli.js test --config=e2e/pwa-prod.config.ts pwa.spec.ts > "$out/tools/pwa-final.log" 2>&1
  tail -n 3 "$out/tools/pwa-final.log"
  APP_URL=http://localhost:3000 node ../../node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=60000 > "$out/tools/all-unit-final.log" 2>&1
  tail -n 7 "$out/tools/all-unit-final.log"
  node "$out/tools/http-smoke.mjs" > "$out/tools/http-smoke.log" 2>&1
  cd "$repo"
  node "$out/tools/run-browser.mjs" > "$out/tools/browser-final.log" 2>&1
  bash "$out/tools/run-lighthouse.sh"
  python3 "$out/tools/summarize.py" > "$out/tools/summary-output.log"
  python3 "$out/tools/write-final-report.py"
  kill "$server_pid"
  wait "$server_pid" || true
  trap - EXIT
  python3 "$out/tools/cleanup.py" > "$out/tools/cleanup.log"
  python3 "$out/tools/verify-artifacts.py"
  git diff --check
  echo 'PERFORMANCE_AUDIT_COMPLETE'
  exit
fi
exit 2