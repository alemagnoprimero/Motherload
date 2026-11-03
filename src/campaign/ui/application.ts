import {
  configureConfirmation,
  confirmationSummaryMarkup,
  setupConfirmationControls,
} from "./confirmation";
import { renderLegend as renderLegendView } from "./legend";
import { renderTitle as renderTitleView } from "./title";
import {
  renderPauseTabs as renderPauseTabsView,
  renderBindings as renderBindingsView,
  renderPauseMenu,
} from "./pause";
import { renderGuidance } from "./guidance";
import { renderDockView } from "./terminal";
import { renderNavigation } from "./navigation";
import { journalMarkup, claimMapMarkup, contractMarkup } from "./journal";
import { moveFocus } from "./focus";
import { cameraSafeArea, updateWorldLabels } from "./world-labels";
import { RewardPresentation } from "./rewards";
import type { CampaignEvent } from "../events";
import { tradeMarkup } from "./terminal/trade";
import { workshopMarkup } from "./terminal/workshop";
import { constructionMarkup } from "./terminal/construction";
import { nextAction } from "./terminal/shared";
import { NoticeQueue } from "../notices";
import { coachStep } from "../onboarding";
import { itemName, hardwareName } from "../names";
import { HUD_ART, hudIcon } from "./icons";
import { shellMarkup } from "./shell";
import { patchMarkup } from "./dom";
import Phaser from "phaser";
import { Campaign, createCampaign } from "../model";
import { createCampaignScene } from "../scene";
import {
  CampaignSaveError,
  CampaignStore,
  MAX_CAMPAIGN_BYTES,
  type CampaignArchive,
} from "../persistence";
import {
  HARDWARE_KEYS,
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  WORLD_CATALOG,
  formatCredits,
} from "../config";
import {
  CampaignInput,
  ACTION_LABELS,
  keyLabel,
  loadPilotPreferences,
  savePilotPreferences,
  type PilotAction,
  type MenuAction,
} from "../input";
import { CampaignAudio } from "../audio";
import { campaignMission } from "../missions";
import { campaignSignal } from "../poi";
import { W02_ORES } from "../frontier";
import {
  CAMPAIGN_ORE_LEGEND,
  CAMPAIGN_HAZARD_LEGEND,
} from "../../mineral-legend";
import type { CampaignState, HardwareKey } from "../types";
import "../style.css";

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
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let campaign = new Campaign(createCampaign(seed()));
const store = new CampaignStore();
const preferences = loadPilotPreferences();
const audio = new CampaignAudio(preferences);
const notices = new NoticeQueue();
const rewards = new RewardPresentation();
let pauseTab = "expedition";
let settingsFromTitle = false;
let hasCheckpoint = false;
let rigCueUntil = 0;
let mapTab = "stars";
type Overlay = "welcome" | "menu" | "dock" | "map" | undefined;
let overlay: Overlay = "welcome";
const overlayStack: Exclude<Overlay, undefined>[] = [];
const pauseHistory: string[] = [];
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
let confirmationIntent = configureConfirmation("Continue", "");
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

patchMarkup($("app"), shellMarkup());

patchMarkup(
  $("campaign-menu-toggle"),
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18"><path fill="currentColor" d="M3 2h3v12H3zm7 0h3v12h-3z"/></svg>',
);
patchMarkup($("campaign-map-toggle"), hudIcon("map"));
const cargoSection = document.createElement("section");
patchMarkup(
  cargoSection,
  '<h2>Cargo manifest</h2><div id="campaign-menu-cargo"></div>',
);
document.querySelector(".pause-grid")!.append(cargoSection);
const legendSection = document.createElement("section");
patchMarkup(
  legendSection,
  '<details id="campaign-legend"><summary>Ore and hazard legend</summary><ul id="campaign-legend-list" class="campaign-legend-list"></ul></details>',
);
document.querySelector(".pause-grid")!.append(legendSection);
function renderLegend() {
  renderLegendView(campaign);
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
patchMarkup(
  archiveSection,
  '<h2>Campaign archives</h2><p class="muted">The last three replaced campaigns stay here independently of autosave backups. Restores start paused.</p><div id="campaign-archives"></div><p id="campaign-archive-status" role="status"></p>',
);
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
patchMarkup(
  undockPrompt,
  '<p id="campaign-undock-warning"></p><div><button data-command="refuel-undock" class="primary"></button><button data-command="undock-anyway">Undock anyway</button></div>',
);
$("campaign-dock-content").before(undockPrompt);

const recentSection = document.createElement("section");
patchMarkup(
  recentSection,
  '<h2>Recent notices</h2><ol id="campaign-recent-notices"></ol>',
);
document.querySelector(".pause-grid")!.append(recentSection);
const journalSection = document.createElement("section");
patchMarkup(
  journalSection,
  '<h2>Journal</h2><div id="campaign-pause-journal"></div>',
);
document.querySelector(".pause-grid")!.append(journalSection);
const pauseNav = document.createElement("nav");
pauseNav.className = "pause-tabs";
pauseNav.setAttribute("aria-label", "Pilot console sections");
patchMarkup(
  pauseNav,
  [
    ["expedition", "Expedition"],
    ["save", "Save data"],
    ["systems", "Settings"],
    ["controls", "Controls"],
    ["journal", "Journal"],
  ]
    .map(([id, label]) => `<button data-pause-tab="${id}">${label}</button>`)
    .join(""),
);
$("campaign-menu").querySelector("header")!.after(pauseNav);
const padHint = document.createElement("p");
padHint.className = "controller-hints";
padHint.textContent = "D-pad select · A activate · B back";
$("campaign-menu").append(padHint);
const contractDrawer = document.createElement("details");
contractDrawer.className = "mission-detail contract-drawer";
patchMarkup(
  contractDrawer,
  '<summary>Contracts</summary><div id="campaign-contracts"></div>',
);
document.querySelector(".objective-copy")!.append(contractDrawer);
const reserveButton = document.createElement("button");
reserveButton.id = "campaign-use-reserve";
reserveButton.dataset.command = "reserve";
reserveButton.className = "tool-slot";
reserveButton.textContent = "Steam reserve";
reserveButton.hidden = true;
document.querySelector(".campaign-toolbar")!.append(reserveButton);

const input = new CampaignInput(preferences, {
  blocked: () => paused(),
  interact: openDock,
  map: openMap,
  pause: () => {
    if (skipLaunch()) return;
    if (rewards.active) {
      rewards.skip();
      clearPilotInput();
      return;
    }
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

function renderTitle() {
  renderTitleView(campaign, hasCheckpoint);
}
function renderPauseTabs() {
  renderPauseTabsView(campaign, pauseTab, notices);
}
function syncGuideAndReserve() {
  renderGuidance(campaign, preferences, overlay, rigCueUntil, showMessage);
}
function handleGameEvent(event: CampaignEvent) {
  audio.handleEvent(event);
  if (
    event.type === "sale" ||
    event.type === "install" ||
    event.type === "construction" ||
    event.type === "travel"
  )
    rewards.show(event, preferences.reducedMotion);
  if (event.type === "volatile" && event.phase === "warning") {
    setText(
      "campaign-rig-cue",
      matchMedia("(pointer:coarse)").matches
        ? "Release joystick"
        : "Release drilling",
    );
    setHidden("campaign-rig-cue", false);
    rigCueUntil = performance.now() + (event.duration ?? 1.5) * 1000;
  }
  if (
    (event.type === "pressure" && event.phase === "warning") ||
    (event.type === "shelf" && event.phase === "warning")
  ) {
    setText("campaign-rig-cue", "Move clear");
    setHidden("campaign-rig-cue", false);
    rigCueUntil = performance.now() + 1500;
    notices.push("Unstable rock · move clear", 1);
  }
  if (event.type === "damage") {
    document.body.classList.add("campaign-hit");
    setTimeout(() => document.body.classList.remove("campaign-hit"), 160);
    if (preferences.haptics) navigator.vibrate?.(35);
  }
  if (event.type === "interaction") {
    if (event.action === "footing") {
      setText("campaign-rig-cue", "Need firm footing");
      setHidden("campaign-rig-cue", false);
      rigCueUntil = performance.now() + 2000;
    }
    if (event.action === "hold-full")
      showMessage(`Hold full · ${campaign.cargoBulk}/${campaign.capacity}`, 3);
  }
  if (event.type === "discovery") showMessage(event.name, 2);
}
function clearPilotInput() {
  input.clear();
  campaign.clearInputAssist();
}
function paused() {
  return Boolean(
    overlay ||
    rewards.active ||
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
  if (!concise) return;
  const lane = /^Hold full/.test(concise)
    ? 2
    : /cold|volatile|release|pressure|shelf|hazard/i.test(concise)
      ? 1
      : (priority && priority >= 2) ||
          /surveyed|secured|restored|complete|constructed|sold/i.test(concise)
        ? 2
        : 3;
  notices.push(concise, lane);
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
function openOverlay(
  kind: Exclude<typeof overlay, undefined>,
  remember = true,
) {
  if (kind === "welcome") overlayStack.length = 0;
  else if (remember && overlay && overlay !== kind && overlay !== "welcome")
    overlayStack.push(overlay);
  if (kind === "menu" && !overlay) {
    pauseTab = "expedition";
    pauseHistory.length = 0;
  }
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
    renderPauseTabs();
    void refreshArchives();
  }
  if (kind === "map") renderMap();
  if (kind === "welcome") renderTitle();
  $<HTMLDialogElement>("campaign-" + kind).showModal();
  if (kind === "menu") syncMenuHeaderInset();
  audio.update(0, true, false, false);
}
function closeOverlay(skipRefuelCheck = false) {
  if (restoring || confirmBusy) return;
  if (settingsFromTitle) {
    settingsFromTitle = false;
    openOverlay("welcome");
    return;
  }
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
  if (overlay !== "dock" && overlayStack.length) {
    openOverlay(overlayStack.pop()!, false);
    return;
  }
  overlayStack.length = 0;
  if (overlay) $<HTMLDialogElement>("campaign-" + overlay).close();
  overlay = undefined;
  delete document.body.dataset.campaignOverlay;
  clearPilotInput();
  undockCheck = false;
  $("campaign-game").focus({ preventScroll: true });
  syncHUD();
}
function menuControl(action: MenuAction) {
  if (skipLaunch()) return;
  if (rewards.active) {
    rewards.skip();
    clearPilotInput();
    return;
  }
  if (action === "back") {
    if (overlay === "menu" && !confirmation && pauseHistory.length) {
      pauseTab = pauseHistory.pop()!;
      renderPauseTabs();
      return;
    }
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
  moveFocus(host, action);
}
function openDock() {
  if (overlay || !initialized) return;
  if (!campaign.atDock) {
    const log = campaign.nearbyFieldLogs[0],
      cache = campaign.nearbyCaches[0];
    if (log) {
      void transact(() => campaign.readFieldLog(log.id));
      ask(log.title, log.text, () => {});
      return;
    }
    if (cache) {
      void transact(() => campaign.openCache(cache.id));
      return;
    }
  }
  openOverlay("dock");
}
function openMap() {
  mapTab = campaign.state.progress.completed.includes(2) ? "stars" : "claim";
  openOverlay("map");
}
function applyPreferences() {
  document.documentElement.style.setProperty(
    "--ui-scale",
    String(preferences.uiScale),
  );
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
  $<HTMLSelectElement>("campaign-ui-scale").value = String(preferences.uiScale);
  $<HTMLSelectElement>("campaign-render-scale").value = String(
    preferences.renderScale,
  );
  setText("campaign-title-sound", preferences.sound ? "Sound on" : "Sound off");
  setText("campaign-sound", preferences.sound ? "Mute sound" : "Enable sound");
  savePilotPreferences(preferences);
  audio.settings();
}
function renderBindings() {
  renderBindingsView(preferences);
}
function renderMenu() {
  syncSafety();
  renderPauseMenu(
    campaign,
    preferences,
    blocked,
    conflict,
    busy,
    confirmBusy,
    backupAvailable,
  );
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
        patchMarkup(
          $("campaign-archives"),
          entries.length
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
            : '<p class="muted">No archived campaigns yet.</p>',
        );
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
  setText("campaign-energy", v.energy.toFixed(1) + "/" + campaign.maxEnergy);
  setText(
    "campaign-hull",
    Math.max(0, v.hull).toFixed(v.hull % 1 ? 1 : 0) + "/" + campaign.maxHull,
  );
  setText("campaign-cargo", campaign.cargoBulk + "/" + campaign.capacity);
  setText("campaign-credits", formatCredits(s.credits));
  setText("campaign-depth", campaign.depth + "m");
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
    $("campaign-objective-step").textContent = objective.step.replace(
      /\s/g,
      "",
    );
    $("campaign-objective-title").textContent = objective.title;
    const primaryTask =
      objective.tasks.find((task) => task.status !== "complete")?.id ??
      objective.tasks[0]?.id;
    patchMarkup(
      $("campaign-objective-all"),
      objective.tasks.map((task) => `<p>${escape(task.label)}</p>`).join(""),
    );
    patchMarkup(
      $("campaign-objective-progress"),
      objective.tasks
        .map(
          (task) =>
            '<li data-primary="' +
            String(task.id === primaryTask) +
            '" data-task="' +
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
        .join(""),
    );
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
      ? "Toggle shaft brace"
      : "Hold to deploy shaft brace",
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
  $<HTMLButtonElement>("campaign-map-toggle").disabled = Boolean(overlay);
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
    if (preferences.alarm) audio.event("warning");
  }
  energyWarningBand = nextWarning;
  document
    .querySelector(".energy-vital")!
    .classList.toggle(
      "warning-pulse",
      performance.now() < energyPulseUntil && !preferences.reducedMotion,
    );
  syncMissionSignal(objective.next);
  const notice = notices.current(
    performance.now(),
    !$("campaign-extraction").hidden
      ? 0
      : document.body.dataset.campaignDanger === "true"
        ? 2
        : 3,
  );
  $("campaign-message").classList.toggle("visible", Boolean(notice));
  setHidden("campaign-message", !notice);
  if (notice) setText("campaign-message", notice.text);
  syncGuideAndReserve();
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
function renderDock() {
  renderDockView(campaign, dockTab, busy, undockCheck, presentationMessage);
}
function renderMap() {
  renderNavigation(campaign, mapTab, busy);
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
      hasCheckpoint = true;
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
  overlayStack.length = 0;
  pauseHistory.length = 0;
  pauseTab = "save";
  settingsFromTitle = false;
  confirmationControls.reset(confirmationIntent.verb);
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
      hasCheckpoint = true;
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
  confirmationIntent = configureConfirmation(title, copy);
  confirmationControls.reset(confirmationIntent.verb);
  patchMarkup(
    $("campaign-confirm-impact"),
    confirmationSummaryMarkup(confirmationIntent),
  );
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
  operation: () => unknown,
  event: "pickup" | "build" | "purchase" = "purchase",
) {
  if (busy || conflict) return;
  const changed = operation();
  if (changed) {
    await persist();
  }
  syncHUD();
  if (overlay === "dock") renderDock();
  if (overlay === "menu") renderMenu();
}
async function command(name: string) {
  if (confirmBusy && name !== "export") return;
  if (name === "toggle-sound") {
    $("campaign-sound").click();
    return;
  }
  if (name === "skip-coach") {
    preferences.coachSkipped = true;
    savePilotPreferences(preferences);
    syncHUD();
    return;
  }
  if (name === "reset-bindings") {
    input.resetBindings();
    renderBindings();
    return;
  }
  if (name === "title-settings") {
    settingsFromTitle = true;
    pauseTab = "systems";
    openOverlay("menu");
    return;
  }
  if (name === "title") {
    await persist();
    settingsFromTitle = false;
    openOverlay("welcome");
    return;
  }
  if (name === "reserve") {
    if (!busy && !conflict && !overlay) {
      await transact(() => campaign.useReserve());
      $("campaign-game").focus();
    }
    return;
  }
  if (name.startsWith("contract-accept:")) {
    await transact(() => campaign.acceptContract(name.slice(16)));
    renderPauseTabs();
    return;
  }
  if (name.startsWith("contract-claim:")) {
    await transact(() => campaign.claimContract(name.slice(15)));
    renderPauseTabs();
    return;
  }
  if (name === "waypoint-current") {
    await transact(() =>
      campaign.setWaypoint(
        campaign.state.vehicle.x,
        campaign.state.vehicle.y,
        "Return marker",
      ),
    );
    renderMap();
    return;
  }
  if (name.startsWith("waypoint-remove:")) {
    await transact(() => campaign.removeWaypoint(name.slice(16)));
    renderMap();
    return;
  }

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
    campaign.releaseVolatile();
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
        preferences.coachStep = 0;
        preferences.coachSkipped = false;
        savePilotPreferences(preferences);
        await replaceCampaign(createCampaign(seed()));
        hasCheckpoint = true;
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
function skipLaunch() {
  if (!launchUntil) return false;
  launchUntil = 0;
  setHidden("campaign-launch", true);
  clearPilotInput();
  openOverlay("map");
  return true;
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
  if (!target) {
    const cell = (event.target as HTMLElement).closest<SVGElement>(
      "[data-map-x]",
    );
    if (cell && !conflict) {
      void transact(() =>
        campaign.setWaypoint(
          Number(cell.dataset.mapX) + 0.5,
          Number(cell.dataset.mapY) + 0.5,
          "Survey marker",
        ),
      ).then(renderMap);
    }
    return;
  }
  if (target.dataset.command) {
    void command(target.dataset.command);
    return;
  }
  if (target.dataset.workshopTab) {
    dockTab = target.dataset.workshopTab;
    renderDock();
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
  if (target.dataset.remap)
    input.remap(
      target.dataset.remap as PilotAction,
      Number(target.dataset.slot) || 0,
    );
  if (target.dataset.padRemap)
    input.remapGamepad(target.dataset.padRemap as PilotAction);
  if (target.dataset.pauseTab) {
    if (pauseTab !== target.dataset.pauseTab) pauseHistory.push(pauseTab);
    pauseTab = target.dataset.pauseTab;
    renderPauseTabs();
  }
  if (target.dataset.mapTab) {
    mapTab = target.dataset.mapTab;
    renderMap();
  }
});
$("campaign-menu-toggle").onclick = () => openOverlay("menu");
$("campaign-disabled-menu").onclick = () => openOverlay("menu");
$("campaign-dock-toggle").onclick = openDock;
$("campaign-map-toggle").onclick = openMap;
$("campaign-start").onclick = async () => {
  void audio.unlock();
  if (blocked || conflict || restoring) {
    pauseTab = "save";
    openOverlay("menu");
    return;
  }
  hasCheckpoint = true;
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
  confirmationControls.reset(confirmationIntent.verb);
  confirmation = undefined;
  $<HTMLDialogElement>("campaign-confirm").close();
  overlay = confirmReturn;
  syncHUD();
};
const performConfirmation = async () => {
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
const confirmationControls = setupConfirmationControls({
  button: $<HTMLButtonElement>("campaign-confirm-accept"),
  onConfirm: performConfirmation,
  requiresHold: () => confirmationIntent.requiresHold,
});
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
  preferences.sound = !audio.muted;
  savePilotPreferences(preferences);
  setText("campaign-title-sound", preferences.sound ? "Sound on" : "Sound off");
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
    hasCheckpoint = true;
    overlay = "welcome";
    if (preferences.coachStep === 0 && campaign.state.hardware.energy > 0)
      preferences.coachStep = 12;
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
    type:
      new URLSearchParams(location.search).get("renderer") === "canvas"
        ? Phaser.CANVAS
        : Phaser.AUTO,
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
      getSafeArea: cameraSafeArea,
      onView: (view) =>
        updateWorldLabels(
          view,
          campaign,
          Boolean(overlay) || !preferences.assists,
        ),
      renderScale: () => preferences.renderScale,
      cameraShake: () => preferences.shake,
      onEvent: handleGameEvent,
      presentationActive: () => rewards.active,
      onUpdate: (dt: number) => {
        input.pollCommands();
        rewards.update();
        audio.setState({
          worldId: campaign.state.currentWorld,
          depth: campaign.depth,
          danger: campaign.returnReserve.state,
        });
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
        lastMined = campaign.state.stats.mined;
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

let rewardInputConsumedUntil = 0;
for (const name of ["pointerdown", "keydown", "click"] as const)
  window.addEventListener(
    name,
    (event) => {
      if (rewards.active || launchUntil) {
        rewards.skip();
        skipLaunch();
        clearPilotInput();
        rewardInputConsumedUntil = performance.now() + 180;
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (
        name === "click" &&
        performance.now() < rewardInputConsumedUntil
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
$("campaign-ui-scale").addEventListener("change", (event) => {
  preferences.uiScale = Number((event.target as HTMLSelectElement).value);
  applyPreferences();
});
$("campaign-render-scale").addEventListener("change", (event) => {
  preferences.renderScale = Number((event.target as HTMLSelectElement).value);
  applyPreferences();
});
