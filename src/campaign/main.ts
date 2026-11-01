import Phaser from "phaser";
import { Campaign, createCampaign } from "./model";
import { createCampaignScene } from "./scene";
import {
  CampaignSaveError,
  CampaignStore,
  MAX_CAMPAIGN_BYTES,
} from "./persistence";
import {
  HARDWARE_KEYS,
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  W01_GEAR,
  W01_MILESTONES,
  WORLD_CATALOG,
  formatCredits,
} from "./config";
import {
  CampaignInput,
  ACTION_LABELS,
  keyLabel,
  loadPilotPreferences,
  savePilotPreferences,
  type PilotAction,
} from "./input";
import { CampaignAudio } from "./audio";
import { campaignMission } from "./missions";
import type { CampaignState, HardwareKey } from "./types";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const money = (value: number) => formatCredits(value) + " CR";
const HUD_ART = {
  energy: new URL(
    "../../assets/campaign/generated/icons/ui-energy-48.png",
    import.meta.url,
  ).href,
  hull: new URL(
    "../../assets/campaign/generated/icons/ui-hull-48.png",
    import.meta.url,
  ).href,
  cargo: new URL(
    "../../assets/campaign/generated/icons/ui-cargo-48.png",
    import.meta.url,
  ).href,
  depth: new URL(
    "../../assets/campaign/generated/icons/ui-depth-48.png",
    import.meta.url,
  ).href,
  mission: new URL(
    "../../assets/campaign/generated/icons/ui-mission-48.png",
    import.meta.url,
  ).href,
  drill: new URL(
    "../../assets/campaign/generated/icons/icon-drill-64.png",
    import.meta.url,
  ).href,
  feet: new URL(
    "../../assets/campaign/generated/icons/icon-feet-64.png",
    import.meta.url,
  ).href,
  rack: new URL(
    "../../assets/campaign/generated/icons/icon-rack-64.png",
    import.meta.url,
  ).href,
  engine: new URL(
    "../../assets/campaign/generated/icons/icon-engine-64.png",
    import.meta.url,
  ).href,
  map: new URL(
    "../../assets/campaign/generated/icons/ui-map-48.png",
    import.meta.url,
  ).href,
  reservoir: new URL(
    "../../assets/campaign/generated/icons/icon-energy-64.png",
    import.meta.url,
  ).href,
  bay: new URL(
    "../../assets/campaign/generated/icons/icon-cargo-64.png",
    import.meta.url,
  ).href,
  armor: new URL(
    "../../assets/campaign/generated/icons/icon-hull-64.png",
    import.meta.url,
  ).href,
  core: new URL(
    "../../assets/campaign/generated/icons/icon-core-64.png",
    import.meta.url,
  ).href,
};
function hudIcon(name: keyof typeof HUD_ART, className = "") {
  return (
    '<img class="hud-icon ' +
    className +
    '" src="' +
    HUD_ART[name] +
    '" alt="" aria-hidden="true">'
  );
}
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let campaign = new Campaign(createCampaign(seed()));
const store = new CampaignStore();
const preferences = loadPilotPreferences();
const audio = new CampaignAudio(preferences);
type Overlay = "welcome" | "menu" | "dock" | "map" | undefined;
let overlay: Overlay = "welcome";
let dockTab = "service";
let busy = false,
  blocked = false,
  conflict = false,
  backupAvailable = false;
let initialized = false,
  saveTimer = 0,
  hudTimer = 0;
let savePromise: Promise<boolean> | undefined;
let previousMessage = "",
  messageUntil = 0;
let confirmation: (() => Promise<void> | void) | undefined;
let confirmBusy = false;
let confirmReturn: Overlay;
let launchUntil = 0;
let lastMined = 0,
  lastHull = 10;
let energyWarningBand = 0;
let previousObjective = "";

$("app").innerHTML = `
<main class="campaign-shell" aria-label="Motherload campaign">
  <div id="campaign-game" tabindex="0" role="application" aria-label="Mining expedition. Touch places a floating joystick: drag from its center to steer, up to fly, down to drill. Mouse holds steer relative to the rig. Tap minerals to inspect. Arrows or WASD drive and drill, Up flies, E enters the lander, Space braces, Escape pauses." aria-busy="true"></div>
  <div class="campaign-hud" aria-label="Vehicle conditions">
    <section class="instrument instrument-left" aria-label="Energy and hull">
      <div class="vital energy-vital">${hudIcon("energy")}<div><div class="instrument-row"><span>ENERGY</span><strong id="campaign-energy">6 / 10</strong></div><div class="meter energy-meter"><i id="campaign-energy-fill"></i></div></div></div>
      <div class="vital hull-vital">${hudIcon("hull")}<div><div class="instrument-row"><span>HULL</span><strong id="campaign-hull">10 / 10</strong></div><div class="meter hull-meter"><i id="campaign-hull-fill"></i></div></div></div>
    </section>
    <section class="instrument instrument-right" aria-label="Depth and cargo">
      <div class="readout" title="Depth">${hudIcon("depth")}<span class="sr-only">Depth</span><strong id="campaign-depth">0 m</strong></div>
      <div class="readout" title="Cargo bulk">${hudIcon("cargo")}<span class="sr-only">Cargo</span><strong id="campaign-cargo">0 / 7</strong></div>
      <div class="readout haul-readout" title="Current haul value"><span class="hud-mini-label">HAUL</span><strong id="campaign-haul">0 CR</strong></div>
      <div class="credit-readout" title="Credits"><span class="credit-mark" aria-hidden="true">CR</span><span class="sr-only">Credits</span><strong id="campaign-credits">20 CR</strong></div>
    </section>
  </div>
  <button id="campaign-menu-toggle" class="campaign-menu-button" aria-haspopup="dialog" aria-controls="campaign-menu" aria-label="Pause menu" title="Pause menu"></button>
  <section class="campaign-objective" aria-label="Stage mission">${hudIcon("mission")}<div class="objective-copy"><div class="mission-heading"><span id="campaign-objective-step">01 / 03</span><strong id="campaign-objective-title">Survey the wreck</strong></div><ul id="campaign-objective-progress" aria-label="Mission goals"></ul><p id="campaign-objective-next"></p><small id="campaign-objective-reward"></small></div></section>
  <div id="campaign-message" class="campaign-message" role="status"></div>
  <button id="campaign-dock-toggle" class="campaign-context" hidden><span class="interaction-key" aria-hidden="true">E</span><strong>Dock and trade</strong></button>
  <div class="campaign-toolbar" aria-label="Equipped attachments">
    <div class="tool-slot drill-slot" title="Active drill">${hudIcon("drill")}<div><span>DRILL</span><strong id="campaign-drill-name">Salvaged auger</strong></div></div>
    <button id="campaign-feet-button" class="tool-slot mobility-slot" data-dir="mobility" aria-label="Hold to deploy anchoring feet">${hudIcon("feet")}<div><span>MOBILITY</span><strong id="campaign-mobility-name">No attachment</strong></div></button>
    <div class="tool-slot processor-slot" title="Processor">${hudIcon("rack")}<div><span>PROCESSOR</span><strong id="campaign-processor-name">Open cargo bay</strong></div></div>
    <button id="campaign-map-toggle" class="map-slot" aria-label="Open star map" title="Star map">${hudIcon("map")}</button>
  </div>
  <div class="campaign-touch" aria-label="Optional direction buttons"><div><button data-dir="left" aria-label="Steer left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h13"/></svg></button><button data-dir="right" aria-label="Steer right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7M17 12H4"/></svg></button></div><div><button data-dir="down" aria-label="Drill downward"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 10 7 7 7-7M12 17V4m-5 17h10"/></svg></button><button data-dir="up" aria-label="Thrust upward"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 14 7-7 7 7M12 7v13"/></svg></button></div></div>
  <div id="campaign-launch" class="campaign-launch" hidden><span class="eyebrow">FRONTIER CERTIFICATE SECURED</span><h1>Course charted.</h1><p>Ice comet / Fractured moon</p></div>
</main>
<dialog id="campaign-welcome" class="campaign-welcome"><div class="title-screen"><p class="eyebrow">THE FRONTIER</p><h1>MOTHERLOAD</h1><p class="title-location">BROKEN ASTEROID <span>600 m</span></p><p class="title-mission">Recover the core. Restore the lander.</p><button id="campaign-start" class="primary">Deploy rig <span aria-hidden="true">›</span></button><p class="welcome-hint">Touch: press to place your joystick, then drag.<br>Up flies · Down drills · Mouse or Arrows / WASD</p><a href="?mode=legacy" class="quiet-link">Legacy mine</a></div></dialog>
<dialog id="campaign-menu" class="campaign-panel" aria-labelledby="campaign-menu-title"><header><div><p class="eyebrow">PILOT CONSOLE</p><h1 id="campaign-menu-title">Paused</h1></div><button data-close="menu" class="return-button">Return to mine</button></header><div id="campaign-storage-notice" class="campaign-notice" hidden role="alert"></div><div class="pause-grid"><section><h2>Checkpoint</h2><p id="campaign-save-status" role="status">Preparing checkpoint…</p><div class="action-grid"><button data-command="save">Save checkpoint</button><button data-command="load">Load saved checkpoint</button><button data-command="export">Export campaign</button><button data-command="import">Import campaign</button><button data-command="restore">Restore backup</button></div><input id="campaign-import" type="file" accept="application/json,.json" hidden></section><section><h2>Flight record</h2><div id="campaign-record"></div><button data-command="map">Star map</button></section><section><h2>Systems</h2><button id="campaign-sound">Enable sound</button><label>Effects <input type="range" data-volume="effects" min="0" max="100"></label><label>Ambience <input type="range" data-volume="ambience" min="0" max="100"></label><label>Music <input type="range" data-volume="music" min="0" max="100"></label><label class="check"><input type="checkbox" data-setting="reducedMotion"> Reduced motion</label><label class="check"><input type="checkbox" data-setting="highContrast"> High-contrast edges</label><label class="check"><input type="checkbox" data-setting="largeText"> Larger text</label></section><section><h2>Pilot controls</h2><p class="muted">Touch: press the world to place your joystick center, then drag from it to steer. Up flies; down drills. Return to center for neutral; lift to release.</p><p class="muted">Mouse: hold or drag toward your direction of travel. Hold above the rig to fly; below it to drill. Release to stop steering. Short taps inspect minerals or enter the nearby lander.</p><p class="muted">Arrows / WASD drive and drill; Up flies. Side drilling needs a ledge. A started cut finishes before ascent.</p><label class="check"><input type="checkbox" data-setting="showDirectionButtons"> Show direction buttons (fallback)</label><label class="check"><input type="checkbox" data-setting="drillToggle"> Toggle downward drilling</label><label class="check"><input type="checkbox" data-setting="braceToggle"> Toggle anchoring feet</label><details><summary>Keyboard bindings</summary><div id="campaign-bindings"></div><p id="campaign-remap-status" role="status"></p></details><p class="muted">Controller: left stick / D-pad drive, A thrust, X mobility, B / Y utilities, LB interact, RB map, Start pause.</p></section><section class="recovery-section"><h2>Recovery</h2><button data-command="recover">Request surface recovery</button><p class="muted">Carried cargo and relics are lost. Mission objects return to their marked sources. The recovery fee never creates debt.</p><button data-command="new">Start a new campaign</button><a href="?mode=legacy" id="campaign-legacy-link" class="quiet-link">Open Legacy mode →</a></section></div></dialog>
<dialog id="campaign-dock" class="campaign-panel dock-panel" aria-labelledby="campaign-dock-title"><header><div><p class="eyebrow">LANDER TERMINAL / W01</p><h1 id="campaign-dock-title">The restored lander</h1></div><div class="dock-heading-right"><strong id="campaign-dock-credits">20 CR</strong><button data-close="dock" class="return-button">Undock</button></div></header><nav aria-label="Lander services"><button data-tab="service">Service</button><button data-tab="hardware">Hardware</button><button data-tab="tools">Attachments</button><button data-tab="lander">Lander</button><button data-tab="cargo">Cargo</button></nav><div id="campaign-dock-content"></div><p id="campaign-dock-message" class="dock-feedback" role="status"></p></dialog>
<dialog id="campaign-map" class="campaign-panel map-panel" aria-labelledby="campaign-map-title"><header><div><p class="eyebrow">NAVIGATION ARCHIVE</p><h1 id="campaign-map-title">Navigation</h1></div><button data-close="map" class="return-button">Return to mine</button></header><p id="campaign-map-copy"></p><div id="campaign-map-worlds" class="world-cards"></div><p class="muted">Your rig, owned attachments, banked objectives and excavated routes persist. The next campaign chapter is under construction.</p></dialog>
<dialog id="campaign-confirm" class="campaign-confirm" aria-labelledby="campaign-confirm-title"><p class="eyebrow">EXPEDITION DECISION</p><h2 id="campaign-confirm-title"></h2><p id="campaign-confirm-copy"></p><p id="campaign-confirm-error" role="alert"></p><div><button id="campaign-confirm-cancel">Cancel</button><button id="campaign-confirm-accept" class="primary">Confirm</button></div></dialog>`;

$("campaign-menu-toggle").innerHTML =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18"><path fill="currentColor" d="M3 2h3v12H3zm7 0h3v12h-3z"/></svg>';
$("campaign-map-toggle").innerHTML = hudIcon("map");
const cargoSection = document.createElement("section");
cargoSection.innerHTML =
  '<h2>Cargo manifest</h2><div id="campaign-menu-cargo"></div>';
document.querySelector(".pause-grid")!.append(cargoSection);
const fullscreenButton = document.createElement("button");
fullscreenButton.id = "campaign-fullscreen";
fullscreenButton.textContent = "Enter fullscreen";
$("campaign-sound").after(fullscreenButton);
const replaceButton = document.createElement("button");
replaceButton.dataset.command = "replace";
replaceButton.textContent = "Save this run instead";
replaceButton.hidden = true;
document.querySelector(".action-grid")!.append(replaceButton);

const input = new CampaignInput(preferences, {
  blocked: () =>
    Boolean(overlay || confirmation || !initialized || launchUntil),
  interact: openDock,
  map: openMap,
  pause: () => {
    if (confirmation) {
      $("campaign-confirm-cancel").click();
      return;
    }
    if (overlay === "welcome") return;
    if (overlay) closeOverlay();
    else openOverlay("menu");
  },
  unlockAudio: () => {
    void audio.unlock();
  },
});
input.onRemapped = (message) => {
  $("campaign-remap-status").textContent = message;
  renderBindings();
};
applyPreferences();

function paused() {
  return Boolean(
    overlay || confirmation || !initialized || conflict || launchUntil,
  );
}
function presentationMessage(message: string) {
  // Routine cuts and collection answer beside the rig, not in a status paragraph.
  if (/^Salvaged auger installed| secured\. \d+\/| exposed\.$/.test(message))
    return "";
  return message
    .replace(
      "Wreck beacon surveyed. Bank three ore packages at the lander.",
      "Beacon surveyed · Return to the lander",
    )
    .replace(
      " recovered. Bank it safely at the lander.",
      " secured · Return to the lander",
    )
    .replace(". Its improvement is active now.", ".")
    .replace("Your current valid save becomes the backup.", "");
}
function showMessage(message: string) {
  const concise = presentationMessage(message);
  if (!concise) return;
  $("campaign-message").textContent = concise;
  messageUntil = performance.now() + 4000;
  $("campaign-message").classList.add("visible");
}
function openOverlay(kind: Exclude<typeof overlay, undefined>) {
  if (kind === "dock" && !campaign.atDock) {
    showMessage("Return to the lander's illuminated surface bay to dock.");
    return;
  }
  input.clear();
  for (const id of ["menu", "dock", "map", "welcome"] as const) {
    const dialog = $<HTMLDialogElement>("campaign-" + id);
    if (dialog.open) dialog.close();
  }
  overlay = kind;
  document.body.dataset.campaignOverlay = kind;
  if (kind === "dock") renderDock();
  if (kind === "menu") renderMenu();
  if (kind === "map") renderMap();
  $<HTMLDialogElement>("campaign-" + kind).showModal();
  audio.update(0, true, false, false);
}
function closeOverlay() {
  if (conflict) {
    showMessage(
      "Load the newer checkpoint or export this tab before continuing.",
    );
    return;
  }
  if (confirmation || overlay === "welcome") return;
  if (overlay) $<HTMLDialogElement>("campaign-" + overlay).close();
  overlay = undefined;
  delete document.body.dataset.campaignOverlay;
  input.clear();
  $("campaign-game").focus({ preventScroll: true });
  syncHUD();
}
function openDock() {
  if (!overlay && initialized) openOverlay("dock");
}
function openMap() {
  if (!campaign.state.progress.completed.includes(2)) {
    showMessage(
      "Recover the lander parts and fund M2 to restore the star map.",
    );
    return;
  }
  openOverlay("map");
}
function applyPreferences() {
  document.body.classList.toggle(
    "campaign-reduced-motion",
    preferences.reducedMotion,
  );
  document.body.classList.toggle(
    "campaign-high-contrast",
    preferences.highContrast,
  );
  document.body.classList.toggle("campaign-large-text", preferences.largeText);
  document.body.classList.toggle(
    "campaign-direction-buttons",
    preferences.showDirectionButtons,
  );
  document
    .querySelectorAll<HTMLInputElement>("[data-setting]")
    .forEach((element) => {
      element.checked = preferences[element.dataset.setting as "reducedMotion"];
    });
  document
    .querySelectorAll<HTMLInputElement>("[data-volume]")
    .forEach((element) => {
      element.value = String(
        Math.round(preferences[element.dataset.volume as "effects"] * 100),
      );
    });
  savePilotPreferences(preferences);
  audio.settings();
}
function renderBindings() {
  $("campaign-bindings").innerHTML = (
    Object.keys(ACTION_LABELS) as PilotAction[]
  )
    .map(
      (action) =>
        '<div class="binding-row"><span>' +
        ACTION_LABELS[action] +
        '</span><button data-remap="' +
        action +
        '">' +
        escape(preferences.keys[action].map(keyLabel).join(" / ")) +
        "</button></div>",
    )
    .join("");
}
function renderMenu() {
  replaceButton.hidden = !blocked;
  $("campaign-menu-cargo").innerHTML = campaign.cargo.length
    ? campaign.cargo
        .map(
          (item) =>
            '<article class="cargo-row"><div><strong>' +
            escape(item.name) +
            "</strong><small>" +
            item.bulk +
            " bulk · " +
            money(item.value) +
            "</small></div>" +
            button("eject:" + item.id, "Eject") +
            "</article>",
        )
        .join("")
    : '<p class="muted">The hold is empty.</p>';
  $("campaign-storage-notice").hidden = !blocked && !conflict;
  if (conflict)
    $("campaign-storage-notice").textContent =
      "Another tab saved a newer campaign. Load its checkpoint to continue; export this tab first if you want a separate copy.";
  const s = campaign.state;
  $("campaign-record").innerHTML =
    '<dl class="record-list"><dt>Credits</dt><dd>' +
    money(s.credits) +
    "</dd><dt>Deepest discovery</dt><dd>" +
    s.stats.largestDepth +
    " m</dd><dt>Milestones</dt><dd>" +
    s.progress.completed.length +
    " / 3</dd><dt>Stored cargo</dt><dd>" +
    campaign.warehouse.length +
    " packages</dd><dt>Banked mission objects</dt><dd>" +
    campaign.world.missions.filter((item) => item.status === "banked").length +
    " / 3</dd></dl>";
  document
    .querySelectorAll<HTMLButtonElement>('[data-command="restore"]')
    .forEach((button) => {
      button.disabled = busy || !backupAvailable;
    });
  renderBindings();
}
function actionKey(action: "mobility" | "interact") {
  if (matchMedia("(pointer: coarse)").matches || innerWidth <= 760)
    return action === "mobility" && !preferences.braceToggle ? "Hold" : "Tap";
  const controller = navigator.getGamepads?.().find((pad) => pad?.connected);
  if (controller)
    return controller.mapping === "standard"
      ? action === "mobility"
        ? "X"
        : "LB"
      : "";
  const binding = preferences.keys[action][0];
  return binding ? keyLabel(binding) : "";
}
function actionCaption(action: "mobility" | "interact") {
  const label = action === "mobility" ? "Mobility" : "Dock and trade";
  const key = actionKey(action);
  return key ? key + " · " + label : label;
}
function syncHUD() {
  const s = campaign.state,
    v = s.vehicle;
  $("campaign-energy").textContent =
    v.energy.toFixed(1) + " / " + campaign.maxEnergy;
  $("campaign-hull").textContent =
    Math.max(0, v.hull).toFixed(v.hull % 1 ? 1 : 0) + " / " + campaign.maxHull;
  $("campaign-cargo").textContent =
    campaign.cargoBulk + " / " + campaign.capacity;
  $("campaign-credits").textContent = formatCredits(s.credits);
  $("campaign-depth").textContent = campaign.depth + " m";
  $("campaign-haul").textContent = money(campaign.cargoValue);
  $("campaign-energy-fill").style.width =
    Math.max(0, (v.energy / campaign.maxEnergy) * 100) + "%";
  $("campaign-hull-fill").style.width =
    Math.max(0, (v.hull / campaign.maxHull) * 100) + "%";
  $("campaign-energy")
    .closest(".instrument")!
    .classList.toggle("critical", v.energy / campaign.maxEnergy <= 0.15);
  const objective = campaignMission(campaign);
  const objectiveKey = JSON.stringify(objective);
  if (objectiveKey !== previousObjective) {
    previousObjective = objectiveKey;
    $("campaign-objective-step").textContent = objective.step;
    $("campaign-objective-title").textContent = objective.title;
    $("campaign-objective-progress").innerHTML = objective.tasks
      .map(
        (task) =>
          '<li data-task="' +
          escape(task.id) +
          '" data-status="' +
          task.status +
          '"><span class="mission-status" aria-hidden="true">' +
          { pending: "○", carried: "↑", complete: "✓", ready: "◇" }[
            task.status
          ] +
          "</span><span>" +
          escape(task.label) +
          "</span></li>",
      )
      .join("");
    $("campaign-objective-next").textContent = objective.next;
    $("campaign-objective-reward").textContent = objective.reward;
  }
  $("campaign-dock-toggle").hidden =
    !campaign.atDock || Boolean(overlay || confirmation || launchUntil);
  $("campaign-dock-toggle").querySelector("strong")!.textContent = "Dock";
  const dockKey = $("campaign-dock-toggle").querySelector("span")!;
  dockKey.textContent = actionKey("interact").toUpperCase();
  dockKey.hidden = !dockKey.textContent;
  $("campaign-feet-button").querySelector("span")!.textContent =
    matchMedia("(pointer: coarse)").matches || innerWidth <= 760
      ? "MOBILITY"
      : actionCaption("mobility");
  $("campaign-feet-button").title = actionCaption("mobility");
  $("campaign-feet-button").setAttribute(
    "aria-label",
    preferences.braceToggle
      ? "Toggle anchoring feet"
      : "Hold to deploy anchoring feet",
  );
  $("campaign-dock-title").textContent = s.progress.completed.includes(3)
    ? "The restored lander"
    : "Salvage lander";
  $("campaign-drill-name").textContent = s.equipped.drill
    ? (W01_GEAR.find((item) => item.id === s.equipped.drill)?.name ??
      "Steel spindle")
    : "Steel spindle";
  $("campaign-mobility-name").textContent = s.equipped.mobility
    ? campaign.feetDeployed
      ? "Feet anchored"
      : "Anchoring feet"
    : "No attachment";
  $("campaign-processor-name").textContent = s.equipped.processor
    ? "External cargo rack"
    : "Open cargo bay";
  $<HTMLButtonElement>("campaign-feet-button").disabled =
    !s.equipped.mobility || Boolean(overlay);
  $("campaign-feet-button").setAttribute(
    "aria-pressed",
    String(campaign.feetDeployed),
  );
  $("campaign-feet-button").hidden = !s.equipped.mobility;
  document.querySelector<HTMLElement>(".processor-slot")!.hidden =
    !s.equipped.processor;
  $<HTMLButtonElement>("campaign-map-toggle").disabled =
    !s.progress.completed.includes(2) || Boolean(overlay);
  document.body.dataset.campaignPaused = String(paused());
  document.body.dataset.campaignBusy = String(busy);
  if (campaign.message !== previousMessage) {
    previousMessage = campaign.message;
    showMessage(campaign.message);
  }
  const reserve = v.energy / campaign.maxEnergy;
  const nextWarning =
    reserve <= 0.08 ? 3 : reserve <= 0.15 ? 2 : reserve <= 0.25 ? 1 : 0;
  if (!paused() && nextWarning > energyWarningBand) {
    showMessage(
      nextWarning === 3
        ? "Emergency reserve · return to the lander or request recovery in Menu."
        : nextWarning === 2
          ? "Energy low · return through your cleared route."
          : "Reserve at 25% · check your return route before cutting farther.",
    );
    audio.event("warning");
  }
  energyWarningBand = nextWarning;
  if (performance.now() >= messageUntil)
    $("campaign-message").classList.remove("visible");
  if (overlay === "dock")
    $("campaign-dock-message").textContent =
      presentationMessage(campaign.message) || "Lander uplink ready.";
}
function button(
  command: string,
  label: string,
  disabled = false,
  primary = false,
) {
  return (
    '<button data-command="' +
    escape(command) +
    '"' +
    (disabled || busy ? " disabled" : "") +
    (primary ? ' class="primary"' : "") +
    ">" +
    label +
    "</button>"
  );
}
function serviceReserve(filledBy?: HardwareKey) {
  return (
    (filledBy === "energy"
      ? 0
      : Math.ceil(
          Math.max(0, campaign.maxEnergy - campaign.state.vehicle.energy) * 10 -
            1e-8,
        )) +
    (filledBy === "hull"
      ? 0
      : Math.ceil(
          Math.max(0, campaign.maxHull - campaign.state.vehicle.hull) * 150 -
            1e-8,
        ))
  );
}
function renderDock() {
  const s = campaign.state;
  $("campaign-dock-credits").textContent = money(s.credits);
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((element) =>
      element.setAttribute(
        "aria-selected",
        String(element.dataset.tab === dockTab),
      ),
    );
  let html = "";
  if (dockTab === "service") {
    const stored = campaign.warehouse.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    html =
      '<div class="service-intro"><div><h2>Cargo transfer</h2><p>Mission objects stay protected.</p></div><div class="haul-summary"><span>ONBOARD + STORED</span><strong>' +
      money(campaign.cargoValue + stored) +
      "</strong><small>" +
      campaign.cargo.length +
      " carried · " +
      campaign.warehouse.length +
      ' banked</small></div></div><div class="service-cards"><article><span class="card-symbol">' +
      hudIcon("cargo") +
      "</span><h3>Unload hold</h3><p>Bank mission objects; sell minerals and relics.</p>" +
      button(
        "bank-sell",
        "Unload & sell",
        !campaign.cargo.length &&
          !campaign.warehouse.length &&
          !campaign.world.missions.some((item) => item.status === "carried"),
        true,
      ) +
      button(
        "bank",
        "Bank without sale",
        !campaign.cargo.length &&
          !campaign.world.missions.some((item) => item.status === "carried"),
      ) +
      '</article><article><span class="card-symbol energy-icon">' +
      hudIcon("energy") +
      "</span><h3>Energy reserve</h3><p>" +
      campaign.state.vehicle.energy.toFixed(1) +
      " / " +
      campaign.maxEnergy +
      " L · 1 CR per litre. Partial refuelling available.</p>" +
      button(
        "refuel",
        "Refuel · " +
          money(Math.ceil((campaign.maxEnergy - s.vehicle.energy) * 10)),
        s.vehicle.energy >= campaign.maxEnergy || s.credits <= 0,
      ) +
      '</article><article><span class="card-symbol hull-icon">' +
      hudIcon("hull") +
      "</span><h3>Hull repair</h3><p>" +
      s.vehicle.hull.toFixed(1) +
      " / " +
      campaign.maxHull +
      " HP · 15 CR per HP. Partial repairs available.</p>" +
      button(
        "repair",
        "Repair · " +
          money(Math.ceil((campaign.maxHull - s.vehicle.hull) * 150)),
        s.vehicle.hull >= campaign.maxHull || s.credits <= 0,
      ) +
      '</article></div><p class="reserve-copy">A full basic service currently costs ' +
      money(serviceReserve()) +
      ".</p>";
  } else if (dockTab === "hardware") {
    const labels: Record<HardwareKey, string> = {
      drill: "Steel auger assembly",
      energy: "Riveted reservoir",
      cargo: "Reinforced cargo bay",
      hull: "Bolted protection",
      engine: "Patched vector motor",
    };
    const units: Record<HardwareKey, string> = {
      drill: " speed",
      energy: " L",
      cargo: " bulk",
      hull: " HP",
      engine: " power",
    };
    html =
      '<h2>Rig systems</h2><div class="equipment-cards">' +
      HARDWARE_KEYS.map((key) => {
        const rank = s.hardware[key],
          next = rank + 1,
          price = HARDWARE_PRICES[key][next],
          unlocked = s.progress.completed.includes(1),
          maxed = rank >= 1;
        const preview =
          HARDWARE_LEVELS[key][rank] +
          units[key] +
          (maxed
            ? " · rank 1 installed"
            : " → " + HARDWARE_LEVELS[key][next] + units[key]);
        const afterService = s.credits - (price ?? 0) - serviceReserve(key);
        const reserve = Math.max(0, afterService);
        const reserveCopy =
          "Reserve after purchase/basic service: " +
          money(reserve) +
          (afterService < 0
            ? ". " +
              money(-afterService) +
              (s.credits < (price ?? 0)
                ? " more needed for purchase and full service."
                : " full-service shortfall after purchase.")
            : ".");
        return (
          "<article>" +
          hudIcon(
            key === "energy"
              ? "reservoir"
              : key === "cargo"
                ? "bay"
                : key === "hull"
                  ? "armor"
                  : key,
            "part-icon",
          ) +
          '<span class="eyebrow">' +
          key.toUpperCase() +
          " · " +
          (maxed ? "OWNED" : "RANK 1") +
          "</span><h3>" +
          labels[key] +
          '</h3><p class="upgrade-preview">' +
          preview +
          "</p><p>" +
          (key === "energy" || key === "hull"
            ? "Purchase fills the new capacity."
            : key === "engine"
              ? "More thrust and acceleration; movement energy rises slightly."
              : key === "cargo"
                ? "Carry more bulk. Package mass still affects handling."
                : "Cut faster and use less energy during each excavation.") +
          "</p><small>" +
          (maxed
            ? "Next rank: land on the comet or moon."
            : !unlocked
              ? "Blueprint: complete Survey the wreck."
              : reserveCopy) +
          "</small>" +
          button(
            "hardware-" + key,
            maxed ? "Installed" : "Purchase · " + money(price),
            maxed || !unlocked || s.credits < price,
            !maxed && unlocked && s.credits >= price,
          ) +
          "</article>"
        );
      }).join("") +
      "</div>";
  } else if (dockTab === "tools") {
    html =
      '<h2>Attachment mounts</h2><p class="muted">Change loadout at dock. Owned modules stay yours.</p><div class="equipment-cards">' +
      W01_GEAR.map((gear) => {
        const owned = s.ownedGear.includes(gear.id),
          equipped = Object.values(s.equipped).some(
            (item) =>
              item === gear.id ||
              (Array.isArray(item) && item.includes(gear.id)),
          ),
          available =
            !gear.milestone || s.progress.completed.includes(gear.milestone),
          prerequisite = !gear.requires || s.ownedGear.includes(gear.requires);
        return (
          "<article>" +
          hudIcon(
            gear.id === "W01-R1"
              ? "drill"
              : gear.id === "W01-R2"
                ? "feet"
                : "rack",
            "part-icon",
          ) +
          '<span class="eyebrow">' +
          gear.slot.toUpperCase() +
          " · " +
          (owned ? (equipped ? "EQUIPPED" : "OWNED") : "LOCAL TECHNOLOGY") +
          "</span><h3>" +
          escape(gear.name) +
          "</h3><p>" +
          escape(gear.description) +
          "</p><small>" +
          (!available
            ? "Unlock: complete M" + gear.milestone + "."
            : !prerequisite
              ? "Requires ownership of the preceding attachment."
              : "Slot: " + gear.slot + ". Switching is free at dock.") +
          "</small>" +
          (owned
            ? button(
                "gear-toggle-" + gear.id,
                equipped ? "Unequip" : "Equip",
                false,
                !equipped,
              )
            : button(
                "gear-buy-" + gear.id,
                "Purchase · " + money(gear.price),
                !available || !prerequisite || s.credits < gear.price,
                available && prerequisite && s.credits >= gear.price,
              )) +
          "</article>"
        );
      }).join("") +
      "</div>";
  } else if (dockTab === "lander") {
    html =
      '<h2>Lander restoration</h2><div class="milestone-cards">' +
      W01_MILESTONES.map((milestone) => {
        const complete = s.progress.completed.includes(milestone.id),
          current = campaign.currentMilestone?.id === milestone.id;
        return (
          '<article class="' +
          (complete ? "complete" : current ? "current" : "locked") +
          '"><span class="milestone-number">0' +
          milestone.id +
          '</span><div><span class="eyebrow">' +
          (complete
            ? "CONSTRUCTION COMPLETE"
            : current
              ? "CURRENT PROJECT"
              : "NEXT PROJECT") +
          "</span><h3>" +
          milestone.name +
          "</h3><p>" +
          milestone.description +
          "</p>" +
          (complete
            ? '<strong class="complete-label">✓ Installed and banked</strong>'
            : current
              ? "<p>" +
                (campaign.missionReady
                  ? "Objective discoveries are safely banked."
                  : "Complete and bank the required discoveries first.") +
                "</p>" +
                button(
                  "milestone",
                  "Fund construction · " + money(milestone.fee),
                  !campaign.missionReady || s.credits < milestone.fee,
                  campaign.missionReady && s.credits >= milestone.fee,
                )
              : "<small>Complete the preceding project to begin.</small>") +
          "</div></article>"
        );
      }).join("") +
      "</div>" +
      (s.progress.completed.includes(3)
        ? '<div class="departure-card"><h3>The lander is ready.</h3><p>Your next destinations are the Ice comet and Fractured moon. Launch to bank your Frontier departure.</p>' +
          button(
            "depart",
            s.progress.departed
              ? "Departure recorded · view star map"
              : "Launch the restored lander",
            false,
            true,
          ) +
          "</div>"
        : "");
  } else {
    const carriedMissions = campaign.world.missions.filter(
      (item) => item.status === "carried",
    );
    html =
      '<h2>Cargo manifest</h2><div class="cargo-columns"><section><h3>Onboard · ' +
      campaign.cargoBulk +
      " / " +
      campaign.capacity +
      " bulk</h3>" +
      (campaign.cargo.length
        ? campaign.cargo
            .map(
              (item) =>
                '<article class="cargo-row"><div><strong>' +
                escape(item.name) +
                "</strong><small>" +
                item.bulk +
                " bulk · mass " +
                item.mass +
                " · " +
                money(item.value) +
                "</small></div>" +
                button("eject:" + item.id, "Eject") +
                "</article>",
            )
            .join("")
        : '<p class="muted">Your cargo bay is empty.</p>') +
      "</section><section><h3>Warehouse · " +
      campaign.warehouse.length +
      " packages</h3><p>Stored value: " +
      money(campaign.warehouse.reduce((total, item) => total + item.value, 0)) +
      "</p>" +
      button("sell", "Sell stored cargo", !campaign.warehouse.length) +
      "<h3>Protected mission compartment</h3>" +
      (carriedMissions.length
        ? carriedMissions
            .map(
              (item) => "<p>□ " + escape(item.name) + " · return to bank</p>",
            )
            .join("")
        : '<p class="muted">No unbanked mission objects onboard.</p>') +
      button(
        "bank",
        "Bank carried cargo and missions",
        !campaign.cargo.length && !carriedMissions.length,
      ) +
      "</section></div>";
  }
  $("campaign-dock-content").innerHTML = html;
  $("campaign-dock-message").textContent =
    presentationMessage(campaign.message) || "Lander uplink ready.";
}
function renderMap() {
  const complete = campaign.state.progress.completed.includes(3);
  $("campaign-map-copy").textContent = complete
    ? "The Frontier certificate opens either route. These destinations are charted for the next campaign chapter."
    : "Restore the navigation core and finish the lander to open either route.";
  $("campaign-map-worlds").innerHTML = WORLD_CATALOG.slice(0, 3)
    .map(
      (world) =>
        '<article class="world-card world-' +
        world.id.toLowerCase() +
        '"><div class="planet-symbol"></div><p class="eyebrow">' +
        world.id +
        " · " +
        (world.id === "W01"
          ? "CURRENT DESTINATION"
          : complete
            ? "CHARTED"
            : "LOCKED") +
        "</p><h2>" +
        world.name +
        "</h2><p>" +
        (world.id === "W01"
          ? "Mine, recover and return to your established routes."
          : world.id === "W02"
            ? "A frozen frontier of volatile crystals and careful extraction."
            : "Read the faults. Secure a route through unstable stone.") +
        "</p><small>" +
        (world.id === "W01"
          ? campaign.state.progress.completed.length + "/3 milestones complete"
          : !complete
            ? "Requires: restore the W01 lander"
            : "Next campaign chapter · not yet available") +
        "</small></article>",
    )
    .join("");
}
async function persist(announce = false) {
  if (blocked || conflict || !initialized) {
    if (announce)
      showMessage(
        "Saving is protected. Export this run or review checkpoint recovery in Menu.",
      );
    return false;
  }
  if (savePromise) return savePromise;
  const snapshot = structuredClone(campaign.state);
  busy = true;
  syncHUD();
  savePromise = store
    .save(snapshot)
    .then(() => {
      backupAvailable ||= store.revision > 1;
      $("campaign-save-status").textContent =
        "Checkpoint saved on this device.";
      if (announce) showMessage("Campaign checkpoint saved.");
      return true;
    })
    .catch((error) => {
      handleSaveError(error);
      return false;
    })
    .finally(() => {
      busy = false;
      savePromise = undefined;
      syncHUD();
      if (overlay === "dock") renderDock();
    });
  return savePromise;
}
function handleSaveError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The campaign could not be saved. Export a file to keep your progress.";
  $("campaign-save-status").textContent = message;
  $("campaign-storage-notice").textContent = message;
  $("campaign-storage-notice").hidden = false;
  blocked = true;
  if (error instanceof CampaignSaveError && error.code === "conflict") {
    conflict = true;
    openOverlay("menu");
  }
  showMessage(message);
}
async function loadCheckpoint() {
  if (busy) return;
  busy = true;
  try {
    const loaded = await store.load();
    if (loaded.state) {
      campaign = new Campaign(loaded.state);
      lastMined = campaign.state.stats.mined;
      lastHull = campaign.state.vehicle.hull;
    }
    blocked = loaded.blocked;
    backupAvailable = loaded.backupAvailable;
    conflict = false;
    $("campaign-save-status").textContent =
      loaded.notice ||
      (loaded.state ? "Checkpoint loaded." : "No saved campaign yet.");
    $("campaign-storage-notice").textContent = loaded.notice || "";
    showMessage(
      loaded.state
        ? "Campaign checkpoint loaded."
        : "No saved campaign was found.",
    );
  } catch (error) {
    handleSaveError(error);
  } finally {
    busy = false;
    renderMenu();
    syncHUD();
  }
}
function ask(
  title: string,
  copy: string,
  operation: () => Promise<void> | void,
) {
  input.clear();
  confirmReturn = overlay;
  confirmation = operation;
  $("campaign-confirm-title").textContent = title;
  $("campaign-confirm-copy").textContent = copy;
  $("campaign-confirm-error").textContent = "";
  $<HTMLDialogElement>("campaign-confirm").showModal();
  syncHUD();
}
async function replaceCampaign(state: CampaignState) {
  if (savePromise) await savePromise;
  busy = true;
  try {
    await store.replace(state);
    campaign = new Campaign(state);
    blocked = false;
    conflict = false;
    backupAvailable = true;
    saveTimer = 0;
    $("campaign-save-status").textContent = "Campaign checkpoint replaced.";
  } finally {
    busy = false;
    syncHUD();
  }
}
async function transact(
  operation: () => boolean,
  event: "pickup" | "build" | "purchase" = "purchase",
) {
  if (busy || conflict) return;
  const changed = operation();
  if (changed) {
    audio.event(event);
    await persist();
  }
  syncHUD();
  if (overlay === "dock") renderDock();
  if (overlay === "menu") renderMenu();
}
async function command(name: string) {
  if (name === "export") {
    try {
      const raw = store.export(campaign.state),
        url = URL.createObjectURL(
          new Blob([raw], { type: "application/json" }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = "motherload-campaign-" + campaign.state.seed + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $("campaign-save-status").textContent =
        "Campaign exported. Keep the file to continue on another device.";
    } catch (error) {
      handleSaveError(error);
    }
    return;
  }
  if (busy) return;
  if (name === "save") {
    await persist(true);
    return;
  }
  if (name === "load") {
    await loadCheckpoint();
    return;
  }
  if (name === "import") {
    $<HTMLInputElement>("campaign-import").click();
    return;
  }
  if (name === "map") {
    openMap();
    return;
  }
  if (name === "restore") {
    ask(
      "Restore the backup?",
      "Your current valid campaign becomes the backup. Export first if you want a separate copy.",
      async () => {
        const state = await store.restoreBackup();
        campaign = new Campaign(state);
        blocked = false;
        conflict = false;
        showMessage("Backup restored.");
      },
    );
    return;
  }
  if (name === "replace") {
    ask(
      "Save this run instead?",
      "This explicitly replaces the latest saved campaign with this tab's progress. Its current valid checkpoint becomes the backup. Export first to retain a separate copy.",
      async () => {
        const current = structuredClone(campaign.state);
        await store.load();
        await replaceCampaign(current);
        showMessage("This campaign is now the saved checkpoint.");
      },
    );
    return;
  }
  if (name === "new") {
    ask(
      "Begin a new campaign?",
      "This replaces the campaign checkpoint with a new asteroid. The prior valid campaign becomes a backup. Your Legacy mine is unaffected.",
      async () => {
        await replaceCampaign(createCampaign(seed()));
        showMessage("New asteroid expedition ready.");
      },
    );
    return;
  }
  if (name === "recover") {
    ask(
      "Call surface recovery?",
      "Carried ordinary cargo and relics are lost. Unbanked mission objects return safely. The crew charges a bounded fee and restores half your energy and hull.",
      async () => {
        campaign.recover();
        await persist();
      },
    );
    return;
  }
  if (name === "bank-sell") {
    await transact(() => {
      const banked = campaign.bank();
      const sold = campaign.sell();
      return banked || sold;
    }, "pickup");
    return;
  }
  if (name === "bank") {
    await transact(() => campaign.bank(), "pickup");
    return;
  }
  if (name === "sell") {
    await transact(() => campaign.sell(), "pickup");
    return;
  }
  if (name === "refuel") {
    await transact(() => campaign.refuel());
    return;
  }
  if (name === "repair") {
    await transact(() => campaign.repair());
    return;
  }
  if (name === "milestone") {
    await transact(() => campaign.payMilestone(), "build");
    return;
  }
  if (name === "depart") {
    if (campaign.state.progress.departed) {
      openMap();
      return;
    }
    ask(
      "Launch the restored lander?",
      "Your Frontier certificate and all progress remain permanent. Chart the comet and moon for the next campaign chapter.",
      async () => {
        if (!campaign.depart()) throw new Error(campaign.message);
        await persist();
        launchUntil =
          performance.now() + (preferences.reducedMotion ? 800 : 2400);
        $("campaign-launch").hidden = false;
        closeDockAfterConfirmation();
      },
    );
    return;
  }
  if (name.startsWith("hardware-")) {
    await transact(() => campaign.buyHardware(name.slice(9) as HardwareKey));
    return;
  }
  if (name.startsWith("gear-buy-")) {
    await transact(() => campaign.buyGear(name.slice(9)));
    return;
  }
  if (name.startsWith("gear-toggle-")) {
    await transact(() => campaign.toggleGear(name.slice(12)));
    return;
  }
  if (name.startsWith("eject:")) {
    await transact(() => campaign.eject(name.slice(6)), "pickup");
  }
}
function closeDockAfterConfirmation() {
  if (overlay) $<HTMLDialogElement>("campaign-" + overlay).close();
  overlay = undefined;
  delete document.body.dataset.campaignOverlay;
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  );
  if (!target) return;
  if (target.dataset.command) {
    void command(target.dataset.command);
    return;
  }
  if (target.dataset.tab) {
    dockTab = target.dataset.tab;
    renderDock();
    return;
  }
  if (target.dataset.close) {
    closeOverlay();
    return;
  }
  if (target.dataset.remap) input.remap(target.dataset.remap as PilotAction);
});
$("campaign-menu-toggle").onclick = () => openOverlay("menu");
$("campaign-dock-toggle").onclick = openDock;
$("campaign-map-toggle").onclick = openMap;
$("campaign-start").onclick = async () => {
  overlay = undefined;
  delete document.body.dataset.campaignOverlay;
  $<HTMLDialogElement>("campaign-welcome").close();
  $("campaign-game").focus();
  await persist();
  syncHUD();
};
$("campaign-confirm-cancel").onclick = () => {
  if (busy || confirmBusy) return;
  confirmation = undefined;
  $<HTMLDialogElement>("campaign-confirm").close();
  overlay = confirmReturn;
  syncHUD();
};
$("campaign-confirm-accept").onclick = async () => {
  if (!confirmation || busy || confirmBusy) return;
  confirmBusy = true;
  $<HTMLButtonElement>("campaign-confirm-accept").disabled = true;
  $<HTMLButtonElement>("campaign-confirm-cancel").disabled = true;
  const operation = confirmation;
  try {
    await operation();
    confirmation = undefined;
    $<HTMLDialogElement>("campaign-confirm").close();
    if (overlay === "dock") renderDock();
    if (overlay === "menu") renderMenu();
    syncHUD();
  } catch (error) {
    $("campaign-confirm-error").textContent =
      error instanceof Error
        ? error.message
        : "This action could not be completed.";
  } finally {
    confirmBusy = false;
    $<HTMLButtonElement>("campaign-confirm-accept").disabled = false;
    $<HTMLButtonElement>("campaign-confirm-cancel").disabled = false;
  }
};
for (const name of ["menu", "dock", "map", "welcome"] as const) {
  $<HTMLDialogElement>("campaign-" + name).addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      closeOverlay();
    },
  );
}
$<HTMLDialogElement>("campaign-confirm").addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!busy) $("campaign-confirm-cancel").click();
});
$<HTMLInputElement>("campaign-import").onchange = async (event) => {
  const field = event.currentTarget as HTMLInputElement,
    file = field.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_CAMPAIGN_BYTES)
      throw new Error("This campaign file is too large.");
    const state = store.inspectImport(await file.text());
    ask(
      "Import this campaign?",
      "Replace the current campaign with " +
        money(state.credits) +
        " and " +
        state.progress.completed.length +
        " completed asteroid milestones? Your current valid save becomes the backup.",
      () => replaceCampaign(state),
    );
  } catch (error) {
    $("campaign-save-status").textContent =
      error instanceof Error
        ? error.message
        : "This campaign file could not be imported.";
  } finally {
    field.value = "";
  }
};
$("campaign-sound").onclick = async () => {
  audio.muted = !audio.muted;
  $("campaign-sound").textContent = audio.muted ? "Enable sound" : "Mute sound";
  $("campaign-sound").setAttribute("aria-pressed", String(!audio.muted));
  if (!audio.muted) await audio.unlock();
  audio.settings();
};
fullscreenButton.onclick = async () => {
  input.clear();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showMessage("Fullscreen is unavailable in this browser window.");
  }
};
document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement
    ? "Exit fullscreen"
    : "Enter fullscreen";
});
document
  .querySelectorAll<HTMLInputElement>("[data-setting]")
  .forEach((field) => {
    field.onchange = () => {
      const key = field.dataset.setting as "reducedMotion";
      preferences[key] = field.checked;
      input.clear();
      applyPreferences();
    };
  });
document
  .querySelectorAll<HTMLInputElement>("[data-volume]")
  .forEach((field) => {
    field.oninput = () => {
      preferences[field.dataset.volume as "effects"] =
        Number(field.value) / 100;
      savePilotPreferences(preferences);
      audio.settings();
    };
  });
$("campaign-legacy-link").onclick = async (event) => {
  event.preventDefault();
  await persist();
  location.assign("?mode=legacy");
};
function background() {
  input.clear();
  if (initialized && !overlay && !confirmation && !launchUntil)
    openOverlay("menu");
  void persist();
}
window.addEventListener("blur", background);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) background();
});
window.addEventListener("pagehide", () => {
  void persist();
  audio.update(0, true, false, false);
});
store.subscribe(() => {
  conflict = true;
  blocked = true;
  input.clear();
  if (initialized) openOverlay("menu");
});

async function boot() {
  const loaded = await store.load();
  if (loaded.state) {
    campaign = new Campaign(loaded.state);
    overlay = undefined;
  }
  blocked = loaded.blocked;
  backupAvailable = loaded.backupAvailable;
  initialized = true;
  lastMined = campaign.state.stats.mined;
  lastHull = campaign.state.vehicle.hull;
  $("campaign-save-status").textContent =
    loaded.notice ||
    (loaded.state ? "Campaign checkpoint loaded." : "A new frontier awaits.");
  if (loaded.notice) {
    $("campaign-storage-notice").textContent = loaded.notice;
    overlay = "menu";
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "campaign-game",
    width: $("campaign-game").clientWidth,
    height: $("campaign-game").clientHeight,
    backgroundColor: "#17232b",
    scene: createCampaignScene({
      getCampaign: () => campaign,
      getInterfaceMode: () => overlay,
      getDockBounds: () => {
        const dialog = $<HTMLDialogElement>("campaign-dock");
        if (!dialog.open) return undefined;
        const r = dialog.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      },
      isPaused: paused,
      getControls: () => input.getControls(),
      onInteract: openDock,
      onPilotGesture: () => {
        void audio.unlock();
      },
      reducedMotion: () => preferences.reducedMotion,
      onUpdate: (dt: number) => {
        input.pollCommands();
        audio.update(
          dt,
          paused(),
          campaign.drillProgress > 0,
          campaign.thrusting,
        );
        if (!paused()) {
          saveTimer += dt;
          if (saveTimer >= 5) {
            saveTimer = 0;
            void persist();
          }
        }
        if (campaign.state.stats.mined > lastMined) {
          audio.event("pickup");
          lastMined = campaign.state.stats.mined;
        }
        if (campaign.state.vehicle.hull < lastHull) audio.event("warning");
        lastHull = campaign.state.vehicle.hull;
        if (launchUntil && performance.now() >= launchUntil) {
          launchUntil = 0;
          $("campaign-launch").hidden = true;
          openOverlay("map");
        }
        hudTimer += dt;
        if (hudTimer >= 0.1 || paused()) {
          hudTimer = 0;
          syncHUD();
        }
      },
    }),
    render: { antialias: true },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    input: { keyboard: false },
    fps: { smoothStep: false },
    banner: false,
    audio: { noAudio: true },
  });
  new ResizeObserver(() => {
    const host = $("campaign-game");
    if (host.clientWidth && host.clientHeight) {
      game.canvas.style.width = host.clientWidth + "px";
      game.canvas.style.height = host.clientHeight + "px";
      game.scale.resize(host.clientWidth, host.clientHeight);
    }
  }).observe($("campaign-game"));
  if (overlay) openOverlay(overlay);
  else $("campaign-game").focus();
  syncHUD();
}
void boot().catch((error) => {
  $("campaign-message").textContent =
    error instanceof Error ? error.message : "The campaign could not start.";
  $("campaign-message").classList.add("visible");
});
