import Phaser from "phaser";
import {
  Mine,
  createState,
  SAVE_KEY,
  ORES,
  UPGRADE_KEYS,
  UPGRADE_LEVELS,
  capacity,
  maxFuel,
  maxHull,
  cargoValue,
  cargoMass,
  upgradeCost,
  depth,
  type Controls,
  type Direction,
  type State,
  type Upgrade,
} from "./model";
import {
  SaveStore,
  SaveError,
  SAVE_BACKUP_KEY,
  MAX_SAVE_BYTES,
  type StorageLike,
} from "./storage";
import { createMineScene } from "./scene";
import { GameAudio } from "./audio";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
$("app").innerHTML = `
<header><a class="wordmark" href="./"><span class="brand-icon">M</span> MOTHERLOAD<span class="edition">FIELD EDITION / 02</span></a><span class="status"><i></i> SYSTEMS ONLINE</span></header>
<main><section class="intro"><div><div class="eyebrow">MARS OPERATIONS · SECTOR 07</div><h1>The deep frontier<span>.</span></h1><p>A little deeper. A little richer. Make it back in one piece.</p></div><div class="save-tools"><span id="save-status" role="status">LOCAL SAVE · READY</span><span>YOUR EXPEDITION · YOUR DEVICE</span></div></section>
<div id="storage-notice" class="storage-notice" role="alert" hidden><span id="storage-copy"></span><button id="reload-external" hidden>Load newer save</button><button id="notice-tools">Save tools</button></div>
<div class="dashboard"><section class="mission" aria-label="Mining expedition"><div class="telemetry"><div><span>DEPTH</span><strong id="depth">0 <small>m</small></strong></div><div><span>CREDITS</span><strong id="money">$20</strong></div><div class="cargo-value"><span>CARGO VALUE</span><strong id="value">$0</strong></div><div class="location"><i></i><span id="location">SURFACE BASE</span></div></div>
<div id="flight-hud" class="flight-hud" aria-label="Vehicle status"><div><span>FUEL</span><strong id="hud-fuel">6 / 10 L</strong><i><b id="hud-fuel-bar"></b></i></div><div><span>HULL</span><strong id="hud-hull">10 / 10</strong><i><b id="hud-hull-bar"></b></i></div><div><span>CARGO</span><strong id="hud-cargo">0 / 7</strong><i><b id="hud-cargo-bar"></b></i></div></div>
<div class="game-actions"><button id="pause" aria-pressed="false">Pause</button><button id="station-toggle" aria-controls="station-panel" aria-expanded="false">Base</button><button id="save">Save</button><button id="load">Load</button><button id="tools-toggle" aria-haspopup="dialog">Tools</button><button id="focus" aria-pressed="false" aria-label="Expand the game to fill the screen">Expand</button><button id="sound-toggle" aria-pressed="false" aria-label="Enable sound">♪ Off</button></div>
<div id="game" role="application" aria-label="Mining game. Arrow keys or WASD to drive and drill; Up to fly."></div><div class="message"><span aria-hidden="true">◈</span><p id="message" role="status"></p></div><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows <b>Drive & drill</b></span><span><kbd>↑</kbd> + <kbd>←</kbd><kbd>→</kbd> Steer in flight <span class="dot">·</span> <kbd>P</kbd> Pause</span></div><div class="touch" aria-label="Touch driving controls"><button data-dir="left" aria-label="Move left">←</button><button data-dir="up" aria-label="Fly upward">↑</button><button data-dir="down" aria-label="Drill down">↓</button><button data-dir="right" aria-label="Move right">→</button></div></section>
<aside id="station-panel" aria-label="Rig and surface services"><div class="station-close"><strong>BASE & RIG</strong><button id="close-station" aria-label="Close base panel">Back to mine ×</button></div><section class="panel rig"><div class="panel-title"><h2>YOUR RIG</h2><span id="rig-level">DRILL LV. 1</span></div><div class="rig-title"><span class="rig-symbol">▰</span><div><strong>The Prospector</strong><small id="engine-level">ENGINE LV. 1</small></div></div><div class="meter-label"><span>Fuel</span><b id="fuel-label"></b></div><div class="meter"><i id="fuel-bar"></i></div><div class="meter-label"><span>Hull integrity</span><b id="hull-label"></b></div><div class="meter hull"><i id="hull-bar"></i></div><div class="cargo-head"><span>Cargo hold</span><b id="cargo-label"></b></div><div id="cargo-slots"></div><div id="cargo-detail">Nothing onboard. Go find something good.</div><small id="cargo-mass"></small></section>
<section class="panel station"><div class="panel-title"><h2>SURFACE SERVICES</h2><span id="dock-state" class="badge">DOCKED</span></div><p id="station-note">One more trip starts here.</p><p id="station-feedback" class="station-feedback" role="status"></p><button class="primary" id="sell">Sell minerals <span id="sell-value">$0 →</span></button><div class="service-row"><button id="refuel">Refuel <small>$1 / liter</small></button><button id="repair">Repair <small>$15 / hull point</small></button></div><div class="upgrade-heading">MAKE YOUR NEXT RUN COUNT</div><div id="upgrades"></div></section>
<section class="field-note"><span>FIELD NOTE / 002</span><p>Hold Up + Left/Right to fly and steer together. Land on a ledge to drill sideways. Cuts finish before the rig responds to thrust. Counter-steer to brake. Heavy cargo needs more engine power.</p><button id="recover">Request recovery ↗</button><small>Cargo + 20% of credits · restores 50% fuel & hull</small></section></aside></div>
<footer><span>INDEPENDENT REMAKE · ORIGINAL ART & SOUND</span><div><span id="record">BEST DEPTH 0 m</span><button id="new-game">New expedition</button></div></footer></main>
<button id="station-backdrop" aria-label="Close base panel" hidden></button>
<dialog id="tools" aria-labelledby="tools-title"><div class="dialog-heading"><h2 id="tools-title">Expedition tools</h2><button id="close-tools" aria-label="Close expedition tools">×</button></div><p>Save files let you move an expedition between computers and phones. Browser saves stay on this device.</p><div class="save-file-actions"><button id="export-save">Export save ↓</button><label class="file-button" for="import-save">Import save ↑<input type="file" id="import-save" accept="application/json,.json" /></label><button id="restore-backup">Restore backup</button></div><p id="tools-status" role="status"></p><div class="audio-setting"><label for="sound-volume">Sound volume</label><input id="sound-volume" type="range" min="0" max="100" value="45" /><output id="volume-label" for="sound-volume">45%</output></div><p class="small-copy">Sound starts only after you enable it. Export before clearing browser data or changing devices.</p><button id="tools-new-game">New expedition</button></dialog>
<dialog id="confirm" aria-labelledby="confirm-title"><h2 id="confirm-title"></h2><p id="confirm-copy"></p><p id="confirm-error" role="alert"></p><div><button id="cancel">Cancel</button><button id="confirm-action" class="primary">Confirm</button></div></dialog>`;

const keys = new Set<string>();
const touches = new Map<number, Direction>();
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let mine = new Mine(createState(randomSeed()));
let paused = false;
let storageBlocked = false;
let externalConflict = false;
let saveTimer = 0;
let uiTimer = 0;
let persistenceBusy = false;
let savePromise: Promise<boolean> | undefined;
let stationWasPaused = false;
let toolsWasPaused = false;
let focusMode = false;
let nativeFullscreen = false;
let muted = true;
let volume = 0.45;
const audio = new GameAudio();
let storage: StorageLike;
try {
  storage = localStorage;
} catch {
  storage = {
    getItem: () => {
      throw new Error("Device storage unavailable");
    },
    setItem: () => {
      throw new Error("Device storage unavailable");
    },
  };
}
try {
  const preferences = JSON.parse(
    storage.getItem("motherload.preferences.v1") || "null",
  );
  if (
    preferences &&
    typeof preferences.volume === "number" &&
    Number.isFinite(preferences.volume)
  )
    volume = Math.max(0, Math.min(1, preferences.volume));
} catch {
  /* Invalid audio preferences do not block expedition storage. */
}
const saves = new SaveStore(storage);
audio.setMuted(muted);
audio.setVolume(volume);
$("sound-volume").setAttribute("value", String(Math.round(volume * 100)));
$("volume-label").textContent = `${Math.round(volume * 100)}%`;

const upgradeInfo: Record<Upgrade, [string, string, string]> = {
  drill: ["Drill assembly", "Faster cuts through deeper terrain", "⟡"],
  engine: ["Engine", "More thrust for heavier loads", "↟"],
  tank: ["Fuel tank", "More liters for the return trip", "◒"],
  cargo: ["Cargo bay", "More mineral slots per expedition", "▦"],
  hull: ["Hull plating", "More protection from impacts and hazards", "⬡"],
};
$("upgrades").innerHTML = UPGRADE_KEYS.map((key) => {
  const [name, description, icon] = upgradeInfo[key];
  return `<button class="upgrade" id="upgrade-${key}"><span class="upgrade-icon" aria-hidden="true">${icon}</span><span><b>${name}</b><small id="upgrade-detail-${key}">${description}</small></span><strong id="price-${key}"></strong></button>`;
}).join("");

function clearInput() {
  keys.clear();
  touches.clear();
  document
    .querySelectorAll("[data-dir]")
    .forEach((button) => button.classList.remove("held"));
}
function setPaused(value: boolean) {
  if (externalConflict) value = true;
  if (value) clearInput();
  paused = value;
  $("pause").textContent = paused ? "Resume" : "Pause";
  $("pause").setAttribute("aria-pressed", String(paused));
  audio.update(mine, paused);
  sync();
}
function setBusy(value: boolean) {
  persistenceBusy = value;
  document.body.dataset.saving = String(value);
  $<HTMLButtonElement>("save").disabled = value;
  $("save").textContent = value ? "Saving…" : "Save";
  $<HTMLButtonElement>("load").disabled = value;
  $<HTMLButtonElement>("confirm-action").disabled = value;
  $<HTMLButtonElement>("cancel").disabled = value;
  if (value) {
    for (const id of [
      "sell",
      "refuel",
      "repair",
      ...UPGRADE_KEYS.map((key) => `upgrade-${key}`),
    ])
      $<HTMLButtonElement>(id).disabled = true;
  }
}
function showStorageNotice(message = "", conflict = false) {
  $("storage-notice").hidden = !message;
  $("storage-copy").textContent = message;
  $("reload-external").hidden = !conflict;
}
function showError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The expedition could not be saved.";
  mine.message = message;
  $("tools-status").textContent = message;
  $("save-status").textContent = "LOCAL SAVE · NEEDS ATTENTION";
  if (
    error instanceof SaveError &&
    (error.code === "conflict" || error.code === "blocked")
  ) {
    storageBlocked = true;
    if (error.code === "conflict") externalConflict = true;
    setPaused(true);
  }
  showStorageNotice(
    message,
    error instanceof SaveError && error.code === "conflict",
  );
  sync();
}
function refreshBackupButton() {
  try {
    const backup = storage.getItem(SAVE_BACKUP_KEY);
    $<HTMLButtonElement>("restore-backup").disabled = !backup;
  } catch {
    $<HTMLButtonElement>("restore-backup").disabled = true;
  }
}
function loadSaved(manual = false) {
  if (persistenceBusy) return;
  const result = saves.load();
  externalConflict = false;
  storageBlocked = result.blocked;
  if (result.state) {
    mine = new Mine(result.state);
    mine.message = result.notice || "Expedition restored. Welcome back, pilot.";
    saveTimer = 0;
    clearInput();
  } else if (manual) {
    mine.message = result.notice || "No saved expedition yet.";
  }
  $("save-status").textContent = result.blocked
    ? "LOCAL SAVE · KEPT INTACT"
    : result.state
      ? "LOCAL SAVE · RESTORED"
      : "LOCAL SAVE · READY";
  showStorageNotice(result.notice || "");
  refreshBackupButton();
  sync();
}
async function save(manual = false): Promise<boolean> {
  if (persistenceBusy) return savePromise || false;
  if (storageBlocked) {
    if (manual) {
      mine.message =
        "Saving is paused to protect the existing expedition. Use Load or the save tools.";
      sync();
    }
    return false;
  }
  setBusy(true);
  $("save-status").textContent = "LOCAL SAVE · SAVING";
  try {
    await saves.save(mine.state);
    $("save-status").textContent = "LOCAL SAVE · SAVED";
    if (manual) mine.message = "Expedition saved on this device.";
    showStorageNotice();
    refreshBackupButton();
    return true;
  } catch (error) {
    showError(error);
    return false;
  } finally {
    setBusy(false);
    sync();
  }
}
function requestSave(manual = false) {
  if (!savePromise) {
    savePromise = save(manual).finally(() => {
      savePromise = undefined;
    });
  }
  return savePromise;
}
async function replaceExpedition(state: State) {
  if (savePromise) await savePromise;
  setBusy(true);
  try {
    await saves.replace(state);
    mine = new Mine(state);
    mine.message = "Expedition ready. Saving continues on this device.";
    $("tools-status").textContent = "Expedition loaded and saved successfully.";
    storageBlocked = false;
    externalConflict = false;
    saveTimer = 0;
    clearInput();
    $("save-status").textContent = "LOCAL SAVE · SAVED";
    showStorageNotice();
    refreshBackupButton();
  } finally {
    setBusy(false);
    sync();
  }
}

const liters = (value: number) => value.toFixed(1).replace(/\.0$/, "");
function sync() {
  const state = mine.state;
  const fuel = `${liters(state.fuel)} / ${maxFuel(state)}`;
  const hull = `${Math.ceil(state.hull)} / ${maxHull(state)}`;
  const cargo = `${state.inventory.length} / ${capacity(state)}`;
  $("depth").innerHTML = `${depth(state)} <small>m</small>`;
  $("money").textContent = `$${state.money.toLocaleString()}`;
  $("value").textContent = `$${cargoValue(state).toLocaleString()}`;
  $("location").textContent = paused
    ? "EXPEDITION PAUSED"
    : mine.docked
      ? "SURFACE BASE"
      : "BELOW THE SURFACE";
  $("fuel-label").textContent = fuel;
  $("hull-label").textContent = hull;
  $("cargo-label").textContent = cargo;
  $("hud-fuel").textContent = `${fuel} L`;
  $("hud-hull").textContent = hull;
  $("hud-cargo").textContent = cargo;
  for (const id of ["fuel-bar", "hud-fuel-bar"]) {
    $(id).style.width = `${Math.max(0, (state.fuel / maxFuel(state)) * 100)}%`;
    $(id).classList.toggle("low", state.fuel < maxFuel(state) * 0.25);
  }
  for (const id of ["hull-bar", "hud-hull-bar"]) {
    $(id).style.width = `${Math.max(0, (state.hull / maxHull(state)) * 100)}%`;
    $(id).classList.toggle("low", state.hull < maxHull(state) * 0.25);
  }
  $("hud-cargo-bar").style.width =
    `${Math.min(100, (state.inventory.length / capacity(state)) * 100)}%`;
  $("hud-cargo-bar").classList.toggle(
    "low",
    state.inventory.length >= capacity(state),
  );
  $("cargo-slots").innerHTML = Array.from(
    { length: capacity(state) },
    (_, index) => {
      const ore = state.inventory[index];
      return `<i ${ore ? `title="${ORES[ore].name}" style="background:${ORES[ore].color};border-color:${ORES[ore].color}"` : ""}></i>`;
    },
  ).join("");
  $("cargo-detail").textContent = state.inventory.length
    ? Object.entries(ORES)
        .map(([id, ore]) => {
          const count = state.inventory.filter((entry) => entry === +id).length;
          return count ? `${count} ${ore.name}` : "";
        })
        .filter(Boolean)
        .join(" · ")
    : "Nothing onboard. Go find something good.";
  $("cargo-mass").textContent =
    `CARGO MASS ${cargoMass(state)} · ENGINE LV. ${state.upgrades.engine + 1}`;
  $("dock-state").textContent = mine.docked ? "DOCKED" : "AWAY";
  $("dock-state").classList.toggle("away", !mine.docked);
  $("station-note").textContent = mine.docked
    ? "Sell your haul, service the rig, then improve the next trip."
    : "Return to depth 0 m to sell, service and upgrade.";
  $("station-feedback").textContent = mine.message;
  $("sell-value").textContent = `$${cargoValue(state).toLocaleString()} →`;
  for (const action of ["sell", "refuel", "repair"])
    $<HTMLButtonElement>(action).disabled = !mine.docked || persistenceBusy;
  for (const key of UPGRADE_KEYS) {
    const cost = upgradeCost(state, key);
    $("price-" + key).textContent =
      cost === Infinity ? "MAX" : `$${cost.toLocaleString()}`;
    $<HTMLButtonElement>("upgrade-" + key).disabled =
      !mine.docked || state.money < cost || persistenceBusy;
    const level = state.upgrades[key];
    const current = UPGRADE_LEVELS[key][level];
    const next = UPGRADE_LEVELS[key][level + 1];
    const unit = {
      drill: "drill speed",
      engine: "power",
      tank: "L",
      cargo: "slots",
      hull: "hull points",
    }[key];
    $("upgrade-detail-" + key).textContent =
      next === undefined
        ? `Level ${level + 1} · ${current} ${unit} · fully upgraded`
        : `Level ${level + 1} · ${current} → ${next} ${unit}`;
    $("upgrade-" + key).title = upgradeInfo[key][1];
  }
  $("rig-level").textContent = `DRILL LV. ${state.upgrades.drill + 1}`;
  $("engine-level").textContent = `ENGINE LV. ${state.upgrades.engine + 1}`;
  $("record").textContent = `BEST DEPTH ${state.deepest} m`;
  $("message").textContent = paused ? `Paused · ${mine.message}` : mine.message;
}
for (const action of ["sell", "refuel", "repair"] as const)
  $(action).onclick = async () => {
    if (persistenceBusy) return;
    if (mine.service(action))
      audio.play(action === "sell" ? "sell" : "service");
    await requestSave();
    sync();
  };
for (const key of UPGRADE_KEYS)
  $("upgrade-" + key).onclick = async () => {
    if (persistenceBusy) return;
    if (mine.service(key)) audio.play("upgrade");
    await requestSave();
    sync();
  };
$("save").onclick = () => {
  void requestSave(true);
};
$("load").onclick = () => loadSaved(true);
$("pause").onclick = () => setPaused(!paused);
$("reload-external").onclick = () => {
  loadSaved(true);
  setPaused(true);
};

function openStation() {
  stationWasPaused = paused;
  setPaused(true);
  document.body.classList.add("station-open");
  $("station-panel").setAttribute("role", "dialog");
  $("station-panel").setAttribute("aria-modal", "true");
  $("station-toggle").setAttribute("aria-expanded", "true");
  $("station-backdrop").hidden = false;
  $("close-station").focus();
}
function closeStation() {
  document.body.classList.remove("station-open");
  $("station-panel").removeAttribute("role");
  $("station-panel").removeAttribute("aria-modal");
  $("station-toggle").setAttribute("aria-expanded", "false");
  $("station-backdrop").hidden = true;
  setPaused(stationWasPaused);
  $("station-toggle").focus();
}
$("station-toggle").onclick = openStation;
$("close-station").onclick = closeStation;
$("station-backdrop").onclick = closeStation;
function openTools() {
  if ($<HTMLDialogElement>("tools").open) return;
  toolsWasPaused = paused;
  setPaused(true);
  refreshBackupButton();
  $<HTMLDialogElement>("tools").showModal();
}
$("tools-toggle").onclick = openTools;
$("notice-tools").onclick = openTools;
$("close-tools").onclick = () => $<HTMLDialogElement>("tools").close();
$<HTMLDialogElement>("tools").onclose = () => setPaused(toolsWasPaused);

let confirmWasPaused = false;
let confirmOperation: () => void | Promise<void> = () => {};
function confirmAction(
  title: string,
  copy: string,
  operation: () => void | Promise<void>,
) {
  confirmWasPaused = paused;
  setPaused(true);
  $("confirm-title").textContent = title;
  $("confirm-copy").textContent = copy;
  $("confirm-error").textContent = "";
  confirmOperation = operation;
  $<HTMLDialogElement>("confirm").showModal();
}
$("cancel").onclick = () => $<HTMLDialogElement>("confirm").close();
$("confirm-action").onclick = async () => {
  try {
    await confirmOperation();
    $<HTMLDialogElement>("confirm").close();
  } catch (error) {
    $("confirm-error").textContent =
      error instanceof Error
        ? error.message
        : "The expedition could not be changed.";
    showError(error);
  }
};
$<HTMLDialogElement>("confirm").oncancel = (event) => {
  if (persistenceBusy) event.preventDefault();
};
$<HTMLDialogElement>("confirm").onclose = () => setPaused(confirmWasPaused);
$("recover").onclick = () =>
  confirmAction(
    "Call surface recovery?",
    "You will lose your cargo and 20% of your credits. The crew restores half your fuel and hull, so you can start another run.",
    async () => {
      mine.recover();
      await requestSave();
    },
  );
const newExpedition = () =>
  confirmAction(
    "Start a new expedition?",
    "This replaces the current expedition with a new mine. Your previous valid save will be kept as a backup. Export a file first if you want a separate copy.",
    () => replaceExpedition(createState(randomSeed())),
  );
$("new-game").onclick = newExpedition;
$("tools-new-game").onclick = newExpedition;
$("restore-backup").onclick = () =>
  confirmAction(
    "Restore the backup expedition?",
    "This replaces your current progress with the previous saved expedition. The current valid save will become the backup.",
    async () => {
      if (savePromise) await savePromise;
      setBusy(true);
      try {
        const state = await saves.restoreBackup();
        mine = new Mine(state);
        mine.message = "Backup expedition restored.";
        $("tools-status").textContent = mine.message;
        storageBlocked = false;
        externalConflict = false;
        saveTimer = 0;
        showStorageNotice();
        $("save-status").textContent = "LOCAL SAVE · BACKUP RESTORED";
      } finally {
        setBusy(false);
        refreshBackupButton();
        sync();
      }
    },
  );
$("export-save").onclick = () => {
  try {
    const raw = saves.export(mine.state);
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `motherload-${mine.state.seed}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $("tools-status").textContent =
      "Save file exported. Keep it to import on another device.";
  } catch (error) {
    showError(error);
  }
};
$<HTMLInputElement>("import-save").onchange = async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_SAVE_BYTES)
      throw new Error("Save files must be at most 256 KiB.");
    const state = saves.inspectImport(await file.text());
    confirmAction(
      "Import this expedition?",
      `Replace current progress with a mine at ${depth(state)} m, $${state.money.toLocaleString()}, and ${state.inventory.length} minerals onboard? Your current valid save will become the backup.`,
      () => replaceExpedition(state),
    );
  } catch (error) {
    $("tools-status").textContent =
      error instanceof Error
        ? error.message
        : "This file could not be imported.";
  } finally {
    input.value = "";
  }
};

const mapped: Record<string, Direction> = {
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
  ArrowUp: "up",
  w: "up",
  ArrowDown: "down",
  s: "down",
};
const dialogOpen = () =>
  $<HTMLDialogElement>("confirm").open || $<HTMLDialogElement>("tools").open;
window.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.body.classList.contains("station-open") &&
    !dialogOpen()
  ) {
    closeStation();
    return;
  }
  if (dialogOpen()) return;
  if (document.body.classList.contains("station-open")) {
    if (event.key === "Tab") {
      const buttons = [
        ...$("station-panel").querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ),
      ];
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if (event.key === "Escape" && focusMode && !document.fullscreenElement) {
    applyFocus(false);
    return;
  }
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  )
    return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (mapped[key]) {
    event.preventDefault();
    keys.add(key);
  }
  if (key.toLowerCase() === "p" && !event.repeat) setPaused(!paused);
  if (!muted) void audio.unlock();
});
window.addEventListener("keyup", (event) =>
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key),
);
window.addEventListener("blur", () => setPaused(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    setPaused(true);
    void requestSave();
  }
});
window.addEventListener("pagehide", () => {
  void requestSave();
});
window.addEventListener("storage", (event) => {
  if (event.key !== SAVE_KEY && event.key !== null) return;
  try {
    if (!saves.hasExternalChange()) return;
    storageBlocked = true;
    externalConflict = true;
    setPaused(true);
    $("save-status").textContent = "LOCAL SAVE · NEWER COPY IN ANOTHER TAB";
    showStorageNotice(
      "Another tab changed this expedition. Load its save before continuing, or export this tab’s progress from Tools.",
      true,
    );
  } catch (error) {
    showError(error);
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((button) => {
  button.onpointerdown = (event) => {
    event.preventDefault();
    if (dialogOpen() || document.body.classList.contains("station-open"))
      return;
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, button.dataset.dir as Direction);
    button.classList.add("held");
    if (!muted) void audio.unlock();
  };
  button.onpointerup =
    button.onpointercancel =
    button.onlostpointercapture =
      (event) => {
        touches.delete(event.pointerId);
        if (![...touches.values()].includes(button.dataset.dir as Direction))
          button.classList.remove("held");
      };
});
$("sound-toggle").onclick = () => {
  muted = !muted;
  audio.setMuted(muted);
  if (!muted) void audio.unlock();
  $("sound-toggle").textContent = muted ? "♪ Off" : "♪ On";
  $("sound-toggle").setAttribute("aria-pressed", String(!muted));
  $("sound-toggle").setAttribute(
    "aria-label",
    muted ? "Enable sound" : "Mute sound",
  );
};
$<HTMLInputElement>("sound-volume").oninput = (event) => {
  volume = Number((event.currentTarget as HTMLInputElement).value) / 100;
  audio.setVolume(volume);
  $("volume-label").textContent = `${Math.round(volume * 100)}%`;
  try {
    storage.setItem("motherload.preferences.v1", JSON.stringify({ volume }));
  } catch {
    /* Preferences do not block play. */
  }
};
function applyFocus(value: boolean) {
  focusMode = value;
  document.body.classList.toggle("focus-mode", value);
  $("focus").textContent = value ? "Window" : "Expand";
  $("focus").setAttribute("aria-pressed", String(value));
  $("focus").setAttribute(
    "aria-label",
    value
      ? "Return to normal game layout"
      : "Expand the game to fill the screen",
  );
  clearInput();
}
$("focus").onclick = async () => {
  if (focusMode) {
    applyFocus(false);
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
  } else {
    applyFocus(true);
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        nativeFullscreen = true;
      } catch {
        /* CSS focus mode remains available. */
      }
    }
  }
};
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && nativeFullscreen) {
    nativeFullscreen = false;
    applyFocus(false);
  }
});

const compactQuery = matchMedia("(max-width: 760px), (pointer: coarse)");
const updateCompactLayout = () =>
  document.body.classList.toggle("compact-layout", compactQuery.matches);
compactQuery.addEventListener("change", updateCompactLayout);
updateCompactLayout();
setBusy(false);
loadSaved();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: $("game").clientWidth,
  height: $("game").clientHeight,
  backgroundColor: "#182525",
  scene: createMineScene({
    getMine: () => mine,
    isPaused: () => paused,
    getControls: () => {
      const controls: Controls = {};
      for (const direction of [
        ...Array.from(keys).map((key) => mapped[key]),
        ...touches.values(),
      ])
        if (direction) controls[direction] = true;
      return controls;
    },
    onUpdate: (dt) => {
      audio.update(mine, paused);
      if (!paused && !storageBlocked) {
        saveTimer += dt;
        if (saveTimer >= 5) {
          saveTimer = 0;
          void requestSave();
        }
      }
      uiTimer += dt;
      if (uiTimer > 0.1) {
        uiTimer = 0;
        sync();
      }
    },
  }),
  render: { antialias: true },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
  input: { keyboard: false },
  fps: { smoothStep: false },
  banner: false,
  audio: { noAudio: true },
});
new ResizeObserver(() => {
  const host = $("game");
  if (host.clientWidth && host.clientHeight)
    game.scale.resize(host.clientWidth, host.clientHeight);
}).observe($("game"));
