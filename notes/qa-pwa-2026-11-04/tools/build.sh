#!/usr/bin/env bash
set -u
cd /home/dopefish/projects/nb
source notes/qa-pwa-2026-11-04/tools/qa-env.sh
qa_release=${1:?release suffix required}
export NEXT_DIST_DIR=.next-qa-pwa-$qa_release-20261104
qa_log=$PWD/notes/qa-pwa-2026-11-04/tools/build-$qa_release.log
qa_result=$PWD/notes/qa-pwa-2026-11-04/tools/build-$qa_release.exit
trap 'qa_status=$?; printf "%s\n" "$qa_status" > "$qa_result"' EXIT
cd apps/web
node ../../node_modules/next/dist/bin/next build > "$qa_log" 2>&1
qa_code=$?
tail -10 "$qa_log"
exit "$qa_code"
