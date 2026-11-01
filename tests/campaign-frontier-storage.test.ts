import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../src/campaign/model";
import { createW02 } from "../src/campaign/world";
import {
  CampaignSaveError,
  CampaignStore,
  type CampaignBackend,
} from "../src/campaign/persistence";

class MemoryBackend implements CampaignBackend {
  current: string | null = null;
  backup: string | null = null;
  writes = 0;
  async read() {
    return { current: this.current, backup: this.backup };
  }
  async commit(
    expected: string | null,
    current: string,
    backup?: string | null,
  ) {
    if (expected !== this.current)
      throw new CampaignSaveError("conflict", "A newer checkpoint exists.");
    this.current = current;
    if (backup !== undefined) this.backup = backup;
    this.writes++;
  }
}

/** Completed-world fixture isolates transport and persistence, not earning pace. */
function frontier(seed = 71) {
  const campaign = new Campaign(createCampaign(seed));
  campaign.state.progress.beacon = true;
  campaign.state.progress.bankedOre = 3;
  campaign.state.progress.completed = [1, 2, 3];
  campaign.state.progress.unlockedWorlds = ["W01", "W02", "W03"];
  for (const mission of campaign.world.missions) mission.status = "banked";
  campaign.state.vehicle.x = 5.5;
  expect(campaign.depart()).toBe(true);
  return campaign;
}
function envelope(state: unknown, revision = 4) {
  return JSON.stringify({
    format: "motherload-campaign",
    version: 1,
    revision,
    savedAt: "2026-11-01T00:00:00.000Z",
    state,
  });
}

describe("Frontier checkpoint compatibility", () => {
  it("loads a schema-1 excavation without writing or replacing its original bytes", async () => {
    const legacy = createCampaign(53);
    legacy.schema = 1;
    legacy.credits = 4137;
    const world = legacy.worlds.W01!;
    world.tiles[40 * 2 + 20] = 0;
    world.discovered[40 * 2 + 20] = 1;
    const exposed = world.packages.find(
      (item) => item.x === 20.5 && item.y === 2.5,
    )!;
    exposed.status = "exposed";
    const backend = new MemoryBackend();
    backend.current = envelope(legacy);
    backend.backup = envelope(createCampaign(52), 3);
    const bytes = await backend.read();
    const store = new CampaignStore(backend);
    const loaded = await store.load();
    expect(loaded).toMatchObject({ blocked: false, revision: 4 });
    expect(loaded.state?.schema).toBe(2);
    expect(loaded.state?.worlds.W01).toEqual(world);
    expect(loaded.state?.credits).toBe(4137);
    expect(loaded.state?.progress).toEqual(legacy.progress);
    expect(await backend.read()).toEqual(bytes);
    expect(backend.writes).toBe(0);
    await store.save(loaded.state!);
    expect(JSON.parse(backend.current!).state.schema).toBe(2);
    expect(backend.backup).toBe(bytes.current);
  });

  it("round-trips both depleted worlds and a paused volatile release window atomically", async () => {
    const campaign = frontier();
    const first = campaign.world;
    first.tiles[40 * 8 + 20] = 0;
    first.discovered[40 * 8 + 20] = 1;
    expect(campaign.travel("W02")).toBe(true);
    const world = campaign.world;
    const volatile = world.packages.find((item) =>
      item.tags.includes("volatile"),
    )!;
    world.tiles[Math.floor(volatile.y) * world.width + Math.floor(volatile.x)] =
      0;
    volatile.status = "exposed";
    world.volatile = {
      packageIds: [volatile.id],
      remaining: 0.42,
      spent: 0.18,
      precision: false,
    };
    world.climate = { coldRemaining: 2.5, warning: null, ventCooldown: 1.4 };
    campaign.state.vehicle.energy = 4.2;
    const backend = new MemoryBackend();
    const store = new CampaignStore(backend);
    await store.load();
    await store.save(campaign.state);
    const restored = (await new CampaignStore(backend).load()).state!;
    expect(restored).toEqual(campaign.state);
    expect(restored.worlds.W02!.volatile?.remaining).toBe(0.42);
    expect(restored.worlds.W01).toEqual(first);
    expect(store.inspectImport(store.export(restored))).toEqual(restored);
  });

  it("preserves W02 across return travel and keeps a stale W01 writer from overwriting it", async () => {
    const campaign = frontier(72);
    const backend = new MemoryBackend();
    const writer = new CampaignStore(backend);
    const stale = new CampaignStore(backend);
    await writer.load();
    await writer.save(campaign.state);
    await stale.load();
    expect(campaign.travel("W02")).toBe(true);
    campaign.world.tiles[48 * 3 + 24] = 0;
    campaign.world.discovered[48 * 3 + 24] = 1;
    campaign.world.packages.find(
      (item) => item.x === 24.5 && item.y === 3.5,
    )!.status = "exposed";
    const comet = structuredClone(campaign.world);
    campaign.state.vehicle.x = 5.5;
    expect(campaign.travel("W01")).toBe(true);
    expect(campaign.state.worlds.W02).toEqual(comet);
    await writer.save(campaign.state);
    const bytes = await backend.read();
    await expect(stale.save(frontier(72).state)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await backend.read()).toEqual(bytes);
    const reloaded = new Campaign(
      (await new CampaignStore(backend).load()).state!,
    );
    expect(reloaded.travel("W02")).toBe(true);
    // Visibility may grow on arrival, but excavation, cargo and objectives persist.
    expect(reloaded.world.tiles).toEqual(comet.tiles);
    expect(reloaded.world.packages).toEqual(comet.packages);
    expect(reloaded.world.missions).toEqual(comet.missions);
  });

  it("fits 100 two-world checkpoints inside the existing measured state bound", () => {
    const store = new CampaignStore(new MemoryBackend());
    let largest = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const campaign = frontier(seed);
      campaign.state.worlds.W02 = createW02(seed);
      const raw = store.export(campaign.state);
      largest = Math.max(largest, new TextEncoder().encode(raw).byteLength);
      expect(store.inspectImport(raw)).toEqual(campaign.state);
    }
    expect(largest).toBeLessThan(2 * 1024 * 1024);
    console.info(
      `Largest W01 + W02 checkpoint across 100 seeds: ${largest} bytes.`,
    );
  });
});
