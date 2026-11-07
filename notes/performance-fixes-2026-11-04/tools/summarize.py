import json
import statistics
from pathlib import Path

root = Path(__file__).resolve().parent.parent
before = root.parent / "performance-audit-2026-11-04"

def profile(folder, prefix):
    samples = [json.loads((folder / f"{prefix}-mobile-slow-{i}.json").read_text()) for i in [1, 2, 3]]
    return {
        "path": samples[0]["path"], "samples": len(samples),
        **{key: statistics.median(s[key] for s in samples) for key in ["fcpMs", "lcpMs", "cls", "loadMs", "totalLongTaskBlockingMs", "jsDecoded"]},
        "transferBytes": statistics.median(s["htmlTransfer"] + s["resourceTransfer"] for s in samples),
        "menuInteractiveMs": [s["menuInteractiveAt"] for s in samples if s.get("menuInteractiveAt")],
        "errors": sum(len(s["errors"]) for s in samples),
    }

mobile = [{"name": name, "before": profile(before, name), "after": profile(root, name)} for name in ["catalog", "calculator", "editor"]]
lighthouse = []
for name in ["catalog", "recipes"]:
    row = {"name": name}
    for label, folder in [("before", before), ("after", root)]:
        report = json.loads((folder / f"lighthouse-{name}.report.json").read_text())
        row[label] = {
            "scores": {key: value["score"] for key, value in report["categories"].items()},
            "metrics": {key: report["audits"][key].get("numericValue") for key in ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "total-byte-weight"]},
            "contrastPass": report["audits"]["color-contrast"]["score"] == 1,
        }
    lighthouse.append(row)
summary = {"mobile": mobile, "lighthouse": lighthouse}
(root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(summary, ensure_ascii=False, indent=2))
