"""Check independent stock balances and known fixture quantities in saved DB evidence."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "fixture-manifest.json").read_text())
state = json.loads((root / "30-final-state.json").read_text())
expected = dict(zip([row["id"] for row in manifest["stocks"]], [5000, 12, 10, 23]))
net = {item: 0 for item in expected}
for transaction in state["transactions"]:
    net[transaction["inventoryItemId"]] += transaction["quantityDeltaNormalized"]
for row in state["stocks"]:
    assert row["normalizedUnit"] == "g"
    assert abs(row["normalizedQuantity"] - expected[row["id"]]) < 1e-8
    assert abs(net[row["id"]]) < 1e-8

assert len(state["batches"]) == 3
assert all(batch["status"] == "cancelled" for batch in state["batches"])
assert len(state["recipes"]) == 1
source = state["recipes"][0]
assert source["batchSizeEnteredQuantity"] == 20
assert (source["og"], source["fg"], source["abv"]) == (1.043, 1.009, 4.46)
snapshots = []
for batch in state["batches"]:
    volume = batch["brewPlanSnapshot"]["recipe"]["batchSizeL"]
    quantities = [line["amountNormalizedQuantity"] for line in batch["recipeSnapshot"]["inventory"]["lines"]]
    assert quantities == ([2000, 10, 10, 5.75] if volume == 10 else [4000, 20, 20, 11.5])
    snapshots.append({"volumeL": volume, "normalizedGrams": quantities})

summary = {"stockBalance":"passed", "netDeltaByStock":net, "finalNormalizedGrams":expected,
           "snapshots":snapshots, "sourceVolumeL":20, "sourceTargetsUnchanged":True,
           "batches":3, "transactions":len(state["transactions"]), "allBatchesCancelled":True}
(root / "balance-verification.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(summary,ensure_ascii=False,indent=2))
