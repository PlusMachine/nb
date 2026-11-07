import ast
import hashlib
import json
import re
import subprocess
from pathlib import Path

out = Path(__file__).resolve().parent.parent
root = out.parent.parent
verification = out / "artifact-verification.json"
links = []
missing = []
for name in ["README.md", "coverage.md"]:
    for target in re.findall(r"\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)", (out / name).read_text()):
        if target.startswith(("https://", "http://", "#")):
            continue
        path = (out / target.split("#")[0]).resolve()
        links.append(str(path.relative_to(root)))
        if not path.exists() and path != verification:
            missing.append(target)
errors = []
for path in out.rglob("*.json"):
    try:
        json.loads(path.read_text())
    except Exception as error:
        errors.append({"file": str(path), "error": str(error)})
syntax = []
for path in (out / "tools").iterdir():
    if path.suffix in [".mjs", ".cjs"]:
        result = subprocess.run(["/home/dopefish/.nvm/versions/node/v24.13.1/bin/node", "--check", str(path)], capture_output=True, text=True, timeout=15)
        syntax.append({"file": path.name, "ok": result.returncode == 0})
    elif path.suffix == ".py":
        ast.parse(path.read_text())
    elif path.suffix == ".sh":
        result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True, timeout=15)
        syntax.append({"file": path.name, "ok": result.returncode == 0})
cleanup = json.loads((out / "cleanup.json").read_text())
cleanup_ok = (
    not cleanup["temporaryContainerExists"] and not any(cleanup["portsStillListening"].values())
    and not any(cleanup["temporaryBuildsExist"].values()) and not cleanup["temporaryStorageExists"]
    and not cleanup["sessionTokenFileExists"] and cleanup["ownGeneratedIncludesRemoved"]
    and cleanup["ownGeneratedEnvReferenceRemoved"] and cleanup["sourceHashesMatchValidatedBuild"]
)
files = [path for path in out.rglob("*") if path.is_file() and path != verification]
record = {
    "markdownLocalLinks": len(links), "missingLocalLinks": missing,
    "jsonErrors": errors, "scriptSyntax": syntax, "cleanupOk": cleanup_ok,
    "files": {str(path.relative_to(out)): {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in files},
}
verification.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({key: value for key, value in record.items() if key != "files"}, ensure_ascii=False, indent=2))
assert not missing and not errors and all(item["ok"] for item in syntax) and cleanup_ok
