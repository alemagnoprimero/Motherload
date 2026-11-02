import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../src/campaign/model";
import {
  CampaignStore,
  CampaignSaveError,
  IndexedCampaignBackend,
  MAX_CAMPAIGN_BYTES,
  type CampaignBackend,
  type CampaignArchiveRecord,
} from "../src/campaign/persistence";

/** Unit transaction contract; real IndexedDB is covered by browser scenarios. */
class MemoryCampaignBackend implements CampaignBackend {
  current: string | null = null;
  backup: string | null = null;
  failRead = false;
  failWrite = false;
  writes = 0;
  archives: CampaignArchiveRecord[] = [];

  async read() {
    if (this.failRead) throw new Error("Storage disabled");
    return { current: this.current, backup: this.backup };
  }

  async listArchives() {
    if (this.failRead) throw new Error("Storage disabled");
    return structuredClone(this.archives);
  }

  async commit(
    expected: string | null,
    current: string,
    backup?: string | null,
    archive?: string,
  ) {
    if (this.current !== expected)
      throw new CampaignSaveError("conflict", "Newer campaign checkpoint");
    if (this.failWrite) throw new Error("QuotaExceededError");
    if (archive !== undefined) {
      this.archives.unshift({
        id: `archive:${new Date(Date.UTC(2026, 10, 2) + this.writes).toISOString()}`,
        checkpoint: archive,
      });
      this.archives = this.archives.slice(0, 3);
    }
    if (backup !== undefined) this.backup = backup;
    this.current = current;
    this.writes++;
  }
}

const state = (credits = 200, seed = 146) => ({
  ...createCampaign(seed),
  id: `campaign-storage-test-${seed}`,
  credits,
});

describe("campaign checkpoint transactions", () => {
  it("keeps the outgoing campaign through a new run and 60 seconds of autosaves", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend),
      original = state(4190, 51);
    original.worlds.W01.tiles[80] = 0;
    original.worlds.W01.discovered[80] = 1;
    await store.load();
    await store.save(original);
    const originalBytes = backend.current;
    const next = new Campaign(state(200, 52));
    await store.replace(next.state);
    for (let second = 0; second < 60; second++) {
      for (let frame = 0; frame < 60; frame++) next.tick(1 / 60, {});
      if ((second + 1) % 20 === 0) await store.save(next.state);
    }
    expect(JSON.parse(backend.backup!).state.seed).toBe(52);
    const archives = await new CampaignStore(backend).listArchives();
    expect(archives).toHaveLength(1);
    expect(archives[0]).toMatchObject({
      seed: 51,
      credits: 4190,
      campaignId: original.id,
      currentWorld: "W01",
    });
    expect(backend.archives[0].checkpoint).toBe(originalBytes);
    const restored = await store.restoreArchive(archives[0].id);
    expect(restored).toEqual(original);
    expect((await store.load()).state).toEqual(original);
    expect((await store.listArchives()).map((archive) => archive.seed)).toEqual(
      [52, 51],
    );
    expect(JSON.parse(backend.backup!).state.elapsed).toBeGreaterThan(59.9);
  });

  it("lists the three most recently replaced campaigns without archiving same-run checkpoint repair", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    await store.save(state(200, 1));
    for (let seed = 2; seed <= 5; seed++) await store.replace(state(200, seed));
    expect((await store.listArchives()).map((archive) => archive.seed)).toEqual(
      [4, 3, 2],
    );
    const before = await backend.listArchives();
    await store.replace(state(400, 5));
    expect(await backend.listArchives()).toEqual(before);
  });

  it("aborts replacement without changing current, backup, archives or revision", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    await store.save(state(200, 1));
    await store.replace(state(200, 2));
    const before = {
      records: await backend.read(),
      archives: await backend.listArchives(),
      revision: store.revision,
    };
    backend.failWrite = true;
    await expect(store.replace(state(200, 3))).rejects.toMatchObject({
      code: "storage",
    });
    expect(await backend.read()).toEqual(before.records);
    expect(await backend.listArchives()).toEqual(before.archives);
    expect(store.revision).toBe(before.revision);
    backend.failWrite = false;
    await store.replace(state(200, 3));
    expect((await store.listArchives()).map((archive) => archive.seed)).toEqual(
      [2, 1],
    );
  });

  it("rejects stale replacement and archive restore without changing any record", async () => {
    const backend = new MemoryCampaignBackend(),
      first = new CampaignStore(backend),
      stale = new CampaignStore(backend);
    await first.load();
    await first.save(state(200, 1));
    await first.replace(state(200, 2));
    await stale.load();
    const id = (await first.listArchives())[0].id;
    await first.save(state(1000, 2));
    const records = await backend.read(),
      archives = await backend.listArchives();
    await expect(stale.restoreArchive(id)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(stale.replace(state(200, 3))).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await backend.read()).toEqual(records);
    expect(await backend.listArchives()).toEqual(archives);
  });

  it("does not expose or rewrite malformed or future archived checkpoints", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend),
      future = JSON.parse(store.export(state(200, 42)));
    future.version = 99;
    backend.archives = [
      { id: "archive:2026-11-02T10:00:00.000Z", checkpoint: "{damaged" },
      {
        id: "archive:2026-11-02T11:00:00.000Z",
        checkpoint: JSON.stringify(future),
      },
    ];
    await store.load();
    await store.save(state());
    const records = await backend.read(),
      archives = await backend.listArchives();
    expect(await store.listArchives()).toEqual([]);
    for (const id of [
      "current",
      "archive:not-a-date",
      ...archives.map((a) => a.id),
    ])
      await expect(store.restoreArchive(id)).rejects.toMatchObject({
        code: "invalid",
      });
    expect(await backend.read()).toEqual(records);
    expect(await backend.listArchives()).toEqual(archives);
  });

  it("round-trips 100 generated W01 snapshots inside the state-size bound", () => {
    const store = new CampaignStore(new MemoryCampaignBackend());
    let largest = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const generated = state(200, seed),
        raw = store.export(generated);
      largest = Math.max(largest, new TextEncoder().encode(raw).byteLength);
      expect(store.inspectImport(raw)).toEqual(generated);
    }
    expect(largest).toBeLessThan(2 * 1024 * 1024);
    console.info(`Largest W01 checkpoint across 100 seeds: ${largest} bytes.`);
  });

  it("saves complete generated campaigns with versioned fixed-point money", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    expect(await store.load()).toMatchObject({ revision: 0, blocked: false });
    const original = state(12345);
    await store.save(original);
    const reopened = new CampaignStore(backend);
    expect(await reopened.load()).toMatchObject({
      state: original,
      revision: 1,
      blocked: false,
    });
    expect(backend.backup).toBeNull();
    expect(
      new TextEncoder().encode(store.export(original)).byteLength,
    ).toBeLessThan(MAX_CAMPAIGN_BYTES);
  });

  it("rotates only the preceding valid primary into the backup", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    await store.save(state(1000));
    const first = backend.current;
    await store.save(state(2000));
    expect(backend.backup).toBe(first);
    expect(store.revision).toBe(2);
    const restored = await store.restoreBackup();
    expect(restored.credits).toBe(1000);
    expect(store.revision).toBe(3);
    expect(JSON.parse(backend.backup!).state.credits).toBe(2000);
    expect((await store.restoreBackup()).credits).toBe(2000);
  });

  it("rejects stale tabs without overwriting the current checkpoint or backup", async () => {
    const backend = new MemoryCampaignBackend(),
      first = new CampaignStore(backend),
      second = new CampaignStore(backend);
    await first.load();
    await second.load();
    await first.save(state(1000));
    const current = backend.current;
    await expect(second.save(state(2000))).rejects.toMatchObject({
      code: "conflict",
    });
    expect(backend.current).toBe(current);
    expect(backend.backup).toBeNull();
    await expect(second.replace(state(3000))).rejects.toMatchObject({
      code: "conflict",
    });
    await second.load();
    await second.save(state(4000));
    expect(JSON.parse(backend.backup!).state.credits).toBe(1000);
  });

  it("preserves a corrupt primary while offering a valid backup for review", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    await store.save(state(1000));
    await store.save(state(2000));
    const backup = backend.backup;
    backend.current = "damaged-primary";
    const result = await store.load();
    expect(result).toMatchObject({
      state: state(1000),
      blocked: true,
      backupAvailable: true,
      fromBackup: true,
    });
    await expect(store.save(state(3000))).rejects.toMatchObject({
      code: "blocked",
    });
    expect(backend.current).toBe("damaged-primary");
    expect(backend.backup).toBe(backup);
    expect(await store.restoreBackup()).toEqual(state(1000));
    expect((await store.load()).blocked).toBe(false);
    expect(backend.backup).toBe(backup);
  });

  it("requires explicit replacement for unsupported primary records", async () => {
    const backend = new MemoryCampaignBackend();
    backend.current = '{"format":"motherload-campaign","version":42}';
    const store = new CampaignStore(backend);
    expect(await store.load()).toMatchObject({
      blocked: true,
      backupAvailable: false,
    });
    await expect(store.save(state())).rejects.toMatchObject({
      code: "blocked",
    });
    expect(backend.writes).toBe(0);
    await store.replace(state(6000));
    expect((await store.load()).state?.credits).toBe(6000);
    expect(backend.backup).toBeNull();
  });

  it("protects an orphaned future backup from implicit first-run replacement", async () => {
    const backend = new MemoryCampaignBackend();
    backend.backup = '{"format":"motherload-campaign","version":42}';
    const store = new CampaignStore(backend);
    expect((await store.load()).blocked).toBe(true);
    await expect(store.save(state())).rejects.toMatchObject({
      code: "blocked",
    });
    expect(backend.current).toBeNull();
    expect(backend.backup).toContain('"version":42');
  });

  it("leaves both records unchanged when an atomic transaction fails", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    await store.save(state(1000));
    await store.save(state(2000));
    const records = await backend.read();
    backend.failWrite = true;
    await expect(store.save(state(3000))).rejects.toMatchObject({
      code: "storage",
    });
    expect(await backend.read()).toEqual(records);
    expect(store.revision).toBe(2);
    backend.failWrite = false;
    await store.save(state(4000));
    expect(store.revision).toBe(3);
    expect(JSON.parse(backend.backup!).state.credits).toBe(2000);
  });

  it("serializes pending writes and snapshots state before awaiting storage", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    const changing = state(1000);
    const first = store.save(changing);
    changing.credits = 2000;
    const second = store.save(changing);
    changing.credits = 3000;
    await Promise.all([first, second]);
    expect(JSON.parse(backend.current!).state.credits).toBe(2000);
    expect(JSON.parse(backend.backup!).state.credits).toBe(1000);
    expect(store.revision).toBe(2);
  });

  it("rejects a backup restore after another tab writes", async () => {
    const backend = new MemoryCampaignBackend(),
      first = new CampaignStore(backend),
      second = new CampaignStore(backend);
    await first.load();
    await first.save(state(1000));
    await first.save(state(2000));
    await second.load();
    await first.save(state(3000));
    const records = await backend.read();
    await expect(second.restoreBackup()).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await backend.read()).toEqual(records);
  });

  it("permits in-memory export when storage is unavailable", async () => {
    const backend = new MemoryCampaignBackend();
    backend.failRead = true;
    const store = new CampaignStore(backend);
    const unavailable = await store.load();
    expect(unavailable.blocked).toBe(true);
    expect(unavailable.state).toBeUndefined();
    const raw = store.export(state(9000));
    expect(store.inspectImport(raw)).toEqual(state(9000));
    await expect(store.save(state())).rejects.toMatchObject({
      code: "blocked",
    });
    expect(backend.writes).toBe(0);
  });

  it("never implicitly initializes IndexedDB or writes before a load", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await expect(store.save(state())).rejects.toMatchObject({
      code: "blocked",
    });
    expect(backend.writes).toBe(0);
    const unavailable = new CampaignStore(
      new IndexedCampaignBackend(undefined),
    );
    expect((await unavailable.load()).blocked).toBe(true);
  });

  it("validates imports without changing saved records", async () => {
    const backend = new MemoryCampaignBackend(),
      store = new CampaignStore(backend);
    await store.load();
    await store.save(state(1000));
    const raw = store.export(state(7000)),
      records = await backend.read();
    expect(store.inspectImport(raw)).toEqual(state(7000));
    expect(() => store.inspectImport("{broken")).toThrow(/JSON/);
    expect(() => store.inspectImport('{"version":4,"tiles":[]}')).toThrow(
      /campaign checkpoint/,
    );
    const future = JSON.parse(raw);
    future.version = 2;
    expect(() => store.inspectImport(JSON.stringify(future))).toThrow(
      /supported/,
    );
    const invalid = JSON.parse(raw);
    invalid.state.credits = -1;
    expect(() => store.inspectImport(JSON.stringify(invalid))).toThrow();
    expect(await backend.read()).toEqual(records);
    expect(() =>
      store.inspectImport(" ".repeat(MAX_CAMPAIGN_BYTES + 1)),
    ).toThrow(/16 MiB/);
  });
});
