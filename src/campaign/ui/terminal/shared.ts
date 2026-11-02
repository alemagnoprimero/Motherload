import type { Campaign } from "../../model";
import { formatCredits } from "../../config";
import { escapeMarkup } from "../dom";
export const money = (value: number) => formatCredits(value) + " CR";
export const number = (value: number) =>
  Number(Math.max(0, value).toFixed(1)).toLocaleString("en-US");
export const button = (
  command: string,
  label: string,
  disabled = false,
  primary = false,
  accessibleLabel?: string,
) =>
  `<button data-command="${escapeMarkup(command)}"${disabled ? " disabled" : ""}${primary ? ' class="primary"' : ""}${accessibleLabel ? ` aria-label="${escapeMarkup(accessibleLabel)}"` : ""}>${label}</button>`;
export function nextAction(campaign: Campaign) {
  if (
    campaign.cargo.length ||
    campaign.warehouse.length ||
    campaign.world.missions.some((item) => item.status === "carried")
  )
    return { command: "bank-sell", label: "Unload & sell" };
  if (
    campaign.missionReady &&
    campaign.currentMilestone &&
    campaign.state.credits >= campaign.currentMilestone.fee
  )
    return {
      command: "milestone",
      label: "Fund " + campaign.currentMilestone.name,
    };
  if (
    campaign.hardwareUnlocked &&
    campaign.state.hardware.energy === 0 &&
    campaign.state.credits >= 6000
  )
    return {
      command: "hardware-energy",
      label: "Install larger tank · 600 CR",
    };
  if (
    campaign.state.vehicle.energy < campaign.maxEnergy &&
    campaign.state.credits > 0
  )
    return {
      command: "refuel",
      label: "Refuel · " + money(campaign.servicePreview("refuel").cost),
    };
  if (
    campaign.state.vehicle.hull < campaign.maxHull &&
    campaign.state.credits > 0
  )
    return {
      command: "repair",
      label: "Repair · " + money(campaign.servicePreview("repair").cost),
    };
  return { command: "undock-anyway", label: "Continue expedition" };
}
