import hashlib
import json
import shutil
import subprocess
from pathlib import Path

out = Path(__file__).resolve().parent.parent
root = out.parent.parent
builds = [".next-perf-fixes-20261104", ".next-perf-fixes-final-20261104", ".next-perf-verified-20261104", ".next-perf-search-dev-20261104"]
for name in builds:
    shutil.rmtree(root / "apps/web" / name, ignore_errors=True)
storage = root / "apps/web/.storage/qa-performance-fixes-20261104"
shutil.rmtree(storage, ignore_errors=True)
session = Path("/tmp/nb-perf-fixes-sessions-20261104.json")
session.unlink(missing_ok=True)
Path("/tmp/nb-perf-fixes-home.html").unlink(missing_ok=True)
subprocess.run(["docker", "rm", "-f", "nb-perf-fixes-20261104"], check=True, capture_output=True, timeout=30)

# Preserve the other mobile review's generated include and all other edits.
config_path = root / "apps/web/tsconfig.json"
config = json.loads(config_path.read_text())
config["include"] = [value for value in config["include"] if not any(value.startswith(name + "/") for name in builds)]
config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
env_path = root / "apps/web/next-env.d.ts"
env = env_path.read_text()
for name in builds:
    env = env.replace("./" + name + "/types/routes.d.ts", "./.next/types/routes.d.ts")
env_path.write_text(env)

listeners = subprocess.check_output(["ss", "-H", "-ltn"], text=True, timeout=10).splitlines()
info = json.loads((out / "environment.json").read_text())
sql = "SELECT json_build_object('recipes',(SELECT count(*) FROM recipes),'users',(SELECT count(*) FROM users),'ingredients',(SELECT count(*) FROM ingredients),'batches',(SELECT count(*) FROM brew_batches),'inventoryItems',(SELECT count(*) FROM user_ingredients))"
counts = json.loads(subprocess.check_output(["docker", "exec", "nb-postgres", "psql", "-U", "postgres", "-d", "nb", "-Atc", sql], text=True, timeout=10))
record = {
    "temporaryContainerExists": subprocess.run(["docker", "inspect", "nb-perf-fixes-20261104"], capture_output=True, timeout=10).returncode == 0,
    "portsStillListening": {str(port): any(line.split()[3].endswith(":" + str(port)) for line in listeners) for port in [3018, 3019, 55437]},
    "temporaryBuildsExist": {name: (root / "apps/web" / name).exists() for name in builds},
    "temporaryStorageExists": storage.exists(),
    "sessionTokenFileExists": session.exists(),
    "ownGeneratedIncludesRemoved": not any(any(name in value for name in builds) for value in config["include"]),
    "otherMobileReviewIncludePresent": ".next-mobile-review-20261104/types/**/*.ts" in config["include"],
    "nextEnvRestored": env_path.read_bytes() == (out / "tools/before/apps/web/next-env.d.ts").read_bytes(),
    "ownGeneratedEnvReferenceRemoved": not any(name in env for name in builds),
    "sourceHashesMatchValidatedBuild": all(hashlib.sha256((root / path).read_bytes()).hexdigest() == digest for path, digest in info["sourceSha256"].items()),
    "mainDbCounts": counts,
    "browserClosed": True,
}
(out / "cleanup.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(record, ensure_ascii=False, indent=2))
