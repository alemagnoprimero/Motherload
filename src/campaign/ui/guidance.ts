import { itemName } from "../names";
import type { Campaign } from "../model";
import { savePilotPreferences, type PilotPreferences } from "../input";
import { campaignPois } from "../poi";
import { coachStep } from "../onboarding";
import { patchMarkup, byId as $, setText, setHidden } from "./dom";
import { contractMarkup } from "./journal";
let tripCampaign: Campaign | undefined;
let tripEnergy = 0,
  tripAdviceShown = false;
export function renderGuidance(
  campaign: Campaign,
  preferences: PilotPreferences,
  overlay: string | undefined,
  rigCueUntil: number,
  showMessage: (message: string, priority?: number) => void,
  scanning = false,
) {
  const reserveButton = $<HTMLButtonElement>("campaign-use-reserve");
  const s = campaign.state,
    reserve = campaign.returnReserve;
  if (tripCampaign !== campaign) {
    tripCampaign = campaign;
    tripEnergy = s.vehicle.energy;
    tripAdviceShown = false;
  }
  if (campaign.atDock) {
    tripEnergy = s.vehicle.energy;
    tripAdviceShown = false;
  }
  const labels = {
    ok: "Safe",
    plan: "Plan return",
    turn: "Turn back",
    stranded: "Cannot reach home",
  };
  setText(
    "campaign-return",
    `Home ${reserve.estimate.toFixed(1)}L · ${labels[reserve.state]}`,
  );
  $("campaign-return").dataset.state = reserve.state;
  // T8 (D3): a safe reserve is a Scan label; "Plan return", "Turn back" and
  // "Cannot reach home" are warnings and stay on. The energy bar's notch
  // shows the reserve at all times.
  setHidden(
    "campaign-return",
    !preferences.assists ||
      campaign.atDock ||
      Boolean(overlay) ||
      (reserve.state === "ok" && !scanning),
  );
  $("campaign-return-notch").style.left =
    Math.min(100, (reserve.estimate / campaign.maxEnergy) * 100) + "%";
  $("campaign-return-notch").hidden = !preferences.assists;
  const occupied = campaign.cargo.flatMap((item) =>
    Array.from({ length: item.bulk }, () => item),
  );
  const shown = Math.min(8, campaign.capacity);
  const pips = Array.from({ length: shown }, (_, index) => {
    const item = occupied[index],
      tier = item ? Number(item.itemId.match(/O(\d)$/)?.[1] ?? 5) : 0;
    return `<i class="${item ? "filled tier-" + tier : ""}" title="${item ? itemName(item.itemId, item.name) : "Empty cargo slot"}"></i>`;
  }).join("");
  const missions = campaign.world.missions
    .filter((item) => item.status === "carried")
    .map(() => '<b class="mission-pip" title="Protected mission cargo"></b>')
    .join("");
  patchMarkup(
    $("campaign-cargo-pips"),
    pips +
      (campaign.capacity > shown
        ? '<span class="cargo-overflow" title="Full capacity shown in the readout">+</span>'
        : "") +
      missions,
  );
  $("campaign-depth-rail").style.setProperty(
    "--depth",
    String(Math.min(1, campaign.depth / (campaign.world.rows * 10))),
  );
  const maximumDepth = campaign.world.rows * 10;
  const recordedDepth = Math.max(
    campaign.depth,
    s.progress.records?.[s.currentWorld]?.deepest ??
      (Object.keys(s.worlds).length === 1 ? s.stats.largestDepth : 0),
  );
  const safeDepth = campaign.safeDescentDepth;
  const targets = campaignPois(campaign).filter(
    (poi) => poi.depthMeters > 0 && poi.kind !== "seam",
  );
  const hazards = [
    ...campaign.world.shelves,
    ...(campaign.world.pressureSeams ?? []),
    ...(campaign.world.hazards?.coldPockets ?? []),
    ...(campaign.world.hazards?.vents ?? []),
  ].filter((hazard) => campaign.isKnown(hazard.x, hazard.y));
  patchMarkup(
    $("campaign-depth-rail"),
    `<span class="rail-safe" style="height:${Math.min(100, (safeDepth / maximumDepth) * 100)}%" title="Estimated safe descent · current load · unknown rock assumed soil"></span><i class="rail-current"></i><b class="rail-deepest" style="top:${Math.min(100, (recordedDepth / maximumDepth) * 100)}%" title="Deepest recorded ${recordedDepth} m"></b>${targets.map((poi) => `<b class="rail-mission" style="top:${(poi.depthMeters / maximumDepth) * 100}%" title="${poi.depthMeters} m mission"></b>`).join("")}${hazards.map((hazard) => `<b class="rail-hazard" style="top:${((hazard.y + 1) / campaign.world.rows) * 100}%" title="Known hazard ${(hazard.y + 1) * 10} m"></b>`).join("")}`,
  );
  $("campaign-depth-rail").dataset.safeDepth = String(safeDepth);
  $("campaign-depth-rail").hidden = !preferences.assists;
  const cursor = coachStep(
    {
      mined: s.stats.mined,
      cargo: campaign.cargoBulk,
      atDock: campaign.atDock,
      banked: s.progress.bankedOre,
      credits: s.credits,
      milestone: s.progress.completed.length,
      energyRatio: s.vehicle.energy / campaign.maxEnergy,
      upgraded: Object.values(s.hardware).some((rank) => rank > 0),
      row: s.vehicle.y,
    },
    preferences.coachStep,
  );
  const coaching =
    !preferences.coachSkipped && !cursor.complete && s.currentWorld === "W01";
  const urgentAdvice = [
    "campaign-message",
    "campaign-danger",
    "campaign-extraction",
  ].some((id) => !$(id).hidden);
  setHidden("campaign-coach", !coaching || Boolean(overlay) || urgentAdvice);
  setText("campaign-coach-copy", cursor.text);
  document.body.classList.toggle("campaign-coaching", coaching);
  if (cursor.next !== preferences.coachStep) {
    preferences.coachStep = cursor.next;
    savePilotPreferences(preferences);
  }
  if (
    !coaching &&
    !campaign.atDock &&
    s.hardware.energy === 0 &&
    !tripAdviceShown &&
    Math.max(0, tripEnergy - s.vehicle.energy) + reserve.estimate >
      campaign.maxEnergy * 0.85
  ) {
    tripAdviceShown = true;
    showMessage(
      "This route needs a larger tank. Install one at the lander.",
      2,
    );
  }
  patchMarkup($("campaign-contracts"), contractMarkup(campaign));
  setHidden("campaign-use-reserve", !s.equipped.utilities.includes("W02-R2"));
  reserveButton.textContent = `Reserve · ${(s.vehicle.reserve ?? 0).toFixed(1)} L`;
  reserveButton.disabled = (s.vehicle.reserve ?? 0) <= 0 || Boolean(overlay);
  if (performance.now() > rigCueUntil) setHidden("campaign-rig-cue", true);
  const log = campaign.nearbyFieldLogs[0],
    cache = campaign.nearbyCaches[0];
  if (!campaign.atDock && (log || cache) && !overlay) {
    setHidden("campaign-dock-toggle", false);
    $("campaign-dock-toggle").querySelector("strong")!.textContent = log
      ? "Read field log"
      : "Open cache";
  }
}
