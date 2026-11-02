/** Reconcile trusted view markup while retaining focused controls and scroll. */
const markup = new WeakMap<Element, string>();
const identity = (node: Node): string | undefined => {
  if (!(node instanceof Element)) return undefined;
  const key =
    node.id ||
    [
      "key",
      "command",
      "tab",
      "remap",
      "pad-remap",
      "pause-tab",
      "map-tab",
      "setting",
      "volume",
      "task",
    ]
      .map((name) => {
        const value = node.getAttribute("data-" + name);
        return value
          ? name +
              ":" +
              value +
              (name === "remap"
                ? ":" + (node.getAttribute("data-slot") ?? "0")
                : "")
          : undefined;
      })
      .find(Boolean);
  return key ? node.tagName + ":" + key : undefined;
};
function reconcile(parent: Node, desired: Node) {
  const existing = Array.from(parent.childNodes);
  const keyed = new Map(
    existing.map((node) => [identity(node), node]).filter(([key]) => key) as [
      string,
      Node,
    ][],
  );
  let cursor = parent.firstChild;
  for (const next of Array.from(desired.childNodes)) {
    const key = identity(next);
    let current = key ? keyed.get(key) : cursor;
    if (
      !current ||
      current.nodeType !== next.nodeType ||
      (current instanceof Element &&
        next instanceof Element &&
        (current.tagName !== next.tagName || identity(current) !== key))
    ) {
      current = next.cloneNode(true);
      parent.insertBefore(current, cursor);
    } else {
      if (current !== cursor) parent.insertBefore(current, cursor);
      if (current instanceof Element && next instanceof Element) {
        for (const attr of Array.from(current.attributes))
          if (
            !next.hasAttribute(attr.name) &&
            !(attr.name === "open" && current instanceof HTMLDetailsElement)
          )
            current.removeAttribute(attr.name);
        for (const attr of Array.from(next.attributes))
          if (current.getAttribute(attr.name) !== attr.value)
            current.setAttribute(attr.name, attr.value);
        if (
          current instanceof HTMLInputElement &&
          next instanceof HTMLInputElement &&
          current !== document.activeElement
        ) {
          current.value = next.value;
          current.checked = next.checked;
        }
        reconcile(current, next);
      } else if (current.nodeValue !== next.nodeValue)
        current.nodeValue = next.nodeValue;
    }
    cursor = current.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = next;
  }
}
export function patchMarkup(host: Element, html: string): boolean {
  if (markup.get(host) === html) return false;
  // HTML is parsed into an inert template, never assigned to live controls.
  const template = document.createElement("template");
  template.innerHTML = html;
  const focused = document.activeElement;
  const left = host.scrollLeft,
    top = host.scrollTop;
  reconcile(host, template.content);
  host.scrollLeft = left;
  host.scrollTop = top;
  if (
    focused instanceof HTMLElement &&
    host.contains(focused) &&
    !(focused instanceof HTMLButtonElement && focused.disabled)
  )
    focused.focus({ preventScroll: true });
  markup.set(host, html);
  return true;
}

export function escapeMarkup(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export function setText(id: string, text: string) {
  const element = byId(id);
  if (element.textContent !== text) element.textContent = text;
}
export function setHidden(id: string, hidden: boolean) {
  const element = byId(id);
  if (element.hidden !== hidden) element.hidden = hidden;
}
