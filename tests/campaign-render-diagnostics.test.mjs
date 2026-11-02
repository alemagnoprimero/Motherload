import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderDiagnostics } from "../src/campaign/render/diagnostics";

vi.mock("phaser", () => ({ default: { WEBGL: 2 } }));
afterEach(() => vi.restoreAllMocks());

describe("full-frame adaptive quality sampling", () => {
  it("includes update, UI and renderer work on Canvas and cleans up its hooks", () => {
    const events = new EventEmitter(),
      sample = vi.fn();
    const scene = {
      game: { events, renderer: { type: 1 } },
    };
    const diagnostics = new RenderDiagnostics(scene, sample);
    const clock = vi.spyOn(performance, "now");
    clock.mockReturnValue(100);
    events.emit("prestep", 0, 50);
    clock.mockReturnValue(108);
    events.emit("prerender");
    clock.mockReturnValue(127);
    events.emit("postrender", {}, 0, 50);
    expect(sample).toHaveBeenCalledWith(27, 0.05);
    expect(diagnostics.frameMilliseconds).toBe(27);
    expect(diagnostics.drawCalls).toBeUndefined();
    diagnostics.destroy();
    expect(events.listenerCount("prestep")).toBe(0);
    expect(events.listenerCount("postrender")).toBe(0);
  });
});
