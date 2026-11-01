import { describe, expect, it } from "vitest";
import { createCampaign } from "../src/campaign/model";
import {
  CampaignStore,
  CampaignSaveError,
  IndexedCampaignBackend,
  MAX_CAMPAIGN_BYTES,
  type CampaignBackend,
} from "../src/campaign/persistence";

/** Unit transaction contract; real IndexedDB is covered by browser scenarios. */
class MemoryCampaignBackend implements CampaignBackend {
  current: string | null = null;
  backup: string | null = null;
  failRead = false;
  failWrite = false;
  writes = 0;

  async read() {
    if (this.failRead) throw new Error("Storage disabled");
    return { current: this.current, backup: this.backup };
  }

  async commit(
    expected: string | null,
    current: string,
    backup?: string | null,
  ) {
    if (this.current !== expected)
      throw new CampaignSaveError("conflict", "Newer campaign checkpoint");
    if (this.failWrite) throw new Error("QuotaExceededError");
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
