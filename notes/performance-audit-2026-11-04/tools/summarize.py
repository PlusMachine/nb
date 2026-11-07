import json
import statistics
from pathlib import Path

root = Path(__file__).resolve().parent.parent
rows = []
for prefix in ["catalog", "calculator", "editor"]:
    samples = [json.loads((root / f"{prefix}-mobile-slow-{i}.json").read_text()) for i in [1, 2, 3]]
    rows.append({
        "route": samples[0]["path"], "samples": 3,
        **{key: statistics.median([sample[key] for sample in samples]) for key in ["fcpMs", "lcpMs", "cls", "loadMs", "totalLongTaskBlockingMs", "resourceTransfer", "jsDecoded"]},
        "menuInteractiveMs": [sample["menuInteractiveAt"] for sample in samples if sample.get("menuInteractiveAt")],
    })
lighthouse = []
for name in ["catalog", "recipes"]:
    report = json.loads((root / f"lighthouse-{name}.report.json").read_text())
    lighthouse.append({
        "route": report["finalDisplayedUrl"], "version": report["lighthouseVersion"],
        "scores": {key:value["score"] for key,value in report["categories"].items()},
        "metrics": {key:report["audits"][key].get("numericValue") for key in ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "total-byte-weight"]},
        "settings": report["configSettings"]["throttling"],
    })
summary = {"mobile": rows, "lighthouse": lighthouse}
(root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(summary, ensure_ascii=False, indent=2))
