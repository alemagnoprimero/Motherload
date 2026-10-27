import type Phaser from "phaser";
import {
  STATIONS,
  ORES,
  UPGRADE_LEVELS,
  capacity,
  cargoValue,
  maxFuel,
  maxHull,
  upgradeCost,
  type Mine,
  type ServiceAction,
  type StationId,
  type Upgrade,
} from "./model";
import {
  insideRect,
  stationActions,
  stationLayout,
  type CanvasRect,
} from "./station-layout";

export type StationCommand = "up" | "down" | "left" | "right" | "confirm";
interface StationBindings {
  onCloseStation: () => void;
  onService: (action: ServiceAction) => void;
}
interface Offer {
  title: string;
  shortTitle?: string;
  detail: string;
  shortDetail?: string;
  description: string;
  button: string;
  enabled: boolean;
}
const UPGRADE_LABELS: Record<
  Upgrade,
  { name: string; unit: string; detail: string }
> = {
  drill: {
    name: "Drill assembly",
    unit: "Drill speed",
    detail: "Finish each cut faster.",
  },
  tank: {
    name: "Fuel tank",
    unit: "Liters",
    detail: "Travel farther before returning for fuel.",
  },
  cargo: {
    name: "Cargo bay",
    unit: "Mineral slots",
    detail: "Carry more minerals on every expedition.",
  },
  hull: {
    name: "Hull plating",
    unit: "Hull points",
    detail: "Withstand harder landings and hazards.",
  },
  engine: {
    name: "Engine",
    unit: "Engine power",
    detail: "Accelerate and climb faster under load.",
  },
};
const dollars = (value: number) => `$${Math.ceil(value).toLocaleString()}`;
const number = (value: number) => Number(value.toFixed(1)).toLocaleString();
function offer(mine: Mine, action: ServiceAction): Offer {
  const s = mine.state;
  if (action === "sell") {
    const value = cargoValue(s);
    return {
      title: "Sell minerals",
      detail: `${s.inventory.length} minerals · cargo value ${dollars(value)}`,
      description: "Empty the cargo hold and receive the full sale value.",
      button: value ? `Sell for ${dollars(value)}` : "Cargo empty",
      enabled: value > 0,
    };
  }
  if (action === "refuel" || action === "repair") {
    const fuel = action === "refuel";
    const maximum = fuel ? maxFuel(s) : maxHull(s),
      current = fuel ? s.fuel : s.hull;
    const rate = fuel ? 1 : 15,
      missing = Math.max(0, maximum - current);
    const amount = Math.min(missing, s.money / rate);
    const cost = Math.min(s.money, Math.ceil(amount * rate - 1e-9));
    return {
      title: fuel ? "Refuel tank" : "Repair hull",
      detail: `${number(current)} / ${maximum} ${fuel ? "L" : "HP"} · $${rate} / ${fuel ? "L" : "HP"}`,
      description:
        amount < missing
          ? `Your credits buy ${number(amount)} ${fuel ? "liters" : "hull points"}.`
          : fuel
            ? "Fill the tank for your next descent."
            : "Restore the hull before taking another risk.",
      button:
        missing <= 1e-8
          ? fuel
            ? "Tank full"
            : "Hull repaired"
          : amount <= 0
            ? "Need credits"
            : `${fuel ? "Refuel" : "Repair"} · ${dollars(cost)}`,
      enabled: missing > 1e-8 && amount > 0,
    };
  }
  const info = UPGRADE_LABELS[action];
  const tier = s.upgrades[action],
    values = UPGRADE_LEVELS[action],
    next = values[tier + 1];
  const price = upgradeCost(s, action);
  return {
    title: `${info.name} · LV ${tier + 1}`,
    shortTitle: `${action[0].toUpperCase() + action.slice(1)} · LV ${tier + 1}`,
    detail: `${info.unit} ${values[tier]}${next === undefined ? " · MAX" : ` → ${next}`}`,
    shortDetail: `${values[tier]}${next === undefined ? " · MAX" : ` → ${next}`}`,
    description: info.detail,
    button: !Number.isFinite(price)
      ? "Fully upgraded"
      : `${s.money < price ? "Need" : "Buy"} ${dollars(price)}`,
    enabled: Number.isFinite(price) && s.money >= price,
  };
}

// Small equipment silhouettes share the rig's metal / instrument palette.
function equipmentIcon(
  g: Phaser.GameObjects.Graphics,
  action: ServiceAction,
  x: number,
  y: number,
) {
  g.fillStyle(0x0c1927, 0.9);
  g.fillRoundedRect(x, y, 36, 36, 8);
  g.lineStyle(1.5, 0x84d7e6, 0.95);
  const cx = x + 18,
    cy = y + 18;
  if (action === "drill") {
    g.fillStyle(0x91a8bd);
    g.fillRect(cx - 5, cy - 11, 10, 6);
    g.fillStyle(0xffbc72);
    g.fillTriangle(cx - 9, cy - 4, cx + 9, cy - 4, cx, cy + 12);
    g.lineStyle(1.5, 0x3a4050);
    g.lineBetween(cx - 7, cy, cx + 6, cy + 1);
    g.lineBetween(cx - 4, cy + 5, cx + 3, cy + 6);
  } else if (action === "tank" || action === "refuel") {
    g.fillStyle(0x376983);
    g.fillRoundedRect(cx - 8, cy - 11, 16, 24, 5);
    g.lineStyle(1.5, 0x84d7e6);
    g.strokeRoundedRect(cx - 8, cy - 11, 16, 24, 5);
    g.lineBetween(cx - 8, cy - 5, cx + 8, cy - 5);
    g.fillStyle(0xffbc72);
    g.fillRect(cx - 2, cy - 14, 4, 4);
    g.fillRect(cx - 4, cy + 2, 8, 7);
  } else if (action === "cargo" || action === "sell") {
    g.fillStyle(0x477e98);
    g.fillTriangle(cx - 11, cy - 5, cx, cy - 11, cx + 11, cy - 5);
    g.lineBetween(cx - 11, cy - 5, cx, cy + 1);
    g.lineBetween(cx, cy + 1, cx + 11, cy - 5);
    g.lineBetween(cx - 11, cy - 5, cx - 11, cy + 8);
    g.lineBetween(cx + 11, cy - 5, cx + 11, cy + 8);
    g.lineBetween(cx - 11, cy + 8, cx, cy + 14);
    g.lineBetween(cx + 11, cy + 8, cx, cy + 14);
    g.lineBetween(cx, cy + 1, cx, cy + 14);
    g.fillStyle(0xffbc72);
    g.fillRect(cx - 2, cy - 8, 4, 8);
  } else if (action === "hull") {
    g.fillStyle(0x46758e);
    g.fillRoundedRect(cx - 10, cy - 12, 20, 16, 3);
    g.fillTriangle(cx - 10, cy + 1, cx + 10, cy + 1, cx, cy + 14);
    g.lineBetween(cx, cy - 9, cx, cy + 8);
    g.lineBetween(cx - 6, cy - 2, cx + 6, cy - 2);
  } else if (action === "repair") {
    g.lineStyle(5, 0x83d4e1);
    g.lineBetween(cx - 7, cy + 9, cx + 6, cy - 4);
    g.lineStyle(3, 0xffbc72);
    g.strokeCircle(cx + 6, cy - 7, 6);
    g.fillStyle(0x0c1927);
    g.fillRect(cx + 6, cy - 15, 8, 8);
  } else {
    g.fillStyle(0x507991);
    g.fillRoundedRect(cx - 10, cy - 7, 20, 17, 3);
    g.fillStyle(0x8bb1c3);
    g.fillRect(cx - 6, cy - 12, 12, 4);
    g.fillRect(cx - 14, cy - 1, 5, 7);
    g.fillStyle(0xffbc72);
    g.fillTriangle(cx + 3, cy - 6, cx - 3, cy + 2, cx + 2, cy + 2);
    g.fillTriangle(cx - 2, cy + 1, cx + 4, cy + 1, cx - 3, cy + 9);
  }
}

/** Entirely canvas-rendered station transactions. No DOM buttons or overlay. */
export class StationUi {
  private graphics: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private station: StationId | undefined;
  private selected = 0;
  private initialMessage = "";
  private regions: Array<{
    rect: CanvasRect;
    run: () => void;
    enabled: boolean;
  }> = [];
  private backgroundVisible = false;
  private renderKey: string | undefined;
  private labelStyles: string[] = [];
  constructor(
    private scene: Phaser.Scene,
    private bindings: StationBindings,
  ) {
    this.graphics = scene.add.graphics().setDepth(20);
    for (let i = 0; i < 36; i++)
      this.labels.push(
        scene.add
          .text(0, 0, "", {
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "13px",
            color: "#edf3f6",
          })
          .setDepth(21),
      );
  }
  private sync(station: StationId | undefined, mine: Mine) {
    if (station !== this.station) {
      this.station = station;
      this.selected = 0;
      this.initialMessage = mine.message;
      this.regions = [];
      this.renderKey = undefined;
    }
  }
  command(
    station: StationId | undefined,
    mine: Mine,
    busy: boolean,
    command: StationCommand | undefined,
  ) {
    this.sync(station, mine);
    if (!station || !command || busy) return;
    const actions = stationActions(station);
    if (command === "confirm") {
      const action = actions[this.selected];
      if (offer(mine, action).enabled) this.bindings.onService(action);
      return;
    }
    const delta = command === "up" || command === "left" ? -1 : 1;
    this.selected = (this.selected + delta + actions.length) % actions.length;
  }
  pointerUp(pointer: Phaser.Input.Pointer, busy: boolean) {
    if (!this.backgroundVisible || busy) return;
    // A drag or a contact that began outside a button must not buy on release.
    const region = this.regions.find(
      (item) =>
        item.enabled &&
        insideRect(pointer, item.rect) &&
        insideRect({ x: pointer.downX, y: pointer.downY }, item.rect),
    );
    region?.run();
  }
  render(station: StationId | undefined, mine: Mine, busy: boolean) {
    this.sync(station, mine);
    const s = mine.state;
    const hover = this.regions.findIndex((item) =>
      insideRect(this.scene.input.activePointer, item.rect),
    );
    const key = JSON.stringify([
      station,
      this.selected,
      busy,
      this.scene.scale.width,
      this.scene.scale.height,
      s.money,
      s.fuel,
      s.hull,
      s.inventory,
      s.upgrades,
      mine.message,
      hover,
    ]);
    // A parked menu is static until selection, feedback, hover or state changes.
    // Avoid rebuilding text textures on every animation frame while paused.
    if (key === this.renderKey) return;
    this.renderKey = key;
    const g = this.graphics;
    g.clear();
    for (const label of this.labels) label.setVisible(false);
    this.regions = [];
    this.backgroundVisible = Boolean(station);
    if (!station) return;
    const width = this.scene.scale.width,
      height = this.scene.scale.height;
    const layout = stationLayout(width, height, station, this.selected);
    const { panel, compact } = layout;
    const entry = STATIONS.find((item) => item.id === station)!;
    let labelIndex = 0;
    const text = (
      x: number,
      y: number,
      copy: string,
      options: {
        color?: string;
        size?: number;
        weight?: string;
        center?: boolean;
        width?: number;
        maxLines?: number;
      } = {},
    ) => {
      const index = labelIndex++;
      const label = this.labels[index];
      if (!label) return;
      label
        .setText(copy)
        .setPosition(x, y)
        .setOrigin(options.center ? 0.5 : 0, 0)
        .setVisible(true);
      const style = `${options.color ?? "#edf3f6"}:${options.size ?? 13}:${options.width ?? 0}:${options.maxLines ?? 0}:${options.weight ?? "normal"}`;
      if (style !== this.labelStyles[index]) {
        label
          .setColor(options.color ?? "#edf3f6")
          .setFontSize(options.size ?? 13)
          .setFontStyle(options.weight ?? "normal")
          .setWordWrapWidth(options.width ?? 0)
          .setMaxLines(options.maxLines ?? 0);
        this.labelStyles[index] = style;
      }
    };
    const button = (
      rect: CanvasRect,
      copy: string,
      enabled: boolean,
      run: () => void,
      primary = false,
    ) => {
      const hovering = insideRect(this.scene.input.activePointer, rect);
      g.fillStyle(
        enabled
          ? primary
            ? hovering
              ? 0xffcf93
              : 0xffb45a
            : hovering
              ? 0x304b66
              : 0x20344a
          : 0x1c2a3a,
      );
      g.fillRoundedRect(rect.x, rect.y + 2, rect.width, rect.height, 6);
      g.fillRoundedRect(rect.x, rect.y, rect.width, rect.height - 2, 6);
      g.lineStyle(1, enabled ? (primary ? 0xffd7a5 : 0x516c85) : 0x34465a);
      g.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 5);
      text(rect.x + rect.width / 2, rect.y + (rect.height - 15) / 2, copy, {
        center: true,
        size: compact && primary && rect.width < 112 ? 10 : compact ? 12 : 13,
        weight: "bold",
        color: enabled ? (primary ? "#30200e" : "#e1edf7") : "#788da2",
      });
      this.regions.push({ rect, run, enabled });
    };
    g.fillStyle(0x040912, 0.68);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0x01050b, 0.65);
    g.fillRoundedRect(panel.x + 5, panel.y + 7, panel.width, panel.height, 13);
    g.fillStyle(0x132132, 0.98);
    g.fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 12);
    g.lineStyle(1, 0x536b82, 0.9);
    g.strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 12);
    g.fillStyle(0x253b50, 0.5);
    g.fillRoundedRect(
      panel.x + 1,
      panel.y + 1,
      panel.width - 2,
      compact ? 43 : 66,
      { tl: 11, tr: 11, bl: 0, br: 0 },
    );
    g.fillStyle(0xffb45a);
    g.fillRect(panel.x + 14, panel.y, Math.min(82, panel.width / 3), 3);
    text(panel.x + 14, panel.y + (compact ? 7 : 15), entry.name.toUpperCase(), {
      size: compact ? 14 : 18,
      weight: "bold",
      color: "#f2f6fa",
    });
    const credits = mine.state.money.toLocaleString();
    const summary = `Credits $${credits} · Cargo ${mine.state.inventory.length}/${capacity(mine.state)}`;
    text(panel.x + 14, panel.y + (compact ? 27 : 45), summary, {
      size: compact ? 11 : 13,
      color: "#9fb6cc",
      width: panel.width - 70,
      maxLines: 1,
    });
    button(layout.close, "×", !busy, this.bindings.onCloseStation);
    for (const card of layout.cards) {
      const selected = card.index === this.selected;
      const item = offer(mine, card.action);
      const { rect, buy } = card;
      g.fillStyle(selected ? 0x26394e : 0x182a3b);
      g.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
      g.lineStyle(selected ? 2 : 1, selected ? 0x6eabc2 : 0x30465d);
      g.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
      if (layout.inline) {
        const textX = layout.next
          ? layout.next.x + layout.next.width + 8
          : rect.x + 12;
        const textWidth = buy.x - textX - 8;
        text(
          textX,
          rect.y + (rect.height - 32) / 2,
          item.shortTitle ?? item.title,
          {
            size: 11,
            color: "#ecf4fa",
            width: textWidth,
            maxLines: 1,
          },
        );
        text(
          textX,
          rect.y + (rect.height - 32) / 2 + 18,
          item.shortDetail ?? item.detail,
          {
            size: 10,
            color: "#82d4e2",
            width: textWidth,
            maxLines: 1,
          },
        );
      } else if (compact) {
        text(rect.x + rect.width / 2, rect.y + 2, item.title, {
          center: true,
          size: 12,
          weight: "bold",
          color: "#ecf4fa",
          width: rect.width - (layout.previous ? 90 : 16),
          maxLines: 1,
        });
        text(rect.x + rect.width / 2, rect.y + 20, item.detail, {
          center: true,
          size: 11,
          color: "#82d4e2",
          width: rect.width - (layout.previous ? 90 : 16),
          maxLines: 1,
        });
        if (rect.height > 112)
          text(rect.x + rect.width / 2, rect.y + 43, item.description, {
            center: true,
            size: 11,
            color: "#9db2c5",
            width: rect.width - 24,
            maxLines: 2,
          });
      } else {
        equipmentIcon(g, card.action, rect.x + 12, rect.y + 10);
        const textWidth = buy.x - rect.x - 72;
        text(rect.x + 58, rect.y + 10, item.title, {
          size: 14,
          weight: "bold",
          color: "#edf4fa",
          width: textWidth,
          maxLines: 1,
        });
        text(rect.x + 58, rect.y + 31, item.detail, {
          size: 12,
          color: "#82d4e2",
          width: textWidth,
          maxLines: 1,
        });
        if (rect.height > 100) {
          text(rect.x + 58, rect.y + 64, item.description, {
            size: 12,
            color: "#9db2c5",
            width: textWidth,
            maxLines: 3,
          });
          if (station === "exchange" && mine.state.inventory.length) {
            const counts = Object.entries(ORES)
              .map(([id, ore]) => {
                const count = mine.state.inventory.filter(
                  (item) => item === Number(id),
                ).length;
                return count ? `${count} ${ore.name}` : "";
              })
              .filter(Boolean)
              .join(" · ");
            text(rect.x + 58, rect.y + 110, counts, {
              size: 11,
              color: "#c6d4e1",
              width: textWidth,
              maxLines: 3,
            });
          }
        }
      }
      button(
        buy,
        busy && selected ? "Saving…" : item.button,
        item.enabled && !busy,
        () => this.bindings.onService(card.action),
        true,
      );
      // Row selection is separate from its explicit purchase button.
      if (!compact)
        this.regions.push({
          rect: { ...rect, width: buy.x - rect.x - 6 },
          enabled: !busy,
          run: () => {
            this.selected = card.index;
          },
        });
    }
    if (layout.previous)
      button(layout.previous, "‹", !busy, () => {
        this.selected =
          (this.selected + stationActions(station).length - 1) %
          stationActions(station).length;
      });
    if (layout.next)
      button(layout.next, "›", !busy, () => {
        this.selected = (this.selected + 1) % stationActions(station).length;
      });
    const message = busy
      ? "Saving your expedition…"
      : mine.message !== this.initialMessage
        ? mine.message
        : compact
          ? station === "upgrades"
            ? `${this.selected + 1}/${stationActions(station).length} · ← → choose · Enter buy · Esc close`
            : "Enter confirms · Esc closes"
          : "Choose a service. Arrow keys select; Enter confirms; Esc closes.";
    text(panel.x + 12, panel.y + panel.height - (compact ? 29 : 57), message, {
      size: compact ? 10 : 12,
      color: /need|not enough|failed|another tab|blocked/i.test(message)
        ? "#ffb685"
        : "#a9bfd2",
      width: panel.width - 24,
      maxLines: compact ? 2 : 2,
    });
    if (!compact)
      text(
        panel.x + 14,
        panel.y + panel.height - 23,
        "SURFACE OPERATIONS · VEHICLE PARKED",
        { size: 10, color: "#7390a8" },
      );
  }
}
