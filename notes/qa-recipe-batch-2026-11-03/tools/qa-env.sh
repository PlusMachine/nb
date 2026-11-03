# Source only for this isolated local QA stand. No credentials for the main database.
export PATH=/home/dopefish/.nvm/versions/node/v24.13.1/bin:$PATH
export DATABASE_URL=postgresql://qa@127.0.0.1:55434/nb_qa_20261103
export APP_URL=http://127.0.0.1:3000
export DEV_AUTH_EMAIL=
export DEV_AUTH_EMAILS=
export NEXT_TELEMETRY_DISABLED=1
export TMPDIR=/tmp
export TEMP=/tmp
export TMP=/tmp

export NEXT_DIST_DIR=.next-qa-20261103
