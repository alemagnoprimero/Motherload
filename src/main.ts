import Phaser from "phaser";
import {
  Mine,
  createState,
  SAVE_KEY,
  ORES,
  capacity,
  maxFuel,
  maxHull,
  cargoValue,
  cargoMass,
  depth,
  HEIGHT,
  STRATA,
  stratumAtDepth,
  worldHeight,
  maxDepth,
  type Controls,
  type Direction,
  type State,
  nearbyStation,
  stationForAction,
  STATIONS,
  type StationId,
  type ServiceAction,
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
<header class="mission-header"><a class="wordmark" href="./" aria-label="Motherload: The Frontier"><span class="brand-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 25V7h6l6 9 6-9h6v18h-6V16l-6 8-6-8v9Z"/></svg></span><span>MOTHERLOAD<small>THE FRONTIER</small></span></a><span class="mission-label"><i></i> MARS MINING OPERATIONS</span><div class="save-tools"><span id="save-status" role="status">LOCAL SAVE · READY</span><span class="signal" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div></header>
<main>
<div id="storage-notice" class="storage-notice" role="alert" hidden><span id="storage-copy"></span><button id="reload-external" hidden>Load newer save</button><button id="notice-tools">Save tools</button></div>
<div class="dashboard"><section class="mission" aria-label="Mining expedition"><div class="instrument-deck"><div class="telemetry"><div><span>DEPTH</span><strong id="depth">0 <small>m</small></strong></div><div><span>CREDITS</span><strong id="money">$20</strong></div><div class="cargo-value"><span>CARGO VALUE</span><strong id="value">$0</strong></div><div class="location"><i></i><span id="location">SURFACE BASE</span></div></div>
<div id="flight-hud" class="flight-hud" aria-label="Vehicle status"><div><span>FUEL</span><strong id="hud-fuel">6 / 10 L</strong><i><b id="hud-fuel-bar"></b></i></div><div><span>HULL</span><strong id="hud-hull">10 / 10</strong><i><b id="hud-hull-bar"></b></i></div><div><span>CARGO</span><strong id="hud-cargo">0 / 7</strong><i><b id="hud-cargo-bar"></b></i></div></div><div class="frontier-strip" aria-label="Exploration progress"><span class="frontier-region"><i aria-hidden="true"></i><span id="region-label">Surface</span></span><span id="frontier-goal">Next frontier · 300 m</span><span id="frontier-progress" class="frontier-track" role="progressbar" aria-label="Depth exploration" aria-valuemin="0" aria-valuemax="300" aria-valuenow="0"><b id="frontier-fill"></b></span></div></div>
<div class="game-actions"><button id="pause" aria-pressed="false">Pause</button><button id="save">Save</button><button id="load">Load</button><button id="tools-toggle" aria-haspopup="dialog">Tools</button><button id="focus" aria-pressed="false" aria-label="Expand the game to fill the screen">Expand</button><button id="sound-toggle" aria-pressed="false" aria-label="Enable sound">♪ Off</button></div>
<div id="game" role="application" tabindex="0" aria-label="Mining game. Arrows or WASD to drive and drill; Up to fly. Park at a surface building and press E or Enter to use it."></div><div class="message"><span aria-hidden="true">◈</span><p id="message" role="status"></p></div><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows <b>Drive & drill</b></span><span><kbd>↑</kbd> + <kbd>←</kbd><kbd>→</kbd> Steer in flight <span class="dot">·</span> <kbd>E</kbd> Enter building <span class="dot">·</span> <kbd>P</kbd> Pause</span></div><div class="touch" aria-label="Touch driving controls"><button data-dir="left" aria-label="Move left"><span>←</span><small>LEFT</small></button><button data-dir="up" aria-label="Fly upward"><span>↑</span><small>THRUST</small></button><button data-dir="down" aria-label="Drill down"><span>↓</span><small>DRILL</small></button><button data-dir="right" aria-label="Move right"><span>→</span><small>RIGHT</small></button></div></section>
</div>
<footer><span>INDEPENDENT REMAKE · ORIGINAL ART & SOUND</span><div><span id="record">BEST DEPTH 0 m</span><button id="new-game">New expedition</button></div></footer></main>
<dialog id="tools" aria-labelledby="tools-title"><div class="dialog-heading"><h2 id="tools-title">Expedition tools</h2><button id="close-tools" aria-label="Close expedition tools">×</button></div><p>Save files let you move an expedition between computers and phones. Browser saves stay on this device.</p><p id="world-note" class="small-copy" hidden>This expedition retains its original compact mine. New expedition starts the deeper frontier.</p><section class="equipment-summary" aria-label="Current rig"><div><strong id="rig-level"></strong><strong id="engine-level"></strong></div><dl><dt>Fuel</dt><dd id="fuel-label"></dd><dt>Hull</dt><dd id="hull-label"></dd><dt>Cargo</dt><dd id="cargo-label"></dd></dl><p id="cargo-detail"></p><small id="cargo-mass"></small></section><div class="save-file-actions"><button id="export-save">Export save ↓</button><label class="file-button" for="import-save">Import save ↑<input type="file" id="import-save" accept="application/json,.json" /></label><button id="restore-backup">Restore backup</button></div><p id="tools-status" role="status"></p><div class="audio-setting"><label for="sound-volume">Sound volume</label><input id="sound-volume" type="range" min="0" max="100" value="45" /><output id="volume-label" for="sound-volume">45%</output></div><p class="small-copy">Sound starts only after you enable it. Export before clearing browser data or changing devices.</p><div class="recovery-tools"><button id="recover">Request recovery</button><p class="small-copy">Returns to the surface with half fuel and hull. Costs your cargo and 20% of credits.</p><button id="tools-new-game">New expedition</button></div></dialog>
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
let activeStation: StationId | undefined;
type StationCommand = "up" | "down" | "left" | "right" | "confirm";
const stationCommands: StationCommand[] = [];
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

function clearInput() {
  stationCommands.length = 0;
  keys.clear();
  touches.clear();
  document
    .querySelectorAll("[data-dir]")
    .forEach((button) => button.classList.remove("held"));
}
function setPaused(value: boolean) {
  if (externalConflict || activeStation) value = true;
  if (value) clearInput();
  paused = value;
  $("pause").textContent = paused ? "Resume" : "Pause";
  $("pause").setAttribute("aria-pressed", String(paused));
  audio.update(mine, paused);
  sync();
}
function setBusy(value: boolean) {
  if (value) stationCommands.length = 0;
  persistenceBusy = value;
  document.body.dataset.saving = String(value);
  $<HTMLButtonElement>("save").disabled = value;
  $("save").textContent = value ? "Saving…" : "Save";
  $<HTMLButtonElement>("load").disabled = value;
  $<HTMLButtonElement>("confirm-action").disabled = value;
  $<HTMLButtonElement>("cancel").disabled = value;
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
    closeStation(false);
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
  if (activeStation) {
    closeStation(false);
    setPaused(true);
  }
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
  closeStation(false);
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
  const floorDepth = maxDepth(state);
  const exploredDepth = Math.min(state.deepest, floorDepth);
  const nextFrontier =
    STRATA.find(
      (layer) => layer.depth > exploredDepth && layer.depth <= floorDepth,
    )?.depth ?? floorDepth;
  const previousFrontier =
    STRATA.filter((layer) => layer.depth <= exploredDepth).at(-1)?.depth ?? 0;
  const frontierComplete = exploredDepth >= floorDepth;
  const progress = frontierComplete
    ? 1
    : Math.max(
        0,
        Math.min(
          1,
          (exploredDepth - previousFrontier) /
            Math.max(1, nextFrontier - previousFrontier),
        ),
      );
  $("region-label").textContent =
    depth(state) === 0 ? "Surface" : stratumAtDepth(depth(state)).name;
  $("frontier-goal").textContent = frontierComplete
    ? `Mine floor reached · ${floorDepth.toLocaleString()} m`
    : `Next frontier · ${nextFrontier.toLocaleString()} m`;
  $("frontier-fill").style.width = `${progress * 100}%`;
  $("frontier-progress").setAttribute(
    "aria-valuemin",
    String(previousFrontier),
  );
  $("frontier-progress").setAttribute("aria-valuemax", String(nextFrontier));
  $("frontier-progress").setAttribute("aria-valuenow", String(exploredDepth));
  $("frontier-progress").setAttribute(
    "aria-valuetext",
    frontierComplete
      ? `Mine floor reached at ${floorDepth} meters.`
      : `Best depth ${exploredDepth} meters. Next frontier ${nextFrontier} meters.`,
  );
  $("world-note").hidden = worldHeight(state) >= HEIGHT;
  $("fuel-label").textContent = fuel;
  $("hull-label").textContent = hull;
  $("cargo-label").textContent = cargo;
  $("hud-fuel").textContent = `${fuel} L`;
  $("hud-hull").textContent = hull;
  $("hud-cargo").textContent = cargo;
  for (const id of ["hud-fuel-bar"]) {
    $(id).style.width = `${Math.max(0, (state.fuel / maxFuel(state)) * 100)}%`;
    $(id).classList.toggle("low", state.fuel < maxFuel(state) * 0.25);
  }
  for (const id of ["hud-hull-bar"]) {
    $(id).style.width = `${Math.max(0, (state.hull / maxHull(state)) * 100)}%`;
    $(id).classList.toggle("low", state.hull < maxHull(state) * 0.25);
  }
  $("hud-cargo-bar").style.width =
    `${Math.min(100, (state.inventory.length / capacity(state)) * 100)}%`;
  $("hud-cargo-bar").classList.toggle(
    "low",
    state.inventory.length >= capacity(state),
  );
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
  $("rig-level").textContent = `DRILL LV. ${state.upgrades.drill + 1}`;
  $("engine-level").textContent = `ENGINE LV. ${state.upgrades.engine + 1}`;
  $("record").textContent = `BEST DEPTH ${state.deepest} m`;
  const nearby = nearbyStation(state);
  $("location").textContent = activeStation
    ? STATIONS.find(
        (station) => station.id === activeStation,
      )!.name.toUpperCase()
    : nearby
      ? nearby.name.toUpperCase()
      : paused
        ? "EXPEDITION PAUSED"
        : mine.docked
          ? "SURFACE"
          : "BELOW THE SURFACE";
  const cargoFull = state.inventory.length >= capacity(state);
  document.body.classList.toggle("cargo-full", cargoFull);
  $("hud-cargo").title = cargoFull
    ? "Cargo full. New ore will be lost until you sell your cargo."
    : "Minerals carried / cargo capacity";
  const statusMessage = activeStation
    ? mine.message
    : paused
      ? `Paused · ${mine.message}`
      : nearby
        ? `${mine.message} · E / Enter or tap the ${nearby.name.toLowerCase()} to enter.`
        : mine.message;
  $("message").textContent =
    (cargoFull ? "Cargo full · New ore will be lost. " : "") + statusMessage;
  $("game").setAttribute(
    "aria-label",
    activeStation
      ? `${STATIONS.find((station) => station.id === activeStation)!.name} menu. Arrow keys or Tab select; Enter confirms; Escape closes. ${mine.message}`
      : "Mining game. Arrows or WASD to drive and drill; Up to fly. Park at a surface building and press E or Enter to use it.",
  );
  $<HTMLButtonElement>("pause").disabled = Boolean(activeStation);
  document
    .querySelectorAll<HTMLButtonElement>("[data-dir]")
    .forEach((button) => {
      button.disabled = Boolean(activeStation);
    });
}
async function performStationService(action: ServiceAction) {
  if (persistenceBusy || savePromise || !activeStation || externalConflict)
    return;
  if (
    stationForAction(action) !== activeStation ||
    nearbyStation(mine.state)?.id !== activeStation
  ) {
    mine.message =
      "Park at the correct surface building before using its services.";
    closeStation(false);
    setPaused(true);
    return;
  }
  if (mine.service(action)) {
    audio.play(
      action === "sell"
        ? "sell"
        : action === "refuel" || action === "repair"
          ? "service"
          : "upgrade",
    );
    await requestSave();
  }
  sync();
}
$("save").onclick = () => {
  void requestSave(true);
};
$("load").onclick = () => loadSaved(true);
$("pause").onclick = () => setPaused(!paused);
$("reload-external").onclick = () => {
  loadSaved(true);
  setPaused(true);
};

function openStation(id: StationId) {
  if (activeStation || persistenceBusy || dialogOpen() || externalConflict)
    return;
  const nearby = nearbyStation(mine.state);
  if (!nearby || nearby.id !== id) {
    mine.message = "Park beside the building at the surface to enter.";
    sync();
    return;
  }
  stationWasPaused = paused;
  mine.velocityX = 0;
  mine.velocityY = 0;
  activeStation = id;
  document.body.dataset.station = id;
  mine.message = `${nearby.name}. Choose a service in the game; arrows or Tab select, Enter confirms, Escape closes.`;
  setPaused(true);
  $("game").focus({ preventScroll: true });
}
function closeStation(resume = true) {
  const wasOpen = Boolean(activeStation);
  activeStation = undefined;
  delete document.body.dataset.station;
  clearInput();
  if (wasOpen && resume) setPaused(stationWasPaused);
  else if (wasOpen) sync();
}
function openTools() {
  if ($<HTMLDialogElement>("tools").open) return;
  toolsWasPaused = activeStation ? stationWasPaused : paused;
  closeStation(false);
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
  confirmWasPaused = activeStation ? stationWasPaused : paused;
  closeStation(false);
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
      closeStation(false);
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
        closeStation(false);
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
  if (dialogOpen()) return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  )
    return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (activeStation) {
    if (key === "Escape") {
      event.preventDefault();
      closeStation();
      return;
    }
    const direction = mapped[key];
    if (direction || key === "Tab" || key === "Enter") {
      event.preventDefault();
      if (!persistenceBusy && !savePromise && stationCommands.length < 16) {
        if (key === "Enter") {
          if (!event.repeat && !stationCommands.includes("confirm"))
            stationCommands.push("confirm");
        } else {
          const command =
            key === "Tab" ? (event.shiftKey ? "up" : "down") : direction;
          if (command) stationCommands.push(command);
        }
      }
    }
    return;
  }
  // Enter still activates ordinary toolbar controls when they have focus.
  if (
    key === "Enter" &&
    event.target instanceof Element &&
    event.target.closest("button, a, summary")
  )
    return;
  if ((key === "e" || key === "Enter") && !event.repeat) {
    const nearby = nearbyStation(mine.state);
    if (nearby) {
      event.preventDefault();
      openStation(nearby.id);
      return;
    }
  }
  if (key === "Escape" && focusMode && !document.fullscreenElement) {
    applyFocus(false);
    return;
  }
  if (mapped[key]) {
    event.preventDefault();
    keys.add(key);
    $("game").focus({ preventScroll: true });
  }
  if (key.toLowerCase() === "p" && !event.repeat) setPaused(!paused);
  if (!muted) void audio.unlock();
});
window.addEventListener("keyup", (event) =>
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key),
);
function pauseForBackground() {
  stationWasPaused = true;
  toolsWasPaused = true;
  confirmWasPaused = true;
  closeStation(false);
  setPaused(true);
}
window.addEventListener("blur", pauseForBackground);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseForBackground();
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
    closeStation(false);
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
    if (dialogOpen() || activeStation) return;
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
  backgroundColor: "#0b111b",
  scene: createMineScene({
    getMine: () => mine,
    isPaused: () => paused,
    getStation: () => activeStation,
    onOpenStation: openStation,
    onCloseStation: closeStation,
    onService: (action: ServiceAction) => {
      void performStationService(action);
    },
    isBusy: () => persistenceBusy || Boolean(savePromise),
    getStationCommand: () => stationCommands.shift(),
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
  // ResizeObserver owns the canvas size, including layout-only changes when a
  // station hides touch controls. Phaser's automatic RESIZE mode would also
  // resize from its cached parent bounds and could restore the previous size.
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
  input: { keyboard: false },
  fps: { smoothStep: false },
  banner: false,
  audio: { noAudio: true },
});
new ResizeObserver(() => {
  const host = $("game");
  if (host.clientWidth && host.clientHeight) {
    game.canvas.style.width = `${host.clientWidth}px`;
    game.canvas.style.height = `${host.clientHeight}px`;
    game.scale.resize(host.clientWidth, host.clientHeight);
  }
}).observe($("game"));
