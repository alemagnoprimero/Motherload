import Phaser from "phaser";
import { Campaign, createCampaign } from "./model";
import { createCampaignScene } from "./scene";
import {
  CampaignSaveError,
  CampaignStore,
  MAX_CAMPAIGN_BYTES,
  type CampaignArchive,
} from "./persistence";
import {
  HARDWARE_KEYS,
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
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
  type MenuAction,
} from "./input";
import { CampaignAudio } from "./audio";
import { campaignMission } from "./missions";
import { campaignSignal } from "./poi";
import { W02_ORES } from "./frontier";
import { CAMPAIGN_ORE_LEGEND, CAMPAIGN_HAZARD_LEGEND } from "../mineral-legend";
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
  thermal: new URL(
    "../../assets/campaign/generated/w02-icons/w02-r1-icon-64.png",
    import.meta.url,
  ).href,
  condenser: new URL(
    "../../assets/campaign/generated/w02-icons/w02-r2-icon-64.png",
    import.meta.url,
  ).href,
  preservation: new URL(
    "../../assets/campaign/generated/w02-icons/w02-r3-icon-64.png",
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
let messageHoldUntil = 0;
let messagePriority = 0;
let lastCargoBulk = 0;
let energyPulseUntil = 0;
let undockCheck = false;
let archives: CampaignArchive[] = [];
let archivesRequest: Promise<void> | undefined;
let archivesKey = "";
let confirmation: (() => Promise<void> | void) | undefined;
let confirmBusy = false;
let storageConflictEpoch = 0;
let confirmReturn: Overlay;
let dockAfterConfirmation = false;
let launchUntil = 0;
let lastMined = 0,
  lastHull = 10;
let energyWarningBand = 0;
let previousObjective = "";
let resumeRequired = false;
let restoring = false;
let menuAfterConfirmation = false;
let lastSavedAt: number | undefined;
let lastSaveWasAutomatic = true;
let signalCampaign: Campaign | undefined;
let signalRecovery = -1;
let signalWorld = "";
let legendWorld = "";
const announcedSignalBands = new Map<string, number>();

$("app").innerHTML = `
<main class="campaign-shell" aria-label="Motherload campaign">
  <div id="campaign-game" tabindex="0" role="application" aria-label="Mining expedition. Touch places a floating joystick: drag from its center to steer, up to fly, down to drill. Mouse holds steer relative to the rig. Tap minerals to inspect. Arrows or WASD drive and drill, Up flies, E enters the lander, Space braces, Escape pauses." aria-busy="true"></div>
  <div class="campaign-hud" aria-label="Vehicle conditions">
    <section class="instrument instrument-left" aria-label="Energy and hull">
      <div class="vital energy-vital">${hudIcon("energy")}<div><div class="instrument-row"><span>ENERGY</span><strong id="campaign-energy">10 / 10</strong></div><div class="meter energy-meter"><i id="campaign-energy-fill"></i></div></div></div>
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
  <section class="campaign-objective" aria-label="Stage mission">${hudIcon("mission")}<div class="objective-copy"><div class="mission-heading"><span id="campaign-objective-step">01 / 03</span><strong id="campaign-objective-title">Survey the wreck</strong></div><ul id="campaign-objective-progress" aria-label="Mission goals"></ul><div id="campaign-mission-signal" class="mission-signal" role="group" aria-label="Mission locator" hidden><span id="campaign-signal-direction" class="signal-direction" aria-hidden="true"></span><span id="campaign-signal-direction-label" class="sr-only"></span><strong id="campaign-signal-target"></strong><span id="campaign-signal-distance"></span><span id="campaign-signal-proximity" class="signal-proximity"></span></div><p id="campaign-objective-next"></p><small id="campaign-objective-reward"></small></div></section>
  <div id="campaign-message" class="campaign-message" role="status"></div>
  <section id="campaign-extraction" class="campaign-extraction" role="group" aria-label="Extraction and environment" hidden><div><strong id="campaign-extraction-title"></strong><p id="campaign-extraction-copy"></p></div><span id="campaign-extraction-time" aria-hidden="true"></span><button data-command="release-volatile" id="campaign-release-drill">Release drill</button></section>
  <div id="campaign-danger" class="campaign-danger" role="alert" aria-atomic="true" hidden></div>
  <section id="campaign-disabled" class="campaign-disabled" aria-labelledby="campaign-disabled-title" hidden><h2 id="campaign-disabled-title">Rig disabled</h2><p id="campaign-disabled-copy"></p><button id="campaign-disabled-recover" data-command="recover" class="primary">Request recovery</button><button id="campaign-disabled-dock" data-command="disabled-dock" hidden>Lander services</button><button id="campaign-disabled-menu" type="button">Pause / save</button></section>
  <button id="campaign-dock-toggle" class="campaign-context" hidden><span class="interaction-key" aria-hidden="true">E</span><strong>Dock and trade</strong></button>
  <div class="campaign-toolbar" aria-label="Equipped attachments">
    <div class="tool-slot drill-slot" title="Active drill">${hudIcon("drill")}<div><span>DRILL</span><strong id="campaign-drill-name">Salvaged auger</strong></div></div>
    <button id="campaign-feet-button" class="tool-slot mobility-slot" data-dir="mobility" aria-label="Hold to deploy anchoring feet">${hudIcon("feet")}<div><span>MOBILITY</span><strong id="campaign-mobility-name">No attachment</strong></div></button>
    <button id="campaign-precision-button" class="tool-slot precision-slot" data-dir="primary" aria-label="Hold precision extraction" hidden>${hudIcon("preservation")}<div><span id="campaign-precision-key">HOLD Q</span><strong>Precision</strong></div></button>
    <div class="tool-slot utility-slot" title="Automatic drilling energy recovery" hidden>${hudIcon("condenser")}<div><span>UTILITY</span><strong id="campaign-utility-name">Condenser active</strong></div></div>
    <div class="tool-slot processor-slot" title="Processor">${hudIcon("rack")}<div><span>PROCESSOR</span><strong id="campaign-processor-name">Open cargo bay</strong></div></div>
    <button id="campaign-map-toggle" class="map-slot" aria-label="Open star map" title="Star map">${hudIcon("map")}</button>
  </div>
  <div class="campaign-touch" aria-label="Optional direction buttons"><div><button data-dir="left" aria-label="Steer left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h13"/></svg></button><button data-dir="right" aria-label="Steer right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7M17 12H4"/></svg></button></div><div><button data-dir="down" aria-label="Drill downward"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 10 7 7 7-7M12 17V4m-5 17h10"/></svg></button><button data-dir="up" aria-label="Thrust upward"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 14 7-7 7 7M12 7v13"/></svg></button></div></div>
  <div id="campaign-launch" class="campaign-launch" hidden><span class="eyebrow">FRONTIER CERTIFICATE SECURED</span><h1>Course charted.</h1><p>Ice comet / Fractured moon</p></div>
</main>
<dialog id="campaign-welcome" class="campaign-welcome" aria-labelledby="campaign-welcome-title"><div class="title-screen"><p class="eyebrow">THE FRONTIER</p><h1 id="campaign-welcome-title">MOTHERLOAD</h1><p class="title-location">BROKEN ASTEROID <span>600 m</span></p><p class="title-mission">Recover the core. Restore the lander.</p><button id="campaign-start" class="primary">Deploy rig <span aria-hidden="true">›</span></button><p class="welcome-hint">Touch: press to place your joystick, then drag.<br>Up flies · Down drills · Mouse or Arrows / WASD</p></div></dialog>
<dialog id="campaign-menu" class="campaign-panel" aria-labelledby="campaign-menu-title"><header><div><p class="eyebrow">PILOT CONSOLE</p><h1 id="campaign-menu-title">Paused</h1></div><div class="menu-heading-actions"><button id="campaign-menu-recover" data-command="recover" class="primary" hidden>Request recovery</button><button id="campaign-menu-dock" data-command="disabled-dock" hidden>Lander services</button><button id="campaign-resume" data-close="menu" class="return-button">Resume expedition</button></div><p id="campaign-pause-conditions" class="campaign-pause-conditions" aria-label="Vehicle conditions"></p></header><p id="campaign-menu-recovery-preview" class="menu-recovery-preview" hidden></p><div id="campaign-storage-notice" class="campaign-notice" hidden role="alert"></div><div class="pause-grid"><section><h2>Checkpoint</h2><p id="campaign-save-status" role="status">Preparing checkpoint…</p><p id="campaign-autosave-status" role="status">Progress saves in this browser only.</p><p class="muted">Load replaces this session with the latest saved checkpoint, including autosaves. Restored expeditions wait for Resume.</p><div class="action-grid"><button data-command="save">Save checkpoint</button><button data-command="load">Load latest autosave</button><button data-command="export">Export campaign</button><button data-command="import">Import campaign</button><button data-command="restore">Restore backup</button></div><input id="campaign-import" type="file" accept="application/json,.json" hidden></section><section><h2>Flight record</h2><div id="campaign-record"></div><button data-command="map">Star map</button></section><section><h2>Systems</h2><button id="campaign-sound">Enable sound</button><label>Effects <input type="range" data-volume="effects" min="0" max="100"></label><label>Ambience <input type="range" data-volume="ambience" min="0" max="100"></label><label>Music <input type="range" data-volume="music" min="0" max="100"></label><label class="check"><input type="checkbox" data-setting="reducedMotion"> Reduced motion</label><label class="check"><input type="checkbox" data-setting="highContrast"> High-contrast edges</label><label class="check"><input type="checkbox" data-setting="largeText"> Larger text</label></section><section><h2>Pilot controls</h2><p class="muted">Touch: press the world to place your joystick center, then drag from it to steer. Up flies; down drills. Return to center for neutral; lift to release.</p><p class="muted">Mouse: hold or drag toward your direction of travel. Hold above the rig to fly; below it to drill. Release to stop steering. Short taps inspect minerals or enter the nearby lander.</p><p class="muted">Arrows / WASD drive and drill; Up flies. Side drilling needs a ledge. A started cut finishes before ascent. On the Ice comet, release drilling when a volatile cut completes to preserve it. With drilling toggle, press Down again or use Release drill. Hold the primary utility action (Q by default) while beginning a cut to use an equipped preservation chamber.</p><label class="check"><input type="checkbox" data-setting="showDirectionButtons"> Show direction buttons (fallback)</label><label class="check"><input type="checkbox" data-setting="drillToggle"> Toggle downward drilling</label><label class="check"><input type="checkbox" data-setting="braceToggle"> Toggle anchoring feet</label><details><summary>Keyboard bindings</summary><div id="campaign-bindings"></div><p id="campaign-remap-status" role="status"></p></details><p class="muted">Controller: left stick / D-pad drive, A thrust, X mobility, B / Y utilities, LB interact, RB map, Start pause. Menus: D-pad selects, A activates, B returns.</p></section><section class="recovery-section"><h2>Recovery</h2><button data-command="recover">Request recovery</button><p class="muted">The first disabled-rig tow in each world is free and keeps carried cargo. Voluntary recovery and later tows lose cargo, return mission objects to their sources and charge a fee without creating debt.</p><button data-command="new">Start a new campaign</button></section></div></dialog>
<dialog id="campaign-dock" class="campaign-panel dock-panel" aria-labelledby="campaign-dock-title"><header><div><p id="campaign-dock-location" class="eyebrow">LANDER TERMINAL / W01</p><h1 id="campaign-dock-title">The restored lander</h1></div><div class="dock-heading-right"><strong id="campaign-dock-credits">20 CR</strong><button data-close="dock" class="return-button">Undock</button></div></header><nav aria-label="Lander services"><button data-tab="service">Service</button><button data-tab="hardware">Hardware</button><button data-tab="tools">Attachments</button><button data-tab="lander">Lander</button><button data-tab="cargo">Cargo</button><button id="campaign-dock-navigation" data-command="map" hidden>Navigation</button></nav><div id="campaign-dock-content"></div><p id="campaign-dock-message" class="dock-feedback" role="status"></p></dialog>
<dialog id="campaign-map" class="campaign-panel map-panel" aria-labelledby="campaign-map-title"><header><div><p class="eyebrow">NAVIGATION ARCHIVE</p><h1 id="campaign-map-title">Navigation</h1></div><button data-close="map" class="return-button">Return to mine</button></header><p id="campaign-map-copy"></p><div id="campaign-map-worlds" class="world-cards"></div><p class="muted">Travel banks carried cargo and mission objects before departure. Your rig, credits, owned attachments and excavated routes persist. Travel does not refuel or repair.</p></dialog>
<dialog id="campaign-confirm" class="campaign-confirm" aria-labelledby="campaign-confirm-title" aria-describedby="campaign-confirm-copy"><p class="eyebrow">EXPEDITION DECISION</p><h2 id="campaign-confirm-title"></h2><p id="campaign-confirm-copy"></p><p id="campaign-confirm-error" role="alert"></p><div><button id="campaign-confirm-cancel">Cancel</button><button id="campaign-confirm-accept" class="primary">Confirm</button></div></dialog>`;

$("campaign-menu-toggle").innerHTML =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18"><path fill="currentColor" d="M3 2h3v12H3zm7 0h3v12h-3z"/></svg>';
$("campaign-map-toggle").innerHTML = hudIcon("map");
const cargoSection = document.createElement("section");
cargoSection.innerHTML =
  '<h2>Cargo manifest</h2><div id="campaign-menu-cargo"></div>';
document.querySelector(".pause-grid")!.append(cargoSection);
const legendSection = document.createElement("section");
legendSection.innerHTML =
  '<details id="campaign-legend"><summary>Ore and hazard legend</summary><ul id="campaign-legend-list" class="campaign-legend-list"></ul></details>';
document.querySelector(".pause-grid")!.append(legendSection);
function renderLegend() {
  const comet = campaign.state.currentWorld === "W02";
  const patterns = [
    "Low chipped cluster",
    "Paired elongated facets",
    "Three-point radial crystal · volatile",
    "Hollow geometric crown · volatile",
  ];
  const ores = comet
    ? W02_ORES.map((item, index) => ({
        ...item,
        glyph: ["◒", "◈", "✦", "⬡"][index]!,
        pattern: patterns[index]!,
      }))
    : CAMPAIGN_ORE_LEGEND;
  const hazards = comet
    ? [
        {
          glyph: "≈",
          name: "Cold pocket",
          description:
            "Mist warns before a four-second acceleration reduction. Move clear during the warning.",
        },
        {
          glyph: "↑",
          name: "Ice vent",
          description:
            "A jet deals 6 hull on contact, at most once every three seconds. Keep a retreat route.",
        },
        {
          glyph: "◇",
          name: "Volatile extraction",
          description:
            "Release drilling within 0.75 seconds of completion to preserve the crystal. Continuing ruptures it. Mission samples have no sale value.",
        },
      ]
    : CAMPAIGN_HAZARD_LEGEND;
  $("campaign-legend-list").innerHTML =
    ores
      .map(
        (item) =>
          '<li><span class="legend-glyph" aria-hidden="true">' +
          item.glyph +
          "</span><div><strong>" +
          escape(item.name) +
          "</strong><small>" +
          escape(item.pattern) +
          " · " +
          money(item.value) +
          " · " +
          item.bulk +
          " bulk</small></div></li>",
      )
      .join("") +
    hazards
      .map(
        (item) =>
          '<li><span class="legend-glyph" aria-hidden="true">' +
          item.glyph +
          "</span><div><strong>" +
          escape(item.name) +
          "</strong><small>" +
          escape(item.description) +
          "</small></div></li>",
      )
      .join("");
}
function syncMenuHeaderInset() {
  const height = Math.ceil(
    document.querySelector("#campaign-menu > header")!.getBoundingClientRect()
      .height,
  );
  if (!height) return;
  const value = `${height}px`;
  const menu = $("campaign-menu");
  if (menu.style.getPropertyValue("--campaign-menu-header-height") !== value)
    menu.style.setProperty("--campaign-menu-header-height", value);
}
new ResizeObserver(syncMenuHeaderInset).observe(
  document.querySelector("#campaign-menu > header")!,
);
const fullscreenButton = document.createElement("button");
fullscreenButton.id = "campaign-fullscreen";
fullscreenButton.textContent = "Enter fullscreen";
$("campaign-sound").after(fullscreenButton);
const replaceButton = document.createElement("button");
replaceButton.dataset.command = "replace";
replaceButton.textContent = "Save this run instead";
replaceButton.hidden = true;
document.querySelector(".action-grid")!.append(replaceButton);
const archiveSection = document.createElement("section");
archiveSection.innerHTML =
  '<h2>Campaign archives</h2><p class="muted">The last three replaced campaigns stay here independently of autosave backups. Restores start paused.</p><div id="campaign-archives"></div><p id="campaign-archive-status" role="status"></p>';
document.querySelector(".pause-grid")!.append(archiveSection);
const dockRefuel = document.createElement("p");
dockRefuel.id = "campaign-dock-refuel";
dockRefuel.className = "campaign-dock-refuel";
dockRefuel.setAttribute("role", "status");
$("campaign-dock").querySelector("header")!.append(dockRefuel);
const undockPrompt = document.createElement("section");
undockPrompt.id = "campaign-undock-check";
undockPrompt.className = "campaign-undock-check";
undockPrompt.hidden = true;
undockPrompt.setAttribute("aria-labelledby", "campaign-undock-warning");
undockPrompt.innerHTML =
  '<p id="campaign-undock-warning"></p><div><button data-command="refuel-undock" class="primary"></button><button data-command="undock-anyway">Undock anyway</button></div>';
$("campaign-dock-content").before(undockPrompt);

const input = new CampaignInput(preferences, {
  blocked: () => paused(),
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
  menu: menuControl,
  releaseKeyboard: () => campaign.clearInputAssist(),
});
input.onRemapped = (message) => {
  $("campaign-remap-status").textContent = message;
  renderBindings();
};
applyPreferences();

function clearPilotInput() {
  input.clear();
  campaign.clearInputAssist();
}
function paused() {
  return Boolean(
    overlay ||
    confirmation ||
    !initialized ||
    conflict ||
    launchUntil ||
    rigDisabled() ||
    resumeRequired,
  );
}
function rigDisabled() {
  return campaign.state.vehicle.energy <= 0 || campaign.state.vehicle.hull <= 0;
}
function setText(id: string, value: string) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
}
function setHidden(id: string, value: boolean) {
  if ($(id).hidden !== value) $(id).hidden = value;
}
function setBodyData(key: string, value: string) {
  if (document.body.dataset[key] !== value) document.body.dataset[key] = value;
}
function condition(value: number) {
  return Number(Math.max(0, value).toFixed(2)).toLocaleString("en-US");
}
function recoveryCopy(short = false) {
  const preview = campaign.recoveryPreview;
  const resources = `Energy ${condition(preview.energy)}/${campaign.maxEnergy} L · Hull ${condition(preview.hull)}/${campaign.maxHull} HP`;
  if (preview.freeTow)
    return short
      ? `First tow · free. ${resources}. Cargo, relics and mission objects kept.`
      : `First disabled-rig tow in this world · free. ${resources}. All carried cargo, relics and mission objects stay aboard. ${money(preview.remaining)} remains. Later tows and voluntary recovery use the normal fee and cargo-loss rules.`;
  return short
    ? `Cost ${money(preview.cost)} · ${resources}. Carried cargo lost; mission objects returned.`
    : `Recovery costs ${money(preview.cost)}; ${money(preview.remaining)} remains. ${resources}. Healthy resources above half capacity are preserved. Carried ordinary cargo and relics are lost; unbanked mission objects return to their marked sources. Banked cargo, equipment and progress are kept.`;
}
function requireResumeAfterRestore() {
  resumeRequired = true;
  clearPilotInput();
  saveTimer = 0;
  lastMined = campaign.state.stats.mined;
  lastHull = campaign.state.vehicle.hull;
  lastCargoBulk = campaign.cargoBulk;
  messageHoldUntil = 0;
  messageUntil = 0;
}
function syncSafety() {
  const vehicle = campaign.state.vehicle;
  setText(
    "campaign-pause-conditions",
    `Energy ${condition(vehicle.energy)}/${campaign.maxEnergy} L · Hull ${condition(vehicle.hull)}/${campaign.maxHull} HP · Cargo ${campaign.cargoBulk}/${campaign.capacity}`,
  );
  const messages: string[] = [];
  const energyRatio = vehicle.energy / campaign.maxEnergy;
  const refuel = campaign.servicePreview("refuel");
  const refuelHint =
    campaign.atDock && energyRatio < 0.5
      ? refuel.cost > 0
        ? `Energy below half · refuel here for ${money(refuel.cost)}${refuel.partial ? " (partial fill)" : ""}`
        : "Energy below half · sell cargo to afford refuelling"
      : "";
  setText("campaign-dock-refuel", refuelHint);
  setHidden("campaign-dock-refuel", !refuelHint);
  if (vehicle.energy <= 0) messages.push("Energy depleted · request recovery");
  else if (campaign.atDock) {
    if (refuelHint && refuel.cost > 0) messages.push(refuelHint);
  } else if (energyRatio <= 0.08)
    messages.push("Emergency reserve · return or request recovery");
  else if (energyRatio <= 0.15)
    messages.push("Energy critical · return through your cleared route");
  else if (energyRatio <= 0.25)
    messages.push("Low energy · reserve at 25% · check your return route");
  if (vehicle.hull <= 0) messages.push("Hull failed · request recovery");
  else if (vehicle.hull / campaign.maxHull <= 0.25)
    messages.push("Critical hull · repair at the lander");
  setText("campaign-danger", messages.join("\n"));
  setHidden("campaign-danger", !messages.length || overlay === "dock");
  setBodyData("campaignDanger", String(Boolean(messages.length)));
  const disabled = rigDisabled();
  setBodyData("campaignDisabled", String(disabled));
  setBodyData("campaignResumeRequired", String(resumeRequired));
  $<HTMLButtonElement>("campaign-resume").disabled =
    restoring || conflict || confirmBusy;
  document
    .querySelectorAll<HTMLButtonElement>(
      '.action-grid [data-command]:not([data-command="export"])',
    )
    .forEach((button) => {
      button.disabled =
        busy ||
        confirmBusy ||
        (button.dataset.command === "restore" && !backupAvailable);
    });
  $("campaign-archives")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) => {
      button.disabled = busy || restoring || confirmBusy;
    });
  setHidden("campaign-disabled", !disabled || Boolean(overlay || confirmation));
  if (disabled) {
    setText(
      "campaign-disabled-title",
      vehicle.hull <= 0 ? "Rig disabled · hull failed" : "Energy depleted",
    );
    setText("campaign-disabled-copy", recoveryCopy(true));
    setText("campaign-menu-recovery-preview", recoveryCopy(true));
  }
  setHidden("campaign-menu-recover", !disabled);
  setHidden("campaign-disabled-dock", !disabled || !campaign.atDock);
  setHidden("campaign-menu-dock", !disabled || !campaign.atDock);
  setHidden("campaign-menu-recovery-preview", !disabled);
  setText(
    "campaign-menu-title",
    resumeRequired ? "Expedition restored · paused" : "Paused",
  );
  if (lastSavedAt !== undefined) {
    const minutes = Math.floor(Math.max(0, Date.now() - lastSavedAt) / 60000);
    const age = minutes ? `${minutes} min ago` : "just now";
    setText(
      "campaign-autosave-status",
      `${lastSaveWasAutomatic ? "Autosaved" : "Saved"} ${age} · this browser only`,
    );
  }
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
function showMessage(message: string, priority?: number) {
  const concise = presentationMessage(message);
  if (!concise || document.body.dataset.campaignDanger === "true") return;
  const now = performance.now();
  const nextPriority =
    priority ??
    (/^Hold full/.test(concise)
      ? 3
      : /surveyed|secured|restored|complete|constructed/i.test(concise)
        ? 2
        : 0);
  if (now < messageHoldUntil && nextPriority < messagePriority) return;
  messagePriority = nextPriority;
  messageHoldUntil = nextPriority >= 2 ? now + 2500 : now;
  setText("campaign-message", concise);
  messageUntil = now + 4000;
  $("campaign-message").classList.add("visible");
}
function syncMissionSignal(objectiveNext: string) {
  const signal = campaignSignal(campaign);
  if (
    signalCampaign !== campaign ||
    signalRecovery !== campaign.state.stats.recoveries ||
    signalWorld !== campaign.state.currentWorld
  ) {
    signalCampaign = campaign;
    signalRecovery = campaign.state.stats.recoveries;
    signalWorld = campaign.state.currentWorld;
    announcedSignalBands.clear();
  }
  setHidden("campaign-mission-signal", !signal);
  const element = $("campaign-mission-signal");
  const target = signal?.targetId ?? "";
  if (element.dataset.target !== target) element.dataset.target = target;
  const band = signal?.band ?? "";
  if (element.dataset.band !== band) element.dataset.band = band;
  setText(
    "campaign-objective-next",
    signal && !signal.returning ? signal.action : objectiveNext,
  );
  if (!signal) return;
  const proximity = {
    distant: "Tracking",
    near: "Signal nearby",
    close: "Very close",
    at: signal.returning ? "Dock available" : "At target",
  }[signal.band];
  setText("campaign-signal-direction", signal.arrow);
  setText(
    "campaign-signal-direction-label",
    signal.direction === "here"
      ? "At your position"
      : signal.direction.replace("-", " and "),
  );
  setText("campaign-signal-target", signal.name);
  setText("campaign-signal-distance", signal.distanceMeters + " m");
  setText("campaign-signal-proximity", proximity);

  // Range ticks are readouts, not announcements. A closer signal band alerts
  // once per target; drifting around a boundary cannot repeat the same alert.
  const rank = { distant: 0, near: 1, close: 2, at: 3 }[signal.band];
  if (
    rank > (announcedSignalBands.get(signal.targetId) ?? 0) &&
    !paused() &&
    !document.hidden &&
    document.body.dataset.campaignDanger !== "true"
  ) {
    announcedSignalBands.set(signal.targetId, rank);
    const message = `${signal.name} · ${proximity}. ${signal.action}.`;
    showMessage(message, 1);
  }
}
function openOverlay(kind: Exclude<typeof overlay, undefined>) {
  if (kind === "dock" && !campaign.atDock) {
    showMessage("Return to the lander's illuminated surface bay to dock.");
    return;
  }
  clearPilotInput();
  for (const id of ["menu", "dock", "map", "welcome"] as const) {
    const dialog = $<HTMLDialogElement>("campaign-" + id);
    if (dialog.open) dialog.close();
  }
  overlay = kind;
  document.body.dataset.campaignOverlay = kind;
  if (kind === "dock") {
    undockCheck = false;
    if (
      campaign.cargo.length ||
      campaign.world.missions.some((item) => item.status === "carried") ||
      campaign.state.vehicle.energy < campaign.maxEnergy ||
      campaign.state.vehicle.hull < campaign.maxHull
    )
      dockTab = "service";
    else if (
      campaign.missionReady &&
      campaign.currentMilestone &&
      campaign.state.credits >= campaign.currentMilestone.fee
    )
      dockTab = "lander";
    renderDock();
  }
  if (kind === "menu") {
    renderMenu();
    void refreshArchives();
  }
  if (kind === "map") renderMap();
  $<HTMLDialogElement>("campaign-" + kind).showModal();
  if (kind === "menu") syncMenuHeaderInset();
  audio.update(0, true, false, false);
}
function closeOverlay(skipRefuelCheck = false) {
  if (restoring || confirmBusy) return;
  if (resumeRequired) {
    if (overlay !== "menu" && !confirmation) openOverlay("menu");
    return;
  }
  if (conflict) {
    showMessage(
      "Load the newer checkpoint or export this tab before continuing.",
    );
    return;
  }
  if (confirmation || overlay === "welcome") return;
  if (
    overlay === "dock" &&
    !skipRefuelCheck &&
    campaign.state.vehicle.energy / campaign.maxEnergy < 0.5 &&
    campaign.servicePreview("refuel").cost > 0
  ) {
    undockCheck = true;
    renderDock();
    $("campaign-undock-check")
      .querySelector<HTMLButtonElement>('[data-command="refuel-undock"]')!
      .focus();
    return;
  }
  if (overlay) $<HTMLDialogElement>("campaign-" + overlay).close();
  overlay = undefined;
  delete document.body.dataset.campaignOverlay;
  clearPilotInput();
  undockCheck = false;
  $("campaign-game").focus({ preventScroll: true });
  syncHUD();
}
function menuControl(action: MenuAction) {
  if (action === "back") {
    if (confirmation) $("campaign-confirm-cancel").click();
    else if (overlay && overlay !== "welcome") {
      if (overlay === "menu" && resumeRequired && !conflict && !restoring)
        $("campaign-resume").click();
      else closeOverlay();
    }
    return;
  }
  const host = confirmation
    ? $("campaign-confirm")
    : overlay
      ? $("campaign-" + overlay)
      : rigDisabled()
        ? $("campaign-disabled")
        : undefined;
  if (!host) return;
  const controls = Array.from(
    host.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]",
    ),
  ).filter(
    (element) =>
      !element.closest("[hidden], [inert]") &&
      element.getClientRects().length > 0,
  );
  if (!controls.length) return;
  const index = controls.indexOf(document.activeElement as HTMLElement);
  if (action === "activate") {
    const target = controls[index < 0 ? 0 : index];
    if (target instanceof HTMLInputElement && target.type === "range") return;
    target.click();
  } else {
    const next =
      index < 0
        ? action === "previous"
          ? controls.length - 1
          : 0
        : (index + (action === "previous" ? -1 : 1) + controls.length) %
          controls.length;
    controls[next].focus();
    controls[next].scrollIntoView({ block: "nearest" });
  }
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
  syncSafety();
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
    campaign.completedMilestones.length +
    " / 3</dd><dt>Destination</dt><dd>" +
    escape(worldName(s.currentWorld)) +
    "</dd><dt>Stored cargo</dt><dd>" +
    campaign.warehouse.length +
    " packages</dd><dt>Banked mission objects</dt><dd>" +
    campaign.world.missions.filter((item) => item.status === "banked").length +
    " / " +
    campaign.world.missions.length +
    "</dd></dl>";
  document
    .querySelectorAll<HTMLButtonElement>('[data-command="restore"]')
    .forEach((button) => {
      button.disabled = busy || confirmBusy || !backupAvailable;
    });
  renderBindings();
}
async function refreshArchives(force = false) {
  if (archivesRequest) {
    if (!force) return archivesRequest;
    await archivesRequest;
  }
  archivesRequest = store
    .listArchives()
    .then((entries) => {
      archives = entries;
      const key = JSON.stringify(entries);
      if (key !== archivesKey) {
        archivesKey = key;
        $("campaign-archives").innerHTML = entries.length
          ? entries
              .map(
                (entry) =>
                  '<article class="archive-row"><div><strong>' +
                  escape(worldName(entry.currentWorld)) +
                  " · seed " +
                  entry.seed +
                  "</strong><small>" +
                  escape(new Date(entry.archivedAt).toLocaleString()) +
                  " · " +
                  money(entry.credits) +
                  "</small></div>" +
                  button("archive:" + entry.id, "Restore archived campaign") +
                  "</article>",
              )
              .join("")
          : '<p class="muted">No archived campaigns yet.</p>';
      }
      setText("campaign-archive-status", "");
    })
    .catch(() => {
      setText(
        "campaign-archive-status",
        "Archives could not be read. Your active checkpoint is unchanged.",
      );
    })
    .finally(() => {
      archivesRequest = undefined;
    });
  return archivesRequest;
}
function actionKey(action: "mobility" | "interact" | "primary") {
  if (matchMedia("(pointer: coarse)").matches || innerWidth <= 760)
    return action === "primary" ||
      (action === "mobility" && !preferences.braceToggle)
      ? "Hold"
      : "Tap";
  const controller = navigator.getGamepads?.().find((pad) => pad?.connected);
  if (controller)
    return controller.mapping === "standard"
      ? action === "mobility"
        ? "X"
        : action === "primary"
          ? "B"
          : "LB"
      : "";
  const binding = preferences.keys[action][0];
  return binding ? keyLabel(binding) : "";
}
function worldName(id: string) {
  return WORLD_CATALOG.find((world) => world.id === id)?.name ?? id;
}
function gearArt(id: string): keyof typeof HUD_ART {
  const icons: Record<string, keyof typeof HUD_ART> = {
    "W01-R1": "drill",
    "W01-R2": "feet",
    "W01-R3": "rack",
    "W02-R1": "thermal",
    "W02-R2": "condenser",
    "W02-R3": "preservation",
  };
  return icons[id] ?? "core";
}
function syncExtractionCue() {
  const pending = campaign.volatileWindow;
  const target = campaign.drillTarget;
  const cuttingVolatile =
    target &&
    campaign.world.packages.some(
      (item) =>
        item.status === "deposit" &&
        item.tags.includes("volatile") &&
        Math.floor(item.x) === target.x &&
        Math.floor(item.y) === target.y,
    );
  const climate = campaign.coldStatus;
  let title = "",
    copy = "",
    time = "",
    mode = "";
  if (pending) {
    title = "Crystal complete · release drill now";
    copy =
      "Return the joystick to centre, lift, release the drill key or use Release drill.";
    time = pending.remaining.toFixed(1) + " s";
    mode = "release";
  } else if (cuttingVolatile) {
    title = campaign.precisionActive
      ? "Precision cut · preserve the crystal"
      : "Volatile ice · watch for completion";
    copy =
      "Release drilling when the cut completes. Continuing for 0.75 s ruptures the crystal.";
    mode = "cutting";
  } else if (
    document.body.dataset.campaignDanger !== "true" &&
    climate?.warning
  ) {
    title = "Cold mist · move clear";
    copy = "A cold pocket is about to slow acceleration.";
    time = climate.warning.toFixed(1) + " s";
    mode = "cold-warning";
  } else if (
    document.body.dataset.campaignDanger !== "true" &&
    climate &&
    climate.coldRemaining > 0
  ) {
    title = "Cold-soaked · reduced acceleration";
    copy = "Keep your return route clear while the rig warms up.";
    time = climate.coldRemaining.toFixed(1) + " s";
    mode = "cold";
  }
  const visible = Boolean(title) && !overlay && !confirmation && !rigDisabled();
  setHidden("campaign-extraction", !visible);
  setHidden("campaign-release-drill", !pending);
  setText("campaign-extraction-title", title);
  setText("campaign-extraction-copy", copy);
  setText("campaign-extraction-time", time);
  setHidden("campaign-extraction-time", !time);
  const cue = $("campaign-extraction");
  if (cue.dataset.mode !== mode) cue.dataset.mode = mode;
  setBodyData("campaignExtraction", String(visible));
  setBodyData(
    "campaignVolatile",
    pending ? "release" : cuttingVolatile ? "cutting" : "none",
  );
}
function actionCaption(action: "mobility" | "interact") {
  const label = action === "mobility" ? "Mobility" : "Dock and trade";
  const key = actionKey(action);
  return key ? key + " · " + label : label;
}
function syncHUD() {
  syncSafety();
  const s = campaign.state,
    v = s.vehicle;
  setBodyData("campaignWorld", s.currentWorld);
  if (legendWorld !== s.currentWorld) {
    legendWorld = s.currentWorld;
    renderLegend();
  }
  syncExtractionCue();
  setText("campaign-energy", v.energy.toFixed(1) + " / " + campaign.maxEnergy);
  setText(
    "campaign-hull",
    Math.max(0, v.hull).toFixed(v.hull % 1 ? 1 : 0) + " / " + campaign.maxHull,
  );
  setText("campaign-cargo", campaign.cargoBulk + " / " + campaign.capacity);
  setText("campaign-credits", formatCredits(s.credits));
  setText("campaign-depth", campaign.depth + " m");
  setText("campaign-haul", money(campaign.cargoValue));
  $("campaign-energy-fill").style.width =
    Math.max(0, (v.energy / campaign.maxEnergy) * 100) + "%";
  $("campaign-hull-fill").style.width =
    Math.max(0, (v.hull / campaign.maxHull) * 100) + "%";
  $("campaign-energy")
    .closest(".instrument")!
    .classList.toggle("critical", v.energy / campaign.maxEnergy <= 0.25);
  document
    .querySelector(".hull-vital")!
    .classList.toggle("critical", v.hull / campaign.maxHull <= 0.25);
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
  setText(
    "campaign-dock-title",
    s.currentWorld === "W02"
      ? "Comet refuge"
      : s.progress.completed.includes(3)
        ? "The restored lander"
        : "Salvage lander",
  );
  setText("campaign-dock-location", "LANDER TERMINAL / " + s.currentWorld);
  setText(
    "campaign-drill-name",
    s.equipped.drill
      ? (campaign.gearDefinitions.find((item) => item.id === s.equipped.drill)
          ?.name ?? "Steel spindle")
      : "Steel spindle",
  );
  const drillIcon =
    document.querySelector<HTMLImageElement>(".drill-slot > img")!;
  const drillArt = HUD_ART[gearArt(s.equipped.drill ?? "W01-R1")];
  if (drillIcon.getAttribute("src") !== drillArt) drillIcon.src = drillArt;
  setText(
    "campaign-mobility-name",
    s.equipped.mobility
      ? campaign.feetDeployed
        ? "Feet anchored"
        : "Anchoring feet"
      : "No attachment",
  );
  setText(
    "campaign-processor-name",
    s.equipped.processor
      ? (campaign.gearDefinitions.find(
          (item) => item.id === s.equipped.processor,
        )?.name ?? "Processor")
      : "Open cargo bay",
  );
  $<HTMLButtonElement>("campaign-feet-button").disabled =
    !s.equipped.mobility || Boolean(overlay);
  $("campaign-feet-button").setAttribute(
    "aria-pressed",
    String(campaign.feetDeployed),
  );
  $("campaign-feet-button").hidden = !s.equipped.mobility;
  document.querySelector<HTMLElement>(".processor-slot")!.hidden =
    !s.equipped.processor || s.equipped.processor === "W02-R3";
  setHidden("campaign-precision-button", s.equipped.processor !== "W02-R3");
  setBodyData("campaignPrecision", String(s.equipped.processor === "W02-R3"));
  const precisionKey = actionKey("primary");
  setText(
    "campaign-precision-key",
    precisionKey === "Hold" ? "HOLD" : "HOLD " + precisionKey,
  );
  $("campaign-precision-button").setAttribute(
    "aria-pressed",
    String(campaign.precisionActive),
  );
  $("campaign-precision-button").setAttribute(
    "aria-label",
    "Hold precision extraction · " + actionKey("primary"),
  );
  $<HTMLButtonElement>("campaign-precision-button").disabled = Boolean(overlay);
  document.querySelector<HTMLElement>(".utility-slot")!.hidden =
    !s.equipped.utilities.includes("W02-R2");
  setHidden("campaign-dock-navigation", !s.progress.completed.includes(2));
  $<HTMLButtonElement>("campaign-map-toggle").disabled =
    !s.progress.completed.includes(2) || Boolean(overlay);
  document.body.dataset.campaignPaused = String(paused());
  document.body.dataset.campaignBusy = String(busy);
  if (campaign.message !== previousMessage) {
    previousMessage = campaign.message;
    showMessage(campaign.message);
  }
  if (
    campaign.cargoBulk >= campaign.capacity &&
    lastCargoBulk < campaign.capacity
  )
    showMessage(`Hold full · ${campaign.cargoBulk}/${campaign.capacity}`, 3);
  lastCargoBulk = campaign.cargoBulk;
  const reserve = v.energy / campaign.maxEnergy;
  const nextWarning =
    reserve <= 0.08 ? 3 : reserve <= 0.15 ? 2 : reserve <= 0.25 ? 1 : 0;
  if (!paused() && nextWarning > energyWarningBand) {
    energyPulseUntil = performance.now() + 2000;
    audio.event("warning");
  }
  energyWarningBand = nextWarning;
  document
    .querySelector(".energy-vital")!
    .classList.toggle(
      "warning-pulse",
      performance.now() < energyPulseUntil && !preferences.reducedMotion,
    );
  syncMissionSignal(objective.next);
  if (performance.now() >= messageUntil)
    $("campaign-message").classList.remove("visible");
  if (overlay === "dock")
    setText(
      "campaign-dock-message",
      presentationMessage(campaign.message) || "Lander uplink ready.",
    );
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
function serviceCopy(action: "refuel" | "repair") {
  const preview = campaign.servicePreview(action);
  const unit = action === "refuel" ? "L" : "HP";
  const change = `${condition(preview.current)} → ${condition(preview.result)} / ${preview.maximum} ${unit}`;
  const outcome = `Cost ${money(preview.cost)} · ${money(preview.remaining)} remains.`;
  const partial = preview.partial
    ? ` Partial service; ${money(Math.max(0, preview.fullCost - preview.cost))} more needed to fill.`
    : "";
  return `${change}. ${outcome}${partial}`;
}
function renderDock() {
  const s = campaign.state;
  const content = $("campaign-dock-content");
  const focused = document.activeElement as HTMLElement | null;
  const focusCommand = content.contains(focused)
    ? focused?.dataset.command
    : undefined;
  const previousControls = Array.from(
    content.querySelectorAll<HTMLButtonElement>("button"),
  );
  const focusIndex = previousControls.indexOf(focused as HTMLButtonElement);
  const previousScroll = $("campaign-dock").scrollTop;
  setHidden("campaign-undock-check", !undockCheck);
  if (undockCheck) {
    const refuel = campaign.servicePreview("refuel");
    setText(
      "campaign-undock-warning",
      `Energy is below half. ${serviceCopy("refuel")} Refuel before your next trip?`,
    );
    $("campaign-undock-check").querySelector<HTMLButtonElement>(
      '[data-command="refuel-undock"]',
    )!.textContent = `Refuel ${money(refuel.cost)} & undock`;
  }
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
      '</span><h3>Energy reserve</h3><p data-service-preview="refuel">' +
      serviceCopy("refuel") +
      " 1 CR per litre.</p>" +
      button(
        "refuel",
        "Refuel · " + money(campaign.servicePreview("refuel").cost),
        s.vehicle.energy >= campaign.maxEnergy || s.credits <= 0,
      ) +
      '</article><article><span class="card-symbol hull-icon">' +
      hudIcon("hull") +
      '</span><h3>Hull repair</h3><p data-service-preview="repair">' +
      serviceCopy("repair") +
      " 15 CR per HP.</p>" +
      button(
        "repair",
        "Repair · " + money(campaign.servicePreview("repair").cost),
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
          unlocked = campaign.hardwareUnlocked,
          maxed = rank >= campaign.hardwareCap;
        const preview =
          HARDWARE_LEVELS[key][rank] +
          units[key] +
          (maxed
            ? " · rank " + rank + " installed"
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
          (maxed ? "OWNED" : "RANK " + next) +
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
            ? campaign.hardwareCap === 1
              ? "Next rank: land on the Ice comet."
              : "Further hardware ranks open on later destinations."
            : !unlocked
              ? "Blueprint: complete Survey the wreck."
              : (s.credits < (price ?? 0)
                  ? "Need " +
                    money((price ?? 0) - s.credits) +
                    " more for this upgrade. "
                  : "") + reserveCopy) +
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
      '<h2>Attachment mounts</h2><p class="muted">Change loadout at dock. Owned modules stay yours.' +
      (s.currentWorld === "W02"
        ? " Utility mounts: " +
          s.equipped.utilities.length +
          "/2. The condenser works automatically; hold Precision while starting a volatile cut for preservation-chamber benefits."
        : "") +
      '</p><div class="equipment-cards">' +
      campaign.gearDefinitions
        .filter(
          (gear) =>
            gear.id.startsWith(s.currentWorld + "-") ||
            s.ownedGear.includes(gear.id),
        )
        .map((gear) => {
          const owned = s.ownedGear.includes(gear.id),
            equipped = Object.values(s.equipped).some(
              (item) =>
                item === gear.id ||
                (Array.isArray(item) && item.includes(gear.id)),
            ),
            available =
              owned ||
              !gear.milestone ||
              campaign.completedMilestones.includes(gear.milestone),
            prerequisite =
              !gear.requires || s.ownedGear.includes(gear.requires);
          return (
            "<article>" +
            hudIcon(gearArt(gear.id), "part-icon") +
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
                : "Slot: " +
                  gear.slot +
                  ". Switching is free at dock." +
                  (!owned && s.credits < gear.price
                    ? " Need " + money(gear.price - s.credits) + " more."
                    : "")) +
            "</small>" +
            (gear.id === "W02-R3"
              ? '<small class="precision-instruction">' +
                (actionKey("primary") === "Hold"
                  ? "Hold Precision"
                  : "Hold " + escape(actionKey("primary")) + " / Precision") +
                " while starting a volatile cut. Release drilling at completion to preserve it.</small>"
              : "") +
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
        })
        .join("") +
      "</div>";
  } else if (dockTab === "lander") {
    html =
      "<h2>" +
      (s.currentWorld === "W02"
        ? "Comet condenser project"
        : "Lander restoration") +
      '</h2><div class="milestone-cards">' +
      campaign.milestoneDefinitions
        .map((milestone) => {
          const complete = campaign.completedMilestones.includes(milestone.id),
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
        })
        .join("") +
      "</div>" +
      (campaign.completedMilestones.includes(3)
        ? s.currentWorld === "W02"
          ? '<div class="departure-card"><h3>Planetary certificate secured.</h3><p>The condenser is complete. Iron planet is charted for a later chapter; your established asteroid and comet routes remain available.</p>' +
            button("map", "Open navigation", false, true) +
            "</div>"
          : '<div class="departure-card"><h3>The lander is ready.</h3><p>Record your Frontier departure to travel to the Ice comet. The Fractured moon is charted for a later chapter.</p>' +
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
  if (content.innerHTML !== html) {
    content.innerHTML = html;
    if (focusCommand) {
      const controls = Array.from(
        content.querySelectorAll<HTMLButtonElement>("button"),
      );
      const same = controls.find(
        (element) =>
          element.dataset.command === focusCommand && !element.disabled,
      );
      const fallback =
        controls
          .slice(Math.max(0, focusIndex))
          .find((element) => !element.disabled) ||
        controls.find((element) => !element.disabled);
      (same || fallback)?.focus({ preventScroll: true });
    }
    $("campaign-dock").scrollTop = previousScroll;
  }
  $("campaign-dock-message").textContent =
    presentationMessage(campaign.message) || "Lander uplink ready.";
}
function renderMap() {
  const state = campaign.state;
  $("campaign-map-copy").textContent = state.progress.departed
    ? "Choose an established destination or continue into the Ice comet. Travel starts at the lander and keeps every excavated route."
    : "Restore the navigation core, finish construction and record the Frontier departure at the lander to reach the Ice comet.";
  $("campaign-map-worlds").innerHTML = WORLD_CATALOG.slice(0, 4)
    .map((world) => {
      const current = world.id === state.currentWorld;
      const visited = Boolean(state.worlds[world.id]);
      const playable = world.id === "W01" || world.id === "W02";
      const preview = campaign.travelPreview(world.id);
      const charted = state.progress.unlockedWorlds.includes(world.id);
      const status = current
        ? "CURRENT DESTINATION"
        : playable
          ? visited
            ? "RETURN ROUTE"
            : state.progress.departed
              ? "AVAILABLE"
              : "LOCKED"
          : charted
            ? "CHARTED · IN DEVELOPMENT"
            : "LOCKED · IN DEVELOPMENT";
      const description =
        world.id === "W01"
          ? "Return to your established shafts, banked cargo and restored lander."
          : world.id === "W02"
            ? "Preserve volatile crystals, recover cryogenic samples and build a comet condenser."
            : world.id === "W03"
              ? "A future route through unstable stone, fault surveys and supported crossings."
              : "A future planetary mine beyond the Planetary certificate.";
      const progress = current
        ? campaign.completedMilestones.length + "/3 milestones complete"
        : world.id === "W01"
          ? state.progress.completed.length + "/3 milestones complete"
          : visited
            ? "Established routes retained"
            : "";
      return (
        '<article class="world-card world-' +
        world.id.toLowerCase() +
        '" data-world="' +
        world.id +
        '"><div class="planet-symbol"></div><p class="eyebrow">' +
        world.id +
        " · " +
        status +
        "</p><h2>" +
        world.name +
        "</h2><p>" +
        description +
        "</p><small>" +
        escape(
          progress ||
            (playable
              ? preview.reason
              : world.id === "W04"
                ? charted
                  ? "Planetary certificate secured · not yet playable"
                  : "Requires the Planetary certificate · not yet playable"
                : "The moon branch is not yet playable"),
        ) +
        "</small>" +
        (!current && playable
          ? button(
              "travel-" + world.id,
              (visited ? "Return to " : "Travel to ") + world.name,
              !preview.allowed,
              preview.allowed,
            ) +
            (!preview.allowed && progress
              ? '<small class="travel-reason">' +
                escape(preview.reason) +
                "</small>"
              : "")
          : "") +
        "</article>"
      );
    })
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
      lastSavedAt = Date.now();
      lastSaveWasAutomatic = !announce;
      setText("campaign-save-status", "Checkpoint saved in this browser.");
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
    storageConflictEpoch++;
    protectConflictedSession();
  }
  showMessage(message);
}
function protectConflictedSession() {
  conflict = true;
  blocked = true;
  // A confirmation can be open, or already awaiting an IndexedDB operation.
  // Its decision is no longer current. Keep any in-flight work guarded until
  // it settles, but make the recovery menu the only live modal immediately.
  confirmation = undefined;
  confirmReturn = undefined;
  dockAfterConfirmation = false;
  menuAfterConfirmation = false;
  launchUntil = 0;
  setHidden("campaign-launch", true);
  const dialog = $<HTMLDialogElement>("campaign-confirm");
  if (dialog.open) dialog.close();
  clearPilotInput();
  if (initialized) openOverlay("menu");
}
async function loadCheckpoint() {
  if (busy || confirmBusy) return;
  const loadEpoch = storageConflictEpoch;
  restoring = true;
  openOverlay("menu");
  busy = true;
  try {
    const loaded = await store.load();
    assertCurrentStorageDecision(loadEpoch);
    if (loaded.state) {
      campaign = new Campaign(loaded.state);
      requireResumeAfterRestore();
      lastSavedAt = undefined;
      setText(
        "campaign-autosave-status",
        "Latest checkpoint loaded · this browser only",
      );
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
    restoring = false;
    if (resumeRequired) openOverlay("menu");
    else renderMenu();
    syncHUD();
  }
}
function ask(
  title: string,
  copy: string,
  operation: () => Promise<void> | void,
) {
  if (confirmBusy) return;
  clearPilotInput();
  confirmReturn = overlay;
  confirmation = operation;
  $("campaign-confirm-title").textContent = title;
  $("campaign-confirm-copy").textContent = copy;
  $("campaign-confirm-error").textContent = "";
  $<HTMLDialogElement>("campaign-confirm").showModal();
  syncHUD();
}
function assertCurrentStorageDecision(epoch: number) {
  if (epoch !== storageConflictEpoch)
    throw new CampaignSaveError(
      "conflict",
      "Another tab changed the checkpoint during this action. Load its checkpoint to continue; export this tab to keep a separate copy.",
    );
}
async function replaceCampaign(state: CampaignState) {
  const replaceEpoch = storageConflictEpoch;
  if (savePromise) await savePromise;
  assertCurrentStorageDecision(replaceEpoch);
  busy = true;
  try {
    await store.replace(state);
    assertCurrentStorageDecision(replaceEpoch);
    campaign = new Campaign(state);
    blocked = false;
    conflict = false;
    backupAvailable = true;
    saveTimer = 0;
    requireResumeAfterRestore();
    menuAfterConfirmation = true;
    lastSavedAt = Date.now();
    lastSaveWasAutomatic = false;
    setText(
      "campaign-save-status",
      "Campaign checkpoint replaced. Resume when ready.",
    );
    await refreshArchives(true);
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
  if (confirmBusy && name !== "export") return;
  if (name === "undock-anyway") {
    if (!busy && overlay === "dock") closeOverlay(true);
    return;
  }
  if (name === "refuel-undock") {
    if (busy || overlay !== "dock" || conflict) return;
    await transact(() => campaign.refuel());
    if (!blocked && !conflict && campaign.state.vehicle.energy > 0)
      closeOverlay(true);
    return;
  }
  if (name === "disabled-dock") {
    if (!busy && rigDisabled() && campaign.atDock) {
      resumeRequired = true;
      openOverlay("dock");
      syncHUD();
    }
    return;
  }
  if (name === "release-volatile") {
    if (paused()) return;
    clearPilotInput();
    if (campaign.releaseVolatile()) audio.event("pickup");
    syncHUD();
    $("campaign-game").focus({ preventScroll: true });
    return;
  }
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
  if (busy || confirmBusy) return;
  if (name.startsWith("travel-")) {
    const destination = name.slice(7);
    const preview = campaign.travelPreview(destination);
    if (!preview.allowed) {
      showMessage(preview.reason);
      if (overlay === "map") renderMap();
      return;
    }
    ask(
      "Travel to " + worldName(destination) + "?",
      "Bank " +
        preview.cargoCount +
        " cargo packages and " +
        preview.missionCount +
        " mission objects at this lander before departure. Your credits, equipment, stored cargo and excavated routes remain yours. Arrive with energy " +
        condition(campaign.state.vehicle.energy) +
        "/" +
        campaign.maxEnergy +
        " and hull " +
        condition(campaign.state.vehicle.hull) +
        "/" +
        campaign.maxHull +
        ". Travel is free; refuel or repair before leaving if needed.",
      async () => {
        clearPilotInput();
        if (!campaign.travel(destination)) throw new Error(campaign.message);
        saveTimer = 0;
        lastMined = campaign.state.stats.mined;
        lastHull = campaign.state.vehicle.hull;
        previousObjective = "";
        const saved = await persist();
        dockAfterConfirmation = saved;
        // A failed save keeps this valid in-memory arrival exportable. Close
        // the confirmation into checkpoint recovery instead of trapping the
        // player in a dock that a stale-tab conflict prevents them leaving.
        if (!saved) menuAfterConfirmation = true;
      },
    );
    return;
  }
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
        const restoreEpoch = storageConflictEpoch;
        const state = await store.restoreBackup();
        assertCurrentStorageDecision(restoreEpoch);
        campaign = new Campaign(state);
        requireResumeAfterRestore();
        menuAfterConfirmation = true;
        lastSavedAt = Date.now();
        lastSaveWasAutomatic = false;
        blocked = false;
        conflict = false;
        showMessage("Backup restored.");
      },
    );
    return;
  }
  if (name.startsWith("archive:")) {
    const id = name.slice("archive:".length);
    const entry = archives.find((item) => item.id === id);
    if (!entry) return;
    ask(
      "Restore this archived campaign?",
      `${worldName(entry.currentWorld)} · seed ${entry.seed} · ${money(entry.credits)}. The current saved campaign is archived if it is a different expedition. The three most recently archived campaigns are retained; the oldest archive may be removed. Restore starts paused.`,
      async () => {
        const restoreEpoch = storageConflictEpoch;
        const state = await store.restoreArchive(id);
        assertCurrentStorageDecision(restoreEpoch);
        campaign = new Campaign(state);
        requireResumeAfterRestore();
        menuAfterConfirmation = true;
        lastSavedAt = Date.now();
        lastSaveWasAutomatic = false;
        blocked = false;
        conflict = false;
        backupAvailable = true;
        await refreshArchives(true);
        showMessage("Archived campaign restored. Resume when ready.");
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
      "Start on a new asteroid. The current valid saved campaign is kept in Campaign archives, independently of autosave backups. The three most recently archived campaigns are retained; the oldest archive may be removed.",
      async () => {
        await replaceCampaign(createCampaign(seed()));
        showMessage("New asteroid expedition ready.");
      },
    );
    return;
  }
  if (name === "recover") {
    ask("Call surface recovery?", recoveryCopy(), async () => {
      campaign.recover();
      requireResumeAfterRestore();
      menuAfterConfirmation = true;
      await persist();
    });
    return;
  }
  if (name === "bank-sell") {
    await transact(() => {
      const missions = campaign.world.missions
        .filter((item) => item.status === "carried")
        .map((item) => item.name);
      const creditsBefore = campaign.state.credits;
      const banked = campaign.bank();
      const saleCount = campaign.warehouse.length;
      const sold = saleCount > 0 && campaign.sell();
      if (banked || sold) {
        const bankMessage = missions.length
          ? `Banked ${missions.join(", ")}`
          : "Hold unloaded";
        campaign.message = sold
          ? `${bankMessage} · sold ${saleCount} packages for ${money(campaign.state.credits - creditsBefore)}.`
          : `${bankMessage} · no ore to sell.`;
      }
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
      "Your Frontier certificate and all progress remain permanent. Record departure to unlock travel to the Ice comet. The Fractured moon remains charted for a later chapter.",
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
    if (target.id === "campaign-resume" && !restoring) resumeRequired = false;
    closeOverlay();
    return;
  }
  if (target.dataset.remap) input.remap(target.dataset.remap as PilotAction);
});
$("campaign-menu-toggle").onclick = () => openOverlay("menu");
$("campaign-disabled-menu").onclick = () => openOverlay("menu");
$("campaign-dock-toggle").onclick = openDock;
$("campaign-map-toggle").onclick = openMap;
$("campaign-start").onclick = async () => {
  resumeRequired = false;
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
  const operationEpoch = storageConflictEpoch;
  $<HTMLButtonElement>("campaign-confirm-accept").disabled = true;
  $<HTMLButtonElement>("campaign-confirm-cancel").disabled = true;
  const operation = confirmation;
  try {
    await operation();
    if (operationEpoch !== storageConflictEpoch) {
      protectConflictedSession();
      return;
    }
    confirmation = undefined;
    $<HTMLDialogElement>("campaign-confirm").close();
    if (menuAfterConfirmation || conflict) {
      menuAfterConfirmation = false;
      dockAfterConfirmation = false;
      openOverlay("menu");
    } else if (dockAfterConfirmation) {
      dockAfterConfirmation = false;
      resumeRequired = false;
      dockTab = "service";
      openOverlay("dock");
    }
    if (overlay === "dock") renderDock();
    if (overlay === "menu") renderMenu();
    syncHUD();
  } catch (error) {
    if (operationEpoch !== storageConflictEpoch) {
      protectConflictedSession();
    } else if (
      error instanceof CampaignSaveError &&
      error.code === "conflict"
    ) {
      // CAS remains authoritative when cross-tab broadcasts are unavailable.
      // Close the stale confirmation before opening checkpoint recovery, so
      // Load and Export cannot end up behind a modal decision dialog.
      confirmation = undefined;
      $<HTMLDialogElement>("campaign-confirm").close();
      dockAfterConfirmation = false;
      menuAfterConfirmation = false;
      handleSaveError(error);
    } else
      $("campaign-confirm-error").textContent =
        error instanceof Error
          ? error.message
          : "This action could not be completed.";
  } finally {
    confirmBusy = false;
    $<HTMLButtonElement>("campaign-confirm-accept").disabled = false;
    $<HTMLButtonElement>("campaign-confirm-cancel").disabled = false;
    syncHUD();
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
        " completed asteroid milestones and " +
        Object.keys(state.worlds).length +
        " visited destination(s)? If this is a different expedition, your current valid saved campaign is kept in Campaign archives (three most recent).",
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
  clearPilotInput();
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
      clearPilotInput();
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
function background() {
  clearPilotInput();
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
  storageConflictEpoch++;
  protectConflictedSession();
});

async function boot() {
  const loaded = await store.load();
  if (loaded.state) {
    campaign = new Campaign(loaded.state);
    requireResumeAfterRestore();
    overlay = "menu";
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
      highContrast: () => preferences.highContrast,
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
