import type { CampaignEvent } from "../events";
import { formatCredits } from "../config";
import { patchMarkup, escapeMarkup } from "./dom";
/** Presentation starts after the transaction; simulation pauses while it is visible. */
export class RewardPresentation {
  private until = 0;
  private started = 0;
  private event?: CampaignEvent;
  private before = 0;
  private after = 0;
  private reduced = false;
  get active() {
    return this.until > 0;
  }
  show(event: CampaignEvent, reducedMotion: boolean) {
    if (!["sale", "install", "construction", "travel"].includes(event.type))
      return;
    this.event = event;
    this.reduced = reducedMotion;
    this.started = performance.now();
    this.until = this.started + (event.type === "travel" ? 2000 : 1200);
    const title = document.getElementById("campaign-reward-title")!;
    const panel = document.getElementById("campaign-reward")!;
    panel.hidden = false;
    panel.classList.toggle("reduced", reducedMotion);
    title.textContent =
      event.type === "sale"
        ? "HAUL SOLD"
        : event.type === "install"
          ? "SYSTEM INSTALLED"
          : event.type === "construction"
            ? "CONSTRUCTION COMPLETE"
            : "COURSE SET";
    this.before = event.type === "sale" ? event.receipt.creditsBefore : 0;
    this.after = event.type === "sale" ? event.receipt.creditsAfter : 0;
    patchMarkup(
      document.getElementById("campaign-reward-lines")!,
      event.type === "sale"
        ? event.receipt.lines
            .map(
              (line) =>
                `<span>${escapeMarkup(line.name)} ×${line.count}<b>+${formatCredits(line.value)} CR</b></span>`,
            )
            .join("")
        : event.type === "travel"
          ? `<svg class="travel-sequence" viewBox="0 0 360 120" aria-label="Flying to ${event.destination}" role="img"><path d="M30 60H330" stroke="#7cb4ad" stroke-dasharray="6 8"/><circle cx="30" cy="60" r="15" fill="#c59c6e"/><circle cx="330" cy="60" r="22" fill="#9ed1d3"/><g class="travel-lander"><path d="M15 46 43 60 15 74 23 60Z" fill="#f4d29b"/><path d="M10 54H1m9 7H-5m15 7H1" stroke="#87d6d3" stroke-width="3"/></g></svg>`
          : "<span>Ready for your next expedition.</span>",
    );
    this.update();
  }
  update() {
    if (!this.active) return;
    const fraction = this.reduced
      ? 1
      : Math.min(1, (performance.now() - this.started) / 1000);
    const amount = Math.round(
      this.before +
        (this.after - this.before) * (1 - Math.pow(1 - fraction, 3)),
    );
    const value =
      this.event?.type === "sale"
        ? formatCredits(amount) + " CR"
        : this.event?.type === "install"
          ? "READY"
          : this.event?.type === "construction"
            ? "M" + this.event.milestone
            : "ARRIVED";
    const node = document.getElementById("campaign-reward-value")!;
    if (node.textContent !== value) node.textContent = value;
    if (performance.now() >= this.until) this.skip();
  }
  skip() {
    if (!this.active) return;
    document.getElementById("campaign-reward-value")!.textContent =
      this.event?.type === "sale" ? formatCredits(this.after) + " CR" : "";
    this.until = 0;
    document.getElementById("campaign-reward")!.hidden = true;
  }
}
