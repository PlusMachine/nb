#!/usr/bin/env bash
set -euo pipefail
report_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export PATH="/home/dopefish/.nvm/versions/node/v24.13.1/bin:$PATH"
export CHROME_PATH="/home/dopefish/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
for route in catalog recipes; do
  node /home/dopefish/.npm/_npx/0f94ee7615faf582/node_modules/lighthouse/cli/index.js "http://127.0.0.1:3018/$route" \
    --chrome-flags="--headless --no-sandbox --disable-dev-shm-usage" \
    --only-categories=performance,accessibility --output=json --output=html \
    --output-path="$report_dir/lighthouse-$route" --quiet > "$report_dir/tools/lighthouse-$route.log" 2>&1
done
