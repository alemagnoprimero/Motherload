import type { MenuAction } from "../input";
export function moveFocus(host: HTMLElement, action: MenuAction) {
  const controls = Array.from(
    host.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]",
    ),
  ).filter((element) => {
    const closedDetails = element.closest("details:not([open])");
    return (
      !element.closest("[hidden], [inert]") &&
      (!closedDetails ||
        closedDetails.querySelector(":scope > summary")?.contains(element)) &&
      element.checkVisibility?.() !== false &&
      element.getClientRects().length > 0
    );
  });
  if (!controls.length) return;
  const current = document.activeElement as HTMLElement,
    index = controls.indexOf(current);
  if (action === "activate") {
    const target = controls[index < 0 ? 0 : index];
    if (target instanceof HTMLInputElement && target.type === "range") return;
    target.click();
    return;
  }
  const direction =
    action === "left"
      ? [-1, 0]
      : action === "right"
        ? [1, 0]
        : action === "previous"
          ? [0, -1]
          : [0, 1];
  if (
    current instanceof HTMLInputElement &&
    current.type === "range" &&
    direction[0]
  ) {
    current.value = String(
      Math.max(
        Number(current.min),
        Math.min(Number(current.max), Number(current.value) + direction[0] * 5),
      ),
    );
    current.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (current instanceof HTMLSelectElement && direction[0]) {
    current.selectedIndex = Math.max(
      0,
      Math.min(
        current.options.length - 1,
        current.selectedIndex + direction[0],
      ),
    );
    current.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const rect = current?.getBoundingClientRect();
  const ranked =
    index < 0
      ? []
      : controls
          .filter((element) => element !== current)
          .map((element) => {
            const r = element.getBoundingClientRect(),
              dx = r.x + r.width / 2 - (rect.x + rect.width / 2),
              dy = r.y + r.height / 2 - (rect.y + rect.height / 2);
            const forward = dx * direction[0] + dy * direction[1],
              lateral = Math.abs(dx * direction[1] - dy * direction[0]);
            return {
              element,
              score: forward > 2 ? forward + lateral * 3 : Infinity,
            };
          })
          .filter((item) => Number.isFinite(item.score))
          .sort((a, b) => a.score - b.score);
  const target =
    ranked[0]?.element ??
    controls[
      index < 0
        ? 0
        : (index +
            (action === "previous" || action === "left" ? -1 : 1) +
            controls.length) %
          controls.length
    ];
  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}
