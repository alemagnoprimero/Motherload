import type { Campaign } from "../model";
import type { NoticeQueue } from "../notices";
import { itemName } from "../names";
import { WORLD_CATALOG } from "../config";
import {
  ACTION_LABELS,
  keyLabel,
  type PilotAction,
  type PilotPreferences,
} from "../input";
import { patchMarkup, byId as $, escapeMarkup as escape } from "./dom";
import { journalMarkup } from "./journal";
import { money, button as viewButton } from "./terminal/shared";
const worldName = (id: string) =>
  WORLD_CATALOG.find((world) => world.id === id)?.name ?? id;
export function renderPauseTabs(
  campaign: Campaign,
  pauseTab: string,
  notices: NoticeQueue,
) {
  const groups: Record<string, string> = {
    Checkpoint: "save",
    "Campaign archives": "save",
    Systems: "systems",
    "Pilot controls": "controls",
    Journal: "journal",
    "Recent notices": "journal",
    "Cargo manifest": "expedition",
    "Flight record": "expedition",
    Recovery: "expedition",
  };
  document
    .querySelectorAll<HTMLElement>(".pause-grid > section")
    .forEach((section) => {
      const heading = section.querySelector("h2")?.textContent ?? "";
      section.hidden = (groups[heading] ?? "journal") !== pauseTab;
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-pause-tab]")
    .forEach((button) =>
      button.setAttribute(
        "aria-selected",
        String(button.dataset.pauseTab === pauseTab),
      ),
    );
  patchMarkup(
    $("campaign-recent-notices"),
    notices.recent
      .map((notice) => `<li>${escape(notice.text)}</li>`)
      .join("") || "<li>No notices yet.</li>",
  );
  patchMarkup($("campaign-pause-journal"), journalMarkup(campaign));
}
export function renderBindings(preferences: PilotPreferences) {
  patchMarkup(
    $("campaign-bindings"),
    (Object.keys(ACTION_LABELS) as PilotAction[])
      .map(
        (action) =>
          `<div class="binding-row"><span>${ACTION_LABELS[action]}</span>${[0, 1].map((slot) => `<button data-remap="${action}" data-slot="${slot}" aria-label="${ACTION_LABELS[action]} ${slot ? "secondary" : "primary"} key">${escape(preferences.keys[action][slot] ? keyLabel(preferences.keys[action][slot]) : "Add key")}</button>`).join("")}<button data-pad-remap="${action}" aria-label="Controller ${ACTION_LABELS[action]}">Pad ${preferences.gamepad[action]}</button></div>`,
      )
      .join(""),
  );
}
export function renderPauseMenu(
  campaign: Campaign,
  preferences: PilotPreferences,
  blocked: boolean,
  conflict: boolean,
  busy: boolean,
  confirmBusy: boolean,
  backupAvailable: boolean,
) {
  const replaceButton = document.querySelector<HTMLButtonElement>(
    '[data-command="replace"]',
  )!;
  const button = (command: string, label: string) =>
    viewButton(command, label, busy);
  replaceButton.hidden = !blocked;
  patchMarkup(
    $("campaign-menu-cargo"),
    campaign.cargo.length
      ? campaign.cargo
          .map(
            (item) =>
              '<article class="cargo-row"><div><strong>' +
              escape(itemName(item.itemId, item.name)) +
              "</strong><small>" +
              item.bulk +
              " bulk · " +
              money(item.value) +
              "</small></div>" +
              button("eject:" + item.id, "Eject") +
              "</article>",
          )
          .join("")
      : '<p class="muted">The hold is empty.</p>',
  );
  $("campaign-storage-notice").hidden = !blocked && !conflict;
  if (conflict)
    $("campaign-storage-notice").textContent =
      "Another tab saved a newer campaign. Load its checkpoint to continue; export this tab first if you want a separate copy.";
  const s = campaign.state;
  const record = campaign.chapterSummary;
  patchMarkup(
    $("campaign-record"),
    `<dl class="record-list"><dt>Destination</dt><dd>${escape(worldName(s.currentWorld))}</dd><dt>Credits</dt><dd>${money(s.credits)}</dd><dt>Milestones</dt><dd>${campaign.completedMilestones.length} / 3</dd><dt>Mine time</dt><dd>${Math.floor(record.elapsed / 60)} min</dd><dt>Ore income</dt><dd>${money(record.ordinaryIncome)}</dd><dt>Blocks mined</dt><dd>${record.mined}</dd><dt>Deepest discovery</dt><dd>${record.deepest} m</dd><dt>Recoveries</dt><dd>${record.recoveries}</dd><dt>Contracts</dt><dd>${record.contracts} / 2</dd><dt>Mastery</dt><dd aria-label="${record.mastery} mastery stars">${"★".repeat(record.mastery)}${"☆".repeat(Math.max(0, 3 - record.mastery))}</dd></dl>`,
  );
  document
    .querySelectorAll<HTMLButtonElement>('[data-command="restore"]')
    .forEach((button) => {
      button.disabled = busy || confirmBusy || !backupAvailable;
    });
  renderBindings(preferences);
}
