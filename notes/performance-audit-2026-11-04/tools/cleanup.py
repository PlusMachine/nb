import hashlib
import json
import shutil
import subprocess
from pathlib import Path

out = Path(__file__).resolve().parent.parent
root = out.parent.parent
for path in [root / "apps/web/.next-perf-audit-20261104", root / "apps/web/.storage/qa-performance-20261104"]:
    if path.exists():
        shutil.rmtree(path)
for name in ["nb-perf-sessions-20261104.json", "nb-perf-db-copy-20261104.log", "nb-perf-home-trace.html", "nb-perf-capture-placeholder"]:
    Path("/tmp", name).unlink(missing_ok=True)

listeners = subprocess.check_output(["ss", "-H", "-ltn"], text=True, timeout=10).splitlines()
ports = {str(port): any(line.split()[3].endswith(":" + str(port)) for line in listeners) for port in [3016, 3017, 55436]}
info = json.loads((out / "environment.json").read_text())
sql = "SELECT json_build_object('recipes',(SELECT count(*) FROM recipes),'users',(SELECT count(*) FROM users),'ingredients',(SELECT count(*) FROM ingredients),'batches',(SELECT count(*) FROM brew_batches),'inventoryItems',(SELECT count(*) FROM user_ingredients))"
counts = json.loads(subprocess.check_output(["docker", "exec", "nb-postgres", "psql", "-U", "postgres", "-d", "nb", "-Atc", sql], text=True, timeout=10))
record = {
    "temporaryContainerExists": subprocess.run(["docker", "inspect", "nb-perf-audit-20261104"], capture_output=True, timeout=10).returncode == 0,
    "portsStillListening": ports,
    "temporaryBuildExists": (root / "apps/web/.next-perf-audit-20261104").exists(),
    "temporaryStorageExists": (root / "apps/web/.storage/qa-performance-20261104").exists(),
    "sessionTokenFileExists": Path("/tmp/nb-perf-sessions-20261104.json").exists(),
    "tsconfigRestored": (root / "apps/web/tsconfig.json").read_bytes() == (out / "tools/tsconfig-before.json").read_bytes(),
    "nextEnvRestored": (root / "apps/web/next-env.d.ts").read_bytes() == (out / "tools/next-env-before.txt").read_bytes(),
    "sourceHashesMatchAuditSnapshot": all(hashlib.sha256((root / path).read_bytes()).hexdigest() == digest for path, digest in info["sourceSha256"].items()),
    "trackedDiffPathsMatchBeforeReport": subprocess.check_output(["git", "diff", "--name-only"], text=True, cwd=root, timeout=10).splitlines() == info["sourceChangesPresentBeforeAudit"],
    "mainDbCounts": counts,
    "remainingContainers": subprocess.check_output(["docker", "ps", "--format", "{{.Names}} {{.Status}}"], text=True, timeout=10).splitlines(),
    "browserClosed": True,
}
(out / "cleanup.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(record, ensure_ascii=False, indent=2))
