"""Back up and apply only the reviewed additive 0073 migration to local nb."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime, timezone
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[3]
report = root / 'notes/qa-interop-2026-11-03'
backup_dir = Path('/mnt/d/CodexQA/nb-2026-11-03-01a1a0a2/db-backups')
assert backup_dir.is_dir()

def docker(*args, data=None):
    return subprocess.run(['docker', 'exec', *( ['-i'] if data is not None else [] ), 'nb-postgres', *args], input=data, check=True, capture_output=True).stdout

def sql(query):
    return docker('psql', '-U', 'postgres', '-d', 'nb', '-At', '-c', query).decode().strip()

def state():
    tables = ['users', 'recipes', 'brew_batches', 'user_ingredients', 'ingredients']
    return {table: json.loads(sql(f"SELECT json_build_object('count', count(*), 'digest', md5(string_agg((to_jsonb(t) - 'editor_save_key')::text, '' ORDER BY id))) FROM {table} t")) for table in tables}

journal = json.loads((root / 'packages/db/drizzle/meta/_journal.json').read_text())['entries']
assert journal[-1]['tag'] == '0073_recipe_editor_save_key'
assert int(sql('SELECT max(created_at) FROM drizzle.__drizzle_migrations')) == journal[-2]['when'], 'EXPECTED_ONLY_0073_PENDING'
assert sql("SELECT count(*) FROM information_schema.columns WHERE table_name='recipes' AND column_name='editor_save_key'") == '0'
url = next(line.partition('=')[2].strip().strip('\"\'') for line in (root / '.env').read_text().splitlines() if line.startswith('DATABASE_URL='))
parsed = urlparse(url)
assert parsed.hostname in ['localhost', '127.0.0.1'] and parsed.port == 5432 and parsed.path == '/nb'
before = state()
receipt_path = report / 'local-db-backup.json'
receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else None
if receipt and receipt['before'] == before:
    backup = Path(receipt['backup'])
    assert hashlib.sha256(backup.read_bytes()).hexdigest() == receipt['backupSha256']
    assert docker('pg_restore', '--list', data=backup.read_bytes())
else:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = backup_dir / f'nb-local-before-0073-{stamp}.dump'
    backup.write_bytes(docker('pg_dump', '-U', 'postgres', '-d', 'nb', '--format=custom', '--no-owner', '--no-acl'))
    assert docker('pg_restore', '--list', data=backup.read_bytes())
    receipt = {'database': 'nb', 'container': 'nb-postgres', 'migration': journal[-1]['tag'], 'backup': str(backup), 'backupReadable': True, 'backupSha256': hashlib.sha256(backup.read_bytes()).hexdigest(), 'before': before}
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
if '--apply' not in os.sys.argv:
    print(json.dumps({'backupCreated': True, 'backupReadable': True, 'rowCounts': {k: v['count'] for k, v in before.items()}}))
    raise SystemExit(0)
env = dict(os.environ, DATABASE_URL=url)
result = subprocess.run(['/home/dopefish/.nvm/versions/node/v24.13.1/bin/node', '--import', 'tsx', 'packages/db/scripts/migrate.ts'], cwd=root, env=env, capture_output=True)
(report / 'tools/local-migration.log').write_bytes(result.stdout + result.stderr)
assert result.returncode == 0, 'MIGRATION_FAILED_SEE_LOCAL_LOG'
after = state()
assert after == before, 'EXISTING_DATA_CHANGED'
assert sql('SELECT count(*) FROM recipes WHERE editor_save_key IS NOT NULL') == '0'
assert int(sql('SELECT max(created_at) FROM drizzle.__drizzle_migrations')) == journal[-1]['when']
receipt.update({'after': after, 'migrationExit': 0, 'existingDataUnchanged': True, 'appliedAt': datetime.now(timezone.utc).isoformat()})
(report / 'local-docker-update.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'migrationExit': 0, 'existingDataUnchanged': True, 'rowCounts': {k: v['count'] for k, v in after.items()}}))
