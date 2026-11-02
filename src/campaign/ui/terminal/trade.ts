import type { Campaign } from "../../model";
import { hudIcon } from "../icons";
import { escapeMarkup } from "../dom";
import { button, money, number } from "./shared";
import { itemName } from "../../names";
export function tradeMarkup(campaign: Campaign, busy: boolean) {
  const stored = campaign.warehouse.reduce((sum, item) => sum + item.value, 0);
  const carried = campaign.world.missions.some(
    (item) => item.status === "carried",
  );
  const service = (action: "refuel" | "repair") => {
    const p = campaign.servicePreview(action),
      unit = action === "refuel" ? "L" : "HP";
    return `<article>${hudIcon(action === "refuel" ? "energy" : "hull")}<h3>${action === "refuel" ? "Energy" : "Hull"}</h3><p data-service-preview="${action}">${number(p.current)} → ${number(p.result)} / ${p.maximum} ${unit}</p><small>${money(p.remaining)} after${p.partial ? " · partial" : ""}</small>${button(action, `${action === "refuel" ? "Refuel" : "Repair"} · ${money(p.cost)}`, busy || p.cost <= 0)}</article>`;
  };
  return `<div class="service-cards"><article>${hudIcon("cargo")}<h3>Haul</h3><strong class="trade-total">${money(campaign.cargoValue + stored)}</strong><p>${campaign.cargo.length} carried · ${campaign.warehouse.length} stored</p>${button("bank-sell", "Unload & sell", busy || !(campaign.cargo.length || campaign.warehouse.length || carried), true)}</article>${service("refuel")}${service("repair")}</div><details class="terminal-detail"><summary>Manifest and storage</summary><div class="cargo-columns"><section>${campaign.cargo.map((item) => `<article class="cargo-row"><span>${escapeMarkup(itemName(item.itemId, item.name))} · ${money(item.value)}</span>${button("eject:" + item.id, "Eject", busy)}</article>`).join("") || "<p>Hold empty</p>"}${button("bank", "Bank without sale", busy || !(campaign.cargo.length || carried))}</section><section><p>Stored ${money(stored)}</p>${button("sell", "Sell stored cargo", busy || !campaign.warehouse.length)}</section></div></details>`;
}
