import { describe, expect, it } from "vitest";
import {
  createState,
  decodeSave,
  SAVE_KEY,
  SURFACE,
  WIDTH,
  HEIGHT,
} from "../src/model";
import {
  MAX_SAVE_BYTES,
  SAVE_BACKUP_KEY,
  SAVE_RECOVERY_KEY,
  SaveError,
  SaveStore,
  type StorageLike,
} from "../src/storage";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  failWrite?: string;
  failRead = false;
  writes: string[] = [];
  getItem(key: string) {
    if (this.failRead) throw new Error("storage unavailable");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes.push(key);
    if (key === this.failWrite) throw new Error("quota exceeded");
    this.data.set(key, value);
  }
}
const expedition = (money: number) => ({ ...createState(), money });

function legacySave() {
  return JSON.stringify({
    version: 2,
    seed: 123,
    tiles: Array.from({ length: WIDTH * HEIGHT }, (_, index) => {
      const row = Math.floor(index / WIDTH);
      return row <= SURFACE ? 0 : row === HEIGHT - 1 ? 8 : 1;
    }),
    x: 12,
    y: SURFACE,
    money: 625,
    fuel: 70,
    hull: 60,
    inventory: [3, 4, 5, 6],
    upgrades: { drill: 1, tank: 0, cargo: 0, hull: 0 },
    mined: 0,
    deepest: 0,
  });
}

describe("safe expedition storage", () => {
  it("loads a fresh store and backs up the preceding expedition before writing", async () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    expect(store.load()).toEqual({
      blocked: false,
      fromBackup: false,
      backupAvailable: false,
      notice: undefined,
    });
    await store.save(expedition(100));
    const first = storage.getItem(SAVE_KEY)!;
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBeNull();
    storage.writes = [];
    await store.save(expedition(200));
    expect(storage.writes).toEqual([SAVE_BACKUP_KEY, SAVE_KEY]);
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(first);
    expect(store.load().state?.money).toBe(200);
    expect(store.hasExternalChange()).toBe(false);
  });

  it("does not replace a useful backup when the saved state has not changed", async () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    store.load();
    await store.save(expedition(100));
    await store.save(expedition(200));
    const backup = storage.getItem(SAVE_BACKUP_KEY);
    storage.writes = [];
    await store.save(expedition(200));
    expect(storage.writes).toEqual([]);
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(backup);
  });

  it("preserves a corrupt primary while loading a valid backup for review", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, "damaged-save");
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(350)));
    const store = new SaveStore(storage),
      loaded = store.load();
    expect(loaded).toMatchObject({
      blocked: true,
      fromBackup: true,
      backupAvailable: true,
      state: { money: 350 },
    });
    await expect(store.save(expedition(999))).rejects.toMatchObject({
      code: "blocked",
    });
    expect(storage.getItem(SAVE_KEY)).toBe("damaged-save");
    expect((await store.restoreBackup()).money).toBe(350);
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(350);
    await store.save(expedition(400));
    expect(store.load().blocked).toBe(false);
  });

  it("keeps unsupported or corrupt saves when no valid backup exists", async () => {
    for (const raw of [
      "damaged",
      JSON.stringify({ ...expedition(100), version: 999 }),
    ]) {
      const storage = new MemoryStorage();
      storage.data.set(SAVE_KEY, raw);
      storage.data.set(SAVE_BACKUP_KEY, "also-damaged");
      const store = new SaveStore(storage);
      expect(store.load()).toMatchObject({
        blocked: true,
        backupAvailable: false,
      });
      await expect(store.save(expedition(200))).rejects.toBeInstanceOf(
        SaveError,
      );
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
      await expect(store.restoreBackup()).rejects.toMatchObject({
        code: "invalid",
      });
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
    }
  });

  it("exports and validates a complete expedition without changing storage", () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    const state = expedition(1234);
    const file = store.export(state);
    expect(store.inspectImport(file)).toEqual(state);
    expect(storage.writes).toEqual([]);
    for (const raw of [
      "not JSON",
      "[]",
      JSON.stringify({ ...state, version: 999 }),
      "x".repeat(MAX_SAVE_BYTES + 1),
      "💎".repeat(MAX_SAVE_BYTES / 2),
    ])
      expect(() => store.inspectImport(raw)).toThrow(SaveError);
    expect(storage.writes).toEqual([]);
  });

  it("backs up exact legacy bytes before writing the migrated expedition", async () => {
    const storage = new MemoryStorage(),
      raw = legacySave();
    storage.data.set(SAVE_KEY, raw);
    const store = new SaveStore(storage),
      loaded = store.load();
    expect(loaded.blocked).toBe(false);
    expect(loaded.state?.version).toBe(createState().version);
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    await store.save({ ...loaded.state!, money: 626 });
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(raw);
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(626);
  });

  it("leaves the primary untouched when backup storage is full", async () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    store.load();
    await store.save(expedition(100));
    const primary = storage.getItem(SAVE_KEY);
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(50)));
    const backup = storage.getItem(SAVE_BACKUP_KEY);
    storage.failWrite = SAVE_BACKUP_KEY;
    await expect(store.save(expedition(200))).rejects.toMatchObject({
      code: "storage",
    });
    expect(storage.getItem(SAVE_KEY)).toBe(primary);
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(backup);
  });

  it("keeps the preceding primary and a valid backup when the primary write fails", async () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    store.load();
    await store.save(expedition(100));
    const primary = storage.getItem(SAVE_KEY);
    storage.failWrite = SAVE_KEY;
    await expect(store.save(expedition(200))).rejects.toMatchObject({
      code: "storage",
    });
    expect(storage.getItem(SAVE_KEY)).toBe(primary);
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(primary);
    storage.failWrite = undefined;
    await store.save(expedition(200));
    expect(store.load().state?.money).toBe(200);
  });

  it("blocks stale-tab writes until the other expedition is loaded", async () => {
    const storage = new MemoryStorage(),
      first = new SaveStore(storage),
      second = new SaveStore(storage);
    first.load();
    second.load();
    await first.save(expedition(100));
    expect(second.hasExternalChange()).toBe(true);
    await expect(second.save(expedition(200))).rejects.toMatchObject({
      code: "conflict",
    });
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(100);
    expect(second.load().state?.money).toBe(100);
    await second.save(expedition(300));
    expect(first.hasExternalChange()).toBe(true);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(100);
  });

  it("requires explicit replacement to overwrite protected data and preserves a valid previous run", async () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    storage.data.set(SAVE_KEY, "broken");
    store.load();
    await store.replace(expedition(100));
    expect(store.load().blocked).toBe(false);
    await store.replace(expedition(200));
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(100);
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(200);
    expect((await store.restoreBackup()).money).toBe(100);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(200);
  });

  it("cancels older queued autosaves before a confirmed replacement", async () => {
    const storage = new MemoryStorage(),
      jobs: (() => void)[] = [];
    const exclusive = (operation: () => void) =>
      new Promise<void>((resolve, reject) =>
        jobs.push(() => {
          try {
            operation();
            resolve();
          } catch (error) {
            reject(error);
          }
        }),
      );
    const store = new SaveStore(storage, exclusive);
    store.load();
    const oldSave = store.save(expedition(100));
    const newSave = store.replace(expedition(200));
    jobs.shift()!();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    jobs.shift()!();
    await Promise.all([oldSave, newSave]);
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(200);
  });

  it("reports unavailable storage without deleting or replacing anything", async () => {
    const storage = new MemoryStorage(),
      store = new SaveStore(storage);
    storage.failRead = true;
    expect(store.load()).toMatchObject({
      blocked: true,
      backupAvailable: false,
    });
    await expect(store.replace(expedition(100))).rejects.toMatchObject({
      code: "storage",
    });
    expect(storage.writes).toEqual([]);
  });

  it("captures a save before waiting so later gameplay cannot mutate it", async () => {
    const storage = new MemoryStorage();
    let release = () => {};
    const store = new SaveStore(
      storage,
      (operation) =>
        new Promise<void>((resolve) => {
          release = () => {
            operation();
            resolve();
          };
        }),
    );
    store.load();
    const state = expedition(100);
    const pending = store.save(state);
    state.money = 999;
    state.tiles[4 * WIDTH + 12] = 0;
    release();
    await pending;
    const saved = decodeSave(storage.getItem(SAVE_KEY)!);
    expect(saved.money).toBe(100);
    expect(saved.tiles[4 * WIDTH + 12]).not.toBe(0);
  });

  it("checks for conflicting writes inside the shared exclusive operation", async () => {
    const storage = new MemoryStorage(),
      jobs: (() => void)[] = [];
    const exclusive = (operation: () => void) =>
      new Promise<void>((resolve, reject) =>
        jobs.push(() => {
          try {
            operation();
            resolve();
          } catch (error) {
            reject(error);
          }
        }),
      );
    const first = new SaveStore(storage, exclusive),
      second = new SaveStore(storage, exclusive);
    first.load();
    second.load();
    const results = Promise.allSettled([
      first.save(expedition(100)),
      second.save(expedition(200)),
    ]);
    jobs.shift()!();
    jobs.shift()!();
    const settled = await results;
    expect(settled[0].status).toBe("fulfilled");
    expect(settled[1]).toMatchObject({
      status: "rejected",
      reason: { code: "conflict" },
    });
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(100);
  });

  it("offers a surviving backup when the primary is missing without silently replacing it", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(450)));
    const store = new SaveStore(storage);
    expect(store.load()).toMatchObject({
      state: { money: 450 },
      blocked: true,
      fromBackup: true,
    });
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    await store.restoreBackup();
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(450);
  });

  it("keeps both expeditions if the restored primary cannot be written", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(200)));
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(100)));
    const store = new SaveStore(storage);
    store.load();
    storage.failWrite = SAVE_KEY;
    await expect(store.restoreBackup()).rejects.toMatchObject({
      code: "storage",
    });
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(200);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(100);
    storage.failWrite = undefined;
    const reloaded = new SaveStore(storage);
    expect(reloaded.load().state?.money).toBe(200);
    expect((await reloaded.restoreBackup()).money).toBe(100);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(200);
  });

  it("can recover the previous primary after backup rotation fails and the page reloads", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(200)));
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(100)));
    const store = new SaveStore(storage);
    store.load();
    storage.failWrite = SAVE_BACKUP_KEY;
    expect((await store.restoreBackup()).money).toBe(100);
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(100);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(100);
    expect(storage.getItem(SAVE_RECOVERY_KEY)).not.toBeNull();
    storage.failWrite = undefined;
    const reloaded = new SaveStore(storage);
    expect(reloaded.load()).toMatchObject({
      state: { money: 100 },
      backupAvailable: true,
      blocked: false,
    });
    expect((await reloaded.restoreBackup()).money).toBe(200);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(100);
  });

  it("preserves a journal-only backup when its own restoration then fails", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(200)));
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(100)));
    const store = new SaveStore(storage);
    store.load();
    storage.failWrite = SAVE_BACKUP_KEY;
    await store.restoreBackup();
    storage.failWrite = SAVE_KEY;
    const reloaded = new SaveStore(storage);
    reloaded.load();
    await expect(reloaded.restoreBackup()).rejects.toMatchObject({
      code: "storage",
    });
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(100);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(200);
    storage.failWrite = undefined;
    const final = new SaveStore(storage);
    final.load();
    expect((await final.restoreBackup()).money).toBe(200);
  });

  it("does not change either normal slot if the restoration journal cannot be saved", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(200)));
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(100)));
    const store = new SaveStore(storage);
    store.load();
    storage.failWrite = SAVE_RECOVERY_KEY;
    await expect(store.restoreBackup()).rejects.toMatchObject({
      code: "storage",
    });
    expect(decodeSave(storage.getItem(SAVE_KEY)!).money).toBe(200);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(100);
  });

  it("ignores an obsolete restoration journal after a newer expedition has been saved", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(300)));
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(250)));
    storage.data.set(
      SAVE_RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        primary: JSON.stringify(expedition(100)),
        backup: JSON.stringify(expedition(200)),
      }),
    );
    const store = new SaveStore(storage);
    store.load();
    expect((await store.restoreBackup()).money).toBe(250);
    expect(decodeSave(storage.getItem(SAVE_BACKUP_KEY)!).money).toBe(300);
  });

  it("retains a legacy target when a restoration backup rotation fails", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(200)));
    storage.data.set(SAVE_BACKUP_KEY, legacySave());
    const store = new SaveStore(storage);
    store.load();
    storage.failWrite = SAVE_BACKUP_KEY;
    expect((await store.restoreBackup()).money).toBe(625);
    storage.failWrite = undefined;
    const reloaded = new SaveStore(storage);
    expect(reloaded.load().state?.version).toBe(createState().version);
    expect((await reloaded.restoreBackup()).money).toBe(200);
  });

  it("does not fail a completed restoration when journal cleanup is denied", async () => {
    const storage = new MemoryStorage();
    storage.data.set(SAVE_KEY, JSON.stringify(expedition(200)));
    storage.data.set(SAVE_BACKUP_KEY, JSON.stringify(expedition(100)));
    const denyCleanup: StorageLike = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: () => {
        throw new Error("cleanup denied");
      },
    };
    const store = new SaveStore(denyCleanup);
    store.load();
    expect((await store.restoreBackup()).money).toBe(100);
    expect(storage.getItem(SAVE_RECOVERY_KEY)).not.toBeNull();
    const reloaded = new SaveStore(denyCleanup);
    expect(reloaded.load().state?.money).toBe(100);
    expect((await reloaded.restoreBackup()).money).toBe(200);
  });
});
