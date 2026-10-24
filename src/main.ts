import Phaser from "phaser";
import {
  Mine,
  createState,
  decodeSave,
  SAVE_KEY,
  WIDTH,
  HEIGHT,
  SURFACE,
  ORES,
  capacity,
  maxFuel,
  maxHull,
  cargoValue,
  upgradeCost,
  type Direction,
  type Ore,
  type Upgrade,
} from "./model";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
$("app").innerHTML = `
<header><a class="wordmark" href="./"><span class="brand-icon">M</span> MOTHERLOAD<span class="edition">FIELD EDITION / 01</span></a><span class="status"><i></i> SYSTEMS ONLINE</span></header>
<main><section class="intro"><div><div class="eyebrow">MARS OPERATIONS · SECTOR 07</div><h1>The deep frontier<span>.</span></h1><p>A little deeper. A little richer. Make it back in one piece.</p></div><div class="save-tools"><span id="save-status">LOCAL SAVE · READY</span><div><button id="save">Save</button><button id="load">Load</button><button id="pause" aria-pressed="false">Pause</button></div></div></section>
<div class="dashboard"><section class="mission"><div class="telemetry"><div><span>DEPTH</span><strong id="depth">0 <small>m</small></strong></div><div><span>CREDITS</span><strong id="money">$60</strong></div><div><span>CARGO VALUE</span><strong id="value">$0</strong></div><div class="location"><i></i><span id="location">SURFACE BASE</span></div></div><div id="game" role="application" aria-label="Mining game. Arrow keys or WASD to drive and drill; up to fly."></div><div class="message"><span>◈</span><p id="message" role="status"></p></div><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrow keys <b>Move & drill</b></span><span><kbd>↑</kbd> Fly <span class="dot">·</span> <kbd>P</kbd> Pause</span></div><div class="touch" aria-label="Touch driving controls"><button data-dir="left" aria-label="Move left">←</button><button data-dir="up" aria-label="Fly upward">↑</button><button data-dir="down" aria-label="Drill down">↓</button><button data-dir="right" aria-label="Move right">→</button></div></section>
<aside><section class="panel rig"><div class="panel-title"><h2>YOUR RIG</h2><span id="rig-level">MK. I</span></div><div class="rig-title"><span class="rig-symbol">▰</span><div><strong>The Prospector</strong><small>LIGHT MINING VEHICLE</small></div></div><div class="meter-label"><span>Fuel</span><b id="fuel-label"></b></div><div class="meter"><i id="fuel-bar"></i></div><div class="meter-label"><span>Hull integrity</span><b id="hull-label"></b></div><div class="meter hull"><i id="hull-bar"></i></div><div class="cargo-head"><span>Cargo hold</span><b id="cargo-label"></b></div><div id="cargo-slots"></div><div id="cargo-detail">Nothing onboard. Go find something good.</div></section>
<section class="panel station"><div class="panel-title"><h2>SURFACE SERVICES</h2><span id="dock-state" class="badge">DOCKED</span></div><p id="station-note">One more trip starts here.</p><button class="primary" id="sell">Sell minerals <span id="sell-value">$0 →</span></button><div class="service-row"><button id="refuel">Refuel <small>$1 / unit</small></button><button id="repair">Repair <small>$0.70 / unit</small></button></div><div class="upgrade-heading">MAKE YOUR NEXT RUN COUNT</div><div id="upgrades"></div></section>
<section class="field-note"><span>FIELD NOTE / 001</span><p>Your drill cuts sideways and down. Keep a clear route back up, and watch your fuel.</p><button id="recover">Request recovery ↗</button><small>Cargo + 20% of credits · restores 50% fuel & hull</small></section></aside></div>
<footer><span>INDEPENDENT PROTOTYPE · ORIGINAL PLACEHOLDER ART</span><div><span id="record">BEST DEPTH 0 m</span><button id="new-game">New expedition</button></div></footer></main><dialog id="confirm"><h2 id="confirm-title"></h2><p id="confirm-copy"></p><div><button id="cancel">Cancel</button><button id="confirm-action" class="primary">Confirm</button></div></dialog>`;
let mine = new Mine(),
  paused = false,
  storageBlocked = false,
  saveTimer = 0;
try {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    mine = new Mine(decodeSave(saved));
    mine.message = "Expedition restored. Welcome back, pilot.";
    $("save-status").textContent = "LOCAL SAVE · RESTORED";
  }
} catch {
  storageBlocked = true;
  $("save-status").textContent = "SAVE UNAVAILABLE · KEPT INTACT";
  mine.message =
    "Save could not be loaded. Autosave paused; use New expedition to start over.";
}
const upgradeInfo: Record<Upgrade, [string, string]> = {
  drill: ["Drill assembly", "Cut through rock faster"],
  cargo: ["Cargo bay", "+6 mineral slots"],
  tank: ["Fuel tank", "+50 fuel capacity"],
  hull: ["Hull plating", "+40 hull capacity"],
};
$("upgrades").innerHTML = Object.entries(upgradeInfo)
  .map(
    ([key, [name, desc]]) =>
      `<button class="upgrade" id="upgrade-${key}"><span class="upgrade-icon">${key === "drill" ? "⟡" : key === "cargo" ? "▦" : key === "tank" ? "◒" : "⬡"}</span><span><b>${name}</b><small>${desc}</small></span><strong id="price-${key}"></strong></button>`,
  )
  .join("");
function save(manual = false) {
  if (storageBlocked) {
    if (manual)
      mine.message =
        "Saving is paused to protect the existing save. Start a new expedition to replace it.";
    return;
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(mine.state));
    $("save-status").textContent = "LOCAL SAVE · SAVED";
    if (manual) mine.message = "Expedition saved on this device.";
  } catch {
    $("save-status").textContent = "SAVE FAILED";
    mine.message =
      "Device storage is unavailable or full. Keep this tab open; progress is not saved.";
  }
}
function sync() {
  const s = mine.state;
  $("depth").innerHTML = `${Math.max(0, s.y - SURFACE) * 10} <small>m</small>`;
  $("money").textContent = `$${s.money.toLocaleString()}`;
  $("value").textContent = `$${cargoValue(s)}`;
  $("location").textContent = paused
    ? "EXPEDITION PAUSED"
    : mine.docked
      ? "SURFACE BASE"
      : "BELOW THE SURFACE";
  $("fuel-label").textContent = `${Math.ceil(s.fuel)} / ${maxFuel(s)}`;
  $("fuel-bar").style.width = `${(s.fuel / maxFuel(s)) * 100}%`;
  $("fuel-bar").classList.toggle("low", s.fuel < maxFuel(s) * 0.25);
  $("hull-label").textContent = `${Math.ceil(s.hull)} / ${maxHull(s)}`;
  $("hull-bar").style.width = `${(s.hull / maxHull(s)) * 100}%`;
  $("cargo-label").textContent = `${s.inventory.length} / ${capacity(s)}`;
  $("cargo-slots").innerHTML = Array.from(
    { length: capacity(s) },
    (_, i) =>
      `<i style="${s.inventory[i] ? `background:${ORES[s.inventory[i]].color};border-color:${ORES[s.inventory[i]].color}` : ""}"></i>`,
  ).join("");
  $("cargo-detail").textContent = s.inventory.length
    ? Object.entries(ORES)
        .map(([id, ore]) => {
          const n = s.inventory.filter((o) => o === +id).length;
          return n ? `${n} ${ore.name}` : "";
        })
        .filter(Boolean)
        .join(" · ")
    : "Nothing onboard. Go find something good.";
  $("dock-state").textContent = mine.docked ? "DOCKED" : "AWAY";
  $("dock-state").classList.toggle("away", !mine.docked);
  $("station-note").textContent = mine.docked
    ? "One more trip starts here."
    : "Return to depth 0 m for services.";
  $("sell-value").textContent = `$${cargoValue(s)} →`;
  for (const action of ["sell", "refuel", "repair"])
    $<HTMLButtonElement>(action).disabled = !mine.docked;
  for (const key of Object.keys(upgradeInfo) as Upgrade[]) {
    const cost = upgradeCost(s, key);
    $("price-" + key).textContent = cost === Infinity ? "MAX" : `$${cost}`;
    $<HTMLButtonElement>("upgrade-" + key).disabled =
      !mine.docked || s.money < cost;
  }
  $("rig-level").textContent = `DRILL LV. ${s.upgrades.drill + 1}`;
  $("record").textContent = `BEST DEPTH ${s.deepest} m`;
  $("message").textContent = paused
    ? "Expedition paused. Press P or Resume when you’re ready."
    : mine.message;
}
for (const action of ["sell", "refuel", "repair"] as const)
  $(action).onclick = () => {
    mine.service(action);
    save();
    sync();
  };
for (const key of Object.keys(upgradeInfo) as Upgrade[])
  $("upgrade-" + key).onclick = () => {
    mine.service(key);
    save();
    sync();
  };
$("save").onclick = () => {
  save(true);
  sync();
};
$("load").onclick = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) throw new Error("No saved expedition yet.");
    mine = new Mine(decodeSave(raw));
    storageBlocked = false;
    mine.message = "Saved expedition loaded.";
  } catch (error) {
    mine.message = error instanceof Error ? error.message : "Load failed.";
  }
  sync();
};
function togglePause() {
  paused = !paused;
  $("pause").textContent = paused ? "Resume" : "Pause";
  $("pause").setAttribute("aria-pressed", String(paused));
  sync();
}
$("pause").onclick = togglePause;
const keys = new Set<string>();
let touch: Direction | undefined;
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
window.addEventListener("keydown", (e) => {
  if ($<HTMLDialogElement>("confirm").open) return;
  if (mapped[e.key]) {
    e.preventDefault();
    keys.add(e.key);
  }
  if (e.key.toLowerCase() === "p" && !e.repeat) togglePause();
});
window.addEventListener("keyup", (e) => keys.delete(e.key));
function clearInput() {
  keys.clear();
  touch = undefined;
}
window.addEventListener("blur", () => {
  clearInput();
  if (!paused) togglePause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    if (!paused) togglePause();
    save();
  }
});
window.addEventListener("pagehide", () => save());
document.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((button) => {
  button.onpointerdown = (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    touch = button.dataset.dir as Direction;
  };
  button.onpointerup =
    button.onpointercancel =
    button.onlostpointercapture =
      () => {
        touch = undefined;
      };
});
let onConfirm = () => {},
  wasPaused = false;
function confirmAction(title: string, copy: string, fn: () => void) {
  wasPaused = paused;
  paused = true;
  clearInput();
  $("confirm-title").textContent = title;
  $("confirm-copy").textContent = copy;
  onConfirm = fn;
  $<HTMLDialogElement>("confirm").showModal();
}
$("recover").onclick = () =>
  confirmAction(
    "Call surface recovery?",
    "You will lose your cargo and 20% of your credits. The crew restores half your fuel and hull, so you can always start another run.",
    () => mine.recover(),
  );
$("new-game").onclick = () =>
  confirmAction(
    "Start a new expedition?",
    "This replaces the saved expedition on this device. Your terrain, credits, and upgrades will be reset.",
    () => {
      mine = new Mine(createState());
      storageBlocked = false;
    },
  );
$("cancel").onclick = () => $<HTMLDialogElement>("confirm").close();
$("confirm-action").onclick = () => {
  onConfirm();
  save();
  $<HTMLDialogElement>("confirm").close();
};
$<HTMLDialogElement>("confirm").onclose = () => {
  paused = wasPaused;
  sync();
};

class MineScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private px = 400;
  private py = 112;
  private cameraY = 0;
  private elapsed = 0;
  private uiTimer = 0;
  create() {
    this.g = this.add.graphics();
    for (let i = 0; i < 20; i++)
      this.labels.push(
        this.add
          .text(0, 0, "", {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#c8ba9c",
          })
          .setDepth(2),
      );
    sync();
  }
  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.25);
    this.elapsed += dt;
    const direction =
      touch ??
      Array.from(keys)
        .map((k) => mapped[k])
        .filter(Boolean)
        .at(-1);
    if (!paused) {
      for (let remaining = dt; remaining > 0; remaining -= 0.05)
        mine.tick(Math.min(remaining, 0.05), direction);
      saveTimer += dt;
      if (saveTimer > 5) {
        save();
        saveTimer = 0;
      }
    }
    this.uiTimer += dt;
    if (this.uiTimer > 0.1) {
      sync();
      this.uiTimer = 0;
    }
    const s = mine.state,
      g = this.g,
      tile = 32;
    this.px = Phaser.Math.Linear(
      this.px,
      s.x * tile + 16,
      Math.min(1, dt * 18),
    );
    this.py = Phaser.Math.Linear(
      this.py,
      s.y * tile + 16,
      Math.min(1, dt * 18),
    );
    this.cameraY = Phaser.Math.Linear(
      this.cameraY,
      Math.max(0, this.py - 240),
      Math.min(1, dt * 8),
    );
    const cam = this.cameraY;
    g.clear();
    g.fillStyle(0x182525);
    g.fillRect(0, 0, 768, 576);
    for (const label of this.labels) label.setVisible(false);
    let li = 0;
    const text = (x: number, y: number, value: string, color = "#c8ba9c") => {
      const label = this.labels[li++];
      if (label)
        label.setPosition(x, y).setText(value).setColor(color).setVisible(true);
    };
    if (cam < 128) {
      g.fillStyle(0x273e3c);
      g.fillRect(0, -cam, 768, 128);
      g.fillStyle(0x52625a);
      g.fillCircle(637, 40 - cam, 23);
      g.fillStyle(0x273e3c);
      g.fillCircle(629, 33 - cam, 22);
      g.fillStyle(0x344842);
      g.fillPoints(
        [
          { x: 0, y: 110 - cam },
          { x: 85, y: 48 - cam },
          { x: 140, y: 91 - cam },
          { x: 240, y: 42 - cam },
          { x: 355, y: 115 - cam },
          { x: 470, y: 64 - cam },
          { x: 570, y: 110 - cam },
          { x: 702, y: 70 - cam },
          { x: 768, y: 111 - cam },
          { x: 768, y: 128 - cam },
          { x: 0, y: 128 - cam },
        ],
        true,
      );
      // Original, geometric placeholder base buildings.
      for (const [x, name, c] of [
        [40, "ORE EXCHANGE", 0x9cab9b],
        [510, "FUEL / REPAIR", 0xd29e62],
      ] as const) {
        g.fillStyle(0x1b2929);
        g.fillRect(x, 74 - cam, 180, 54);
        g.fillStyle(c);
        g.fillRect(x, 74 - cam, 180, 4);
        g.fillStyle(0x3d514b);
        g.fillRect(x + 10, 90 - cam, 40, 26);
        g.fillRect(x + 130, 90 - cam, 36, 26);
        text(x + 14, 57 - cam, name);
        g.lineStyle(1, 0x6b7f70);
        g.strokeRect(x, 74 - cam, 180, 54);
      }
      g.lineStyle(2, 0xaab496);
      g.lineBetween(290, 128 - cam, 290, 43 - cam);
      g.lineBetween(282, 43 - cam, 298, 43 - cam);
      g.fillStyle(0xe2b46f);
      g.fillTriangle(290, 43 - cam, 318, 49 - cam, 290, 58 - cam);
    }
    const first = Math.max(4, Math.floor(cam / 32)),
      last = Math.min(HEIGHT - 1, Math.ceil((cam + 576) / 32));
    for (let y = first; y <= last; y++)
      for (let x = 0; x < WIDTH; x++) {
        const t = mine.tile(x, y),
          sx = x * 32,
          sy = y * 32 - cam,
          n = (x * 73 + y * 137) % 19;
        if (!t) {
          g.fillStyle(0x141e1c);
          g.fillRect(sx, sy, 32, 32);
          if ((x + y) % 3 === 0) {
            g.fillStyle(0x22302b);
            g.fillRect(sx + 10, sy + 23, 3, 2);
          }
          continue;
        }
        const colors = [
          0, 0x66513d, 0x4b5148, 0x6a5741, 0x6c553c, 0x4d5740, 0x4a4f50,
          0x773d2d, 0x303a35,
        ];
        g.fillStyle(colors[t] + (n > 10 ? 0x030303 : 0));
        g.fillRect(sx + 1, sy + 1, 31, 31);
        g.fillStyle(0x000000, 0.14);
        g.fillTriangle(sx + 1, sy + 31, sx + 31, sy + 31, sx + 31, sy + 10);
        g.fillStyle(0xffffff, 0.06);
        g.fillRect(sx + 3, sy + 3, 23, 2);
        if (t >= 3 && t <= 6) {
          const c = Phaser.Display.Color.HexStringToColor(
            ORES[t as Ore].color,
          ).color;
          g.fillStyle(c, 0.18);
          g.fillCircle(sx + 16, sy + 16, 11);
          g.fillStyle(c);
          g.fillTriangle(sx + 8, sy + 19, sx + 13, sy + 9, sx + 19, sy + 17);
          g.fillTriangle(sx + 17, sy + 22, sx + 21, sy + 12, sx + 26, sy + 21);
          g.fillStyle(0xffffff, 0.5);
          g.fillRect(sx + 12, sy + 11, 2, 3);
        } else if (t === 7) {
          g.fillStyle(0xf29b4f);
          g.fillTriangle(sx + 5, sy + 25, sx + 14, sy + 5, sx + 26, sy + 23);
        } else {
          g.lineStyle(1, 0x000000, 0.17);
          g.lineBetween(sx + 7, sy + 11, sx + 16 + (n % 5), sy + 17);
          g.lineBetween(sx + 16, sy + 17, sx + 12, sy + 25);
        }
      }
    g.fillStyle(0xa3ac7c);
    g.fillRect(0, 128 - cam, 768, 3);
    for (let y = Math.max(8, Math.ceil(first / 8) * 8); y <= last; y += 8) {
      g.lineStyle(1, 0xe7d9b5, 0.1);
      g.lineBetween(0, y * 32 - cam, 768, y * 32 - cam);
      text(10, y * 32 - cam + 8, `${(y - SURFACE) * 10} m`, "#b2a68a");
    }
    const px = this.px,
      py = this.py - cam;
    g.fillStyle(0xe6c16d, 0.05);
    g.fillCircle(px, py, 65);
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(px, py + 14, 35, 9);
    if (direction === "up" && !paused && s.fuel > 0 && s.hull > 0) {
      g.fillStyle(0xf5c667);
      g.fillTriangle(
        px - 7,
        py + 10,
        px + 7,
        py + 10,
        px,
        py + 24 + Math.sin(this.elapsed * 40) * 5,
      );
    }
    g.fillStyle(0x1a2222);
    g.fillRoundedRect(px - 17, py + 4, 34, 10, 4);
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x718176);
      g.fillCircle(px - 11 + i * 7, py + 9, 3);
    }
    g.fillStyle(s.hull > 0 ? 0xe5b55e : 0x85745c);
    g.fillRoundedRect(px - 14, py - 11, 28, 20, 4);
    g.fillStyle(0x93c3c1);
    g.fillRoundedRect(px - 8, py - 9, 15, 10, 2);
    g.fillStyle(0xdaece2);
    g.fillRect(px - 6, py - 7, 4, 2);
    g.fillStyle(0xa4b4a6);
    if (direction === "left")
      g.fillTriangle(px - 14, py - 3, px - 14, py + 8, px - 25, py + 3);
    else if (direction === "right")
      g.fillTriangle(px + 14, py - 3, px + 14, py + 8, px + 25, py + 3);
    else g.fillTriangle(px - 7, py + 13, px + 7, py + 13, px, py + 23);
    g.fillStyle(0xf9ecc1);
    g.fillRect(px + 11, py - 6, 4, 4);
    if (mine.progress > 0) {
      g.fillStyle(0x172320);
      g.fillRect(px - 20, py - 23, 40, 4);
      g.fillStyle(0xe6ba6e);
      g.fillRect(px - 20, py - 23, 40 * mine.progress, 4);
    }
    if (paused || s.fuel <= 0 || s.hull <= 0) {
      g.fillStyle(0x0d1818, 0.6);
      g.fillRect(0, 0, 768, 576);
      text(
        278,
        250,
        paused ? "EXPEDITION PAUSED" : "RIG DISABLED · CALL RECOVERY",
        "#f4d29a",
      );
    }
  }
}
new Phaser.Game({
  type: Phaser.AUTO,
  width: 768,
  height: 576,
  parent: "game",
  backgroundColor: "#182525",
  scene: MineScene,
  render: { antialias: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: false },
  fps: { smoothStep: false },
  banner: false,
  audio: { noAudio: true },
});
