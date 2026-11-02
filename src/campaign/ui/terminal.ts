import type { Campaign } from "../model";
import { tradeMarkup } from "./terminal/trade";
import { workshopMarkup } from "./terminal/workshop";
import { constructionMarkup } from "./terminal/construction";
import { nextAction, money, number as condition } from "./terminal/shared";
import {
  patchMarkup,
  escapeMarkup as escape,
  byId as $,
  setText,
  setHidden,
} from "./dom";
function serviceCopy(campaign: Campaign, action: "refuel" | "repair") {
  const p = campaign.servicePreview(action);
  return `${condition(p.current)} → ${condition(p.result)} / ${p.maximum} ${action === "refuel" ? "L" : "HP"}. Cost ${money(p.cost)} · ${money(p.remaining)} remains.${p.partial ? " Partial fill." : ""}`;
}
export function renderDockView(
  campaign: Campaign,
  dockTab: string,
  busy: boolean,
  undockCheck: boolean,
  presentationMessage: (message: string) => string,
) {
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
      `Energy is below half. ${serviceCopy(campaign, "refuel")} Refuel before your next trip?`,
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
  const html =
    dockTab === "service" || dockTab === "cargo"
      ? tradeMarkup(campaign, busy)
      : dockTab === "hardware" || dockTab === "tools"
        ? workshopMarkup(campaign, busy, dockTab === "tools")
        : constructionMarkup(campaign, busy);
  const next = nextAction(campaign);
  patchMarkup(
    $("campaign-dock-next"),
    `<span>Next</span><button data-command="${next.command}" class="primary">${escape(next.label)}</button>`,
  );
  if (patchMarkup(content, html)) {
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
