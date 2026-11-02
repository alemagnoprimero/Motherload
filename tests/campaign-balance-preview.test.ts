import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("development-only balance comparison", () => {
  it.each([
    ["0.1", 6500, 1, 300, 2, 22000],
    ["0.2", 6000, 2, 280, 2, 22000],
    ["0.3", 6000, 2, 280, 1, 16000],
  ] as const)(
    "selects %s economic data and new-world defaults",
    async (version, tank, generator, ore, bulk, reserve) => {
      vi.stubEnv("DEV", true);
      vi.stubGlobal("location", { search: `?balance=${version}` });
      vi.resetModules();
      const config = await import("../src/campaign/config");
      const frontier = await import("../src/campaign/frontier");
      const worlds = await import("../src/campaign/world");
      expect(config.BALANCE_VERSION).toBe(version);
      expect(config.GENERATOR_VERSION).toBe(generator);
      expect(config.HARDWARE_PRICES.energy[1]).toBe(tank);
      expect(config.W01_ORES[0]!.value).toBe(ore);
      expect(frontier.W02_ORES[0]!.bulk).toBe(bulk);
      expect(frontier.W02_GEAR[1]!.price).toBe(reserve);
      expect(worlds.createW01(117).tiles.includes(4)).toBe(generator === 2);
      expect(
        worlds.createW02(117).packages.find((item) => item.itemId === "W02-O1")!
          .bulk,
      ).toBe(bulk);
    },
  );

  it("ignores a URL override in production", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("location", { search: "?balance=0.1" });
    vi.resetModules();
    const config = await import("../src/campaign/config");
    const frontier = await import("../src/campaign/frontier");
    expect(config.BALANCE_VERSION).toBe("0.3");
    expect(config.GENERATOR_VERSION).toBe(2);
    expect(config.HARDWARE_PRICES.energy[1]).toBe(6000);
    expect(frontier.W02_ORES[0]!.bulk).toBe(1);
  });
});
