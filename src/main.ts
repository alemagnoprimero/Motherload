// Each mode owns its renderer and save domain; switching never converts saves.
const requested = new URL(location.href).searchParams.get("mode");
let existingLegacy = false;
try {
  existingLegacy = Boolean(localStorage.getItem("motherload.frontier.v1"));
} catch {
  // A fresh campaign can still run in memory if storage is unavailable.
}
if (requested === "legacy" || (requested !== "campaign" && existingLegacy)) {
  document.body.dataset.mode = "legacy";
  void import("./legacy-main");
} else {
  document.body.dataset.mode = "campaign";
  void import("./campaign/main");
}
