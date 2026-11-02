import { describe, expect, it } from "vitest";
import {
  configureConfirmation,
  confirmationSummaryMarkup,
} from "../src/campaign/ui/confirmation";

describe("concrete campaign decisions", () => {
  it("requires a deliberate action for replacement and explains archive retention", () => {
    const next = configureConfirmation(
      "Begin a new campaign?",
      "The oldest archive may be removed.",
    );
    expect(next.requiresHold).toBe(true);
    expect(next.verb).toBe("Begin expedition");
    expect(next.keep[0]).toContain("archives");
    expect(next.lose[0]).toContain("oldest");
    const restore = configureConfirmation(
      "Restore this archived campaign?",
      "Current saved campaign is archived if different. The oldest archive may be removed.",
    );
    expect(restore.requiresHold).toBe(true);
    expect(restore.lose).toContain("Unsaved changes in this session.");
    expect(configureConfirmation("Import campaign?", "").requiresHold).toBe(
      true,
    );
    expect(configureConfirmation("Save this run instead?", "").verb).toBe(
      "Replace checkpoint",
    );
  });
  it("keeps recovery, travel and field logs accessible without a hold", () => {
    expect(
      configureConfirmation("Call surface recovery?", "Fee: 100 CR."),
    ).toMatchObject({ verb: "Request recovery", requiresHold: false });
    expect(configureConfirmation("Travel to Ice comet?", "")).toMatchObject({
      verb: "Travel",
      requiresHold: false,
    });
    expect(
      configureConfirmation("A long winter", "Field log contents.")
        .requiresHold,
    ).toBe(false);
  });
  it("renders consequences as escaped text", () => {
    expect(
      confirmationSummaryMarkup({
        verb: "Continue",
        requiresHold: false,
        keep: ["<b>cargo</b>"],
        lose: [],
      }),
    ).toContain("&lt;b&gt;cargo&lt;/b&gt;");
  });
});
