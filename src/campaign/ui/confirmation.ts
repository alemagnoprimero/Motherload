import { escapeMarkup } from "./dom";

export interface ConfirmationIntent {
  verb: string;
  requiresHold: boolean;
  keep: string[];
  lose: string[];
}

/** Explicit consequences supplement, never replace, the exact transaction copy. */
export function configureConfirmation(
  title: string,
  copy: string,
): ConfirmationIntent {
  const intent: ConfirmationIntent = {
    verb: "Continue",
    requiresHold: false,
    keep: [],
    lose: [],
  };
  if (/recover/i.test(title)) intent.verb = "Request recovery";
  else if (/new (campaign|expedition)/i.test(title)) {
    intent.verb = "Begin expedition";
    intent.requiresHold = true;
    intent.keep = ["Current valid saved expedition in Campaign archives."];
    intent.lose = [
      "The oldest archive may be removed when three are retained.",
    ];
  } else if (/restore/i.test(title)) {
    intent.verb = "Restore campaign";
    intent.requiresHold = true;
    intent.keep = [
      /archiv/i.test(copy)
        ? "Current saved expedition is archived if it is different."
        : "Current valid campaign becomes the backup.",
    ];
    intent.lose = ["Unsaved changes in this session."];
    if (/oldest/i.test(copy))
      intent.lose.push("The oldest archive may be removed.");
  } else if (/import/i.test(title)) {
    intent.verb = "Import campaign";
    intent.requiresHold = true;
    intent.lose = ["Unsaved changes in this session."];
  } else if (/save this|replace/i.test(title)) {
    intent.verb = "Replace checkpoint";
    intent.requiresHold = true;
    intent.keep = ["The previous valid checkpoint as a backup."];
    intent.lose = ["This session becomes the latest checkpoint."];
  } else if (/travel/i.test(title)) intent.verb = "Travel";
  else if (/launch/i.test(title)) intent.verb = "Launch lander";
  return intent;
}

export function confirmationSummaryMarkup(intent: ConfirmationIntent) {
  const group = (title: string, entries: string[]) =>
    entries.length
      ? `<section><h3>${title}</h3><ul>${entries.map((entry) => `<li>${escapeMarkup(entry)}</li>`).join("")}</ul></section>`
      : "";
  return group("Keep", intent.keep) + group("Changes", intent.lose);
}

interface ConfirmationOptions {
  button: HTMLButtonElement;
  onConfirm: () => void | Promise<void>;
  requiresHold: () => boolean;
  holdMilliseconds?: number;
}

/** Hold with a pointer/keyboard, or activate twice with assistive tech/controller. */
export function setupConfirmationControls(options: ConfirmationOptions) {
  const { button } = options;
  const holdMilliseconds = options.holdMilliseconds ?? 700;
  let label = button.textContent || "Continue";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armedUntil = 0;
  let armedAt = 0;
  let completed = false;
  let holding = false;
  let holdStartedAt = 0;
  let consumeClick = false;
  const updateLabel = () => {
    button.textContent =
      armedUntil > performance.now()
        ? `${label} · activate again`
        : options.requiresHold()
          ? `Hold to ${label.toLowerCase()}`
          : label;
    button.setAttribute(
      "aria-label",
      options.requiresHold()
        ? `${label}. Hold for ${holdMilliseconds / 1000} seconds, or activate twice using a keyboard, controller or screen reader.`
        : label,
    );
  };
  const stopHold = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    holding = false;
    button.style.removeProperty("--hold-progress");
    delete button.dataset.holding;
  };
  const confirm = () => {
    if (
      completed ||
      button.disabled ||
      !button.isConnected ||
      !button.getClientRects().length ||
      (button.closest("dialog") && !button.closest("dialog")!.open)
    )
      return;
    completed = true;
    consumeClick = true;
    stopHold();
    void Promise.resolve()
      .then(options.onConfirm)
      .finally(() => {
        // A failed operation may leave this same decision open for a retry.
        completed = false;
        armedUntil = 0;
        updateLabel();
      });
  };
  const activate = () => {
    if (button.disabled || completed) return;
    if (!options.requiresHold()) {
      confirm();
      return;
    }
    const now = performance.now();
    if (now < armedUntil && now - armedAt >= 300) {
      confirm();
      return;
    }
    if (now >= armedUntil) {
      armedAt = now;
      armedUntil = now + 5000;
    }
    updateLabel();
  };
  const startHold = () => {
    if (!options.requiresHold() || button.disabled || completed || holding)
      return;
    holding = true;
    holdStartedAt = performance.now();
    button.dataset.holding = "true";
    button.style.setProperty("--hold-progress", "1");
    timer = setTimeout(confirm, holdMilliseconds);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    consumeClick = false;
    button.setPointerCapture?.(event.pointerId);
    startHold();
  };
  const up = () => {
    // A busy main thread may deliver release before the overdue timer callback.
    // Only an uninterrupted hold can finish here; cancellation always just stops it.
    if (holding && performance.now() - holdStartedAt >= holdMilliseconds) {
      confirm();
      return;
    }
    stopHold();
  };
  const move = (event: PointerEvent) => {
    if (!holding) return;
    const box = button.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      stopHold();
  };
  const contextMenu = (event: Event) => {
    if (options.requiresHold()) event.preventDefault();
  };
  const visibility = () => {
    if (document.hidden) blur();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat) return;
    consumeClick = false;
    if (options.requiresHold()) startHold();
    else activate();
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const pending = holding;
    up();
    if (pending && !consumeClick) activate();
  };
  const click = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (consumeClick) {
      consumeClick = false;
      return;
    }
    stopHold();
    // A normal pointer press must be held. detail=0 is native keyboard/AT or controller activation.
    if (options.requiresHold() && event.detail > 0) {
      updateLabel();
      return;
    }
    activate();
  };
  const blur = () => {
    stopHold();
    armedUntil = 0;
    updateLabel();
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", stopHold);
  button.addEventListener("lostpointercapture", stopHold);
  button.addEventListener("pointermove", move);
  button.addEventListener("contextmenu", contextMenu);
  button.addEventListener("keydown", keydown);
  button.addEventListener("keyup", keyup);
  button.addEventListener("click", click, true);
  button.addEventListener("blur", blur);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  return {
    reset(nextLabel = label) {
      stopHold();
      label = nextLabel;
      armedUntil = 0;
      completed = false;
      consumeClick = false;
      updateLabel();
    },
    dispose() {
      stopHold();
      button.removeEventListener("pointerdown", down);
      button.removeEventListener("pointerup", up);
      button.removeEventListener("pointercancel", stopHold);
      button.removeEventListener("lostpointercapture", stopHold);
      button.removeEventListener("pointermove", move);
      button.removeEventListener("contextmenu", contextMenu);
      button.removeEventListener("keydown", keydown);
      button.removeEventListener("keyup", keyup);
      button.removeEventListener("click", click, true);
      button.removeEventListener("blur", blur);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
