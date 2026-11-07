import hashlib
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[3]
records = []
for family, weights in [("Rubik", (400, 700)), ("Montserrat", (600, 800)), ("Onest", (400, 700)), ("Unbounded", (500, 700))]:
    original = root / f"apps/web/app/fonts/{family}-Variable.ttf"
    target = original.with_suffix(".woff2")
    font = TTFont(original, lazy=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes("U+0000-024F,U+0370-052F,U+2000-22FF,U+25A0-25FF,U+FEFF"))
    subsetter.subset(font)
    instantiateVariableFont(font, {"wght": weights}, inplace=True)
    font.flavor = "woff2"
    font.save(target)
    records.append({"family": family, "weightRange": weights, "originalBytes": original.stat().st_size, "woff2Bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
(root / "notes/performance-fixes-2026-11-04/font-assets.json").write_text(json.dumps(records, indent=2) + "\n")
print(json.dumps(records, indent=2))
