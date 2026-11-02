import { rigPreview } from "../rig-preview";
import type { Campaign } from "../../model";
import { HARDWARE_KEYS, HARDWARE_LEVELS, HARDWARE_PRICES } from "../../config";
import { hardwareName } from "../../names";
import { hudIcon, type HUD_ART } from "../icons";
import { escapeMarkup } from "../dom";
import { button, money } from "./shared";
const art = {
  drill: "drill",
  energy: "reservoir",
  cargo: "bay",
  hull: "armor",
  engine: "engine",
} as const;
export function workshopMarkup(
  campaign: Campaign,
  busy: boolean,
  attachments = false,
) {
  const state = campaign.state;
  const cards = attachments
    ? campaign.gearDefinitions
        .filter(
          (gear) =>
            gear.id.startsWith(state.currentWorld + "-") ||
            state.ownedGear.includes(gear.id),
        )
        .map((gear) => {
          const owned = state.ownedGear.includes(gear.id),
            equipped = Object.values(state.equipped).some(
              (value) =>
                value === gear.id ||
                (Array.isArray(value) && value.includes(gear.id)),
            );
          const unlocked =
            owned ||
            !gear.milestone ||
            campaign.completedMilestones.includes(gear.milestone);
          const ready =
            unlocked &&
            (!gear.requires || state.ownedGear.includes(gear.requires));
          return `<article data-key="${gear.id}"><h3>${escapeMarkup(gear.name)}</h3><p>${escapeMarkup(gear.description)}</p><small>${!unlocked ? "Complete M" + gear.milestone : !ready ? "Install prerequisite" : !owned && state.credits < gear.price ? "Need " + money(gear.price - state.credits) : equipped ? "Equipped" : gear.slot}</small>${button(owned ? "gear-toggle-" + gear.id : "gear-buy-" + gear.id, owned ? (equipped ? "Unequip" : "Equip") : "Buy · " + money(gear.price), busy || !ready || (!owned && state.credits < gear.price), !equipped && ready)}</article>`;
        })
        .join("")
    : HARDWARE_KEYS.map((key) => {
        const rank = state.hardware[key],
          next = rank + 1,
          maxed = rank >= campaign.hardwareCap;
        const price = HARDWARE_PRICES[key][next] ?? 0,
          current = HARDWARE_LEVELS[key][rank],
          target = HARDWARE_LEVELS[key][maxed ? rank : next];
        const reason = maxed
          ? "Installed"
          : !campaign.hardwareUnlocked
            ? "Complete M1"
            : state.credits < price
              ? "Need " + money(price - state.credits)
              : "Ready";
        const name = hardwareName(key, maxed ? rank : next);
        return `<article data-key="${key}">${hudIcon(art[key])}<h3>${escapeMarkup(name)}</h3><p class="upgrade-preview">${current} → ${target}${key === "energy" ? " L" : key === "hull" ? " HP" : key === "cargo" ? " bulk" : ""}</p><div class="upgrade-bar" role="img" aria-label="Current ${current}; next ${target}"><i style="width:${(current / target) * 100}%"></i></div>${campaign.hardwareUnlocked && !maxed && state.credits < price ? `<small>${reason}</small>` : ""}${button("hardware-" + key, maxed ? "Installed" : "Install · " + money(price), busy || maxed || !campaign.hardwareUnlocked || state.credits < price, !maxed && campaign.hardwareUnlocked && state.credits >= price, `${name}: ${reason}. ${money(price)}`)}</article>`;
      }).join("");
  return `<div class="workshop-subnav"><button data-workshop-tab="hardware" aria-selected="${!attachments}">Systems</button><button data-tab="tools" aria-selected="${attachments}">Attachments</button><span>RIG / ${state.currentWorld}</span></div>${!attachments && !campaign.hardwareUnlocked ? '<p class="workshop-unlock">Hardware unlocks after M1.</p>' : ""}<div class="equipment-cards">${!attachments ? rigPreview(campaign) : ""}${cards}</div>`;
}
