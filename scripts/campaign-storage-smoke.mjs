import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";

/** Native IndexedDB contract probe against Vite source modules, not a UI test. */
export async function runCampaignStorageSmoke(browser, base) {
  const context = await browser.newContext(),
    errors = [];
  const address = new URL("__campaign-store-contract.html", base).href;
  await context.route(address, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><title>Campaign storage contract probe</title><body>Isolated IndexedDB contract probe</body></html>",
    }),
  );
  const boot = async () => {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(address);
    await page.evaluate(async (base) => {
      const persistence = await import(
        new URL("src/campaign/persistence.ts", base).href
      );
      const model = await import(new URL("src/campaign/model.ts", base).href);
      window.storageProbe = {
        ...persistence,
        model,
        store: new persistence.CampaignStore(),
        backend: new persistence.IndexedCampaignBackend(),
        notices: 0,
      };
      window.storageProbe.store.subscribe(() => window.storageProbe.notices++);
    }, base);
    return page;
  };
  try {
    const first = await boot();
    const initialized = await first.evaluate(async () => {
      const p = window.storageProbe;
      localStorage.setItem("motherload.frontier.v1", "legacy-save-sentinel");
      const loaded = await p.store.load();
      p.state = p.model.createCampaign(146);
      await p.store.save(p.state);
      return {
        empty: !loaded.state,
        blocked: loaded.blocked,
        revision: p.store.revision,
      };
    });
    assert.deepEqual(initialized, { empty: true, blocked: false, revision: 1 });
    const second = await boot();
    assert.equal(
      await second.evaluate(
        async () => (await window.storageProbe.store.load()).revision,
      ),
      1,
    );
    await first.evaluate(async () => {
      const p = window.storageProbe;
      p.state.credits = 11111;
      await p.store.save(p.state);
    });
    await second.waitForFunction(() => window.storageProbe.notices > 0);
    const stale = await second.evaluate(async () => {
      const p = window.storageProbe;
      const before = await p.backend.read();
      try {
        await p.store.save(p.model.createCampaign(512));
        return { code: "unexpected-success" };
      } catch (error) {
        return {
          code: error.code,
          unchanged:
            JSON.stringify(before) === JSON.stringify(await p.backend.read()),
        };
      }
    });
    assert.deepEqual(stale, { code: "conflict", unchanged: true });
    console.log(
      "Passed: native IndexedDB compare-and-swap rejects stale tabs and BroadcastChannel announces writes",
    );

    const atomic = await second.evaluate(async () => {
      const p = window.storageProbe;
      p.state = (await p.store.load()).state;
      p.state.credits = 22222;
      await p.store.save(p.state);
      const before = await p.backend.read(),
        revision = p.store.revision;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        const request = put.call(this, value, key);
        if (key === "current") this.transaction.abort();
        return request;
      };
      let code;
      try {
        p.state.credits = 33333;
        await p.store.save(p.state);
        code = "unexpected-success";
      } catch (error) {
        code = error.code;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      const unchanged =
        JSON.stringify(before) === JSON.stringify(await p.backend.read());
      const sameRevision = p.store.revision === revision;
      await p.store.save(p.state);
      const after = await p.backend.read();
      return {
        code,
        unchanged,
        sameRevision,
        recovered: JSON.parse(after.current).state.credits,
        backup: JSON.parse(after.backup).state.credits,
      };
    });
    assert.deepEqual(atomic, {
      code: "storage",
      unchanged: true,
      sameRevision: true,
      recovered: 33333,
      backup: 22222,
    });
    console.log(
      "Passed: aborting a native IndexedDB transaction rolls back both current and backup, then retry succeeds",
    );

    const recovery = await first.evaluate(async () => {
      const p = window.storageProbe;
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(p.CAMPAIGN_DATABASE, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("checkpoints", "readwrite");
          transaction
            .objectStore("checkpoints")
            .put("damaged-primary", "current");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      });
      const loaded = await p.store.load();
      let code;
      try {
        await p.store.save(loaded.state);
      } catch (error) {
        code = error.code;
      }
      const before = await p.backend.read();
      const restored = await p.store.restoreBackup();
      const after = await p.backend.read();
      const exported = p.store.export(restored);
      return {
        blocked: loaded.blocked,
        fromBackup: loaded.fromBackup,
        code,
        protected: before.current === "damaged-primary",
        restored: restored.credits,
        active: JSON.parse(after.current).state.credits,
        backupPreserved: after.backup === before.backup,
        exactExport:
          JSON.stringify(p.store.inspectImport(exported)) ===
          JSON.stringify(restored),
        legacy: localStorage.getItem("motherload.frontier.v1"),
        exportBytes: new TextEncoder().encode(exported).byteLength,
      };
    });
    assert.equal(recovery.blocked, true);
    assert.equal(recovery.fromBackup, true);
    assert.equal(recovery.code, "blocked");
    assert.equal(recovery.protected, true);
    assert.equal(recovery.restored, 22222);
    assert.equal(recovery.active, 22222);
    assert.equal(recovery.backupPreserved, true);
    assert.equal(recovery.exactExport, true);
    assert.equal(recovery.legacy, "legacy-save-sentinel");
    console.log(
      `Passed: protected corrupt primary, explicit native backup restore and exact export preserve Legacy bytes (${recovery.exportBytes} byte W01 checkpoint)`,
    );

    const archived = await first.evaluate(async () => {
      const p = window.storageProbe,
        now = Date.now;
      // Replacements at one timestamp, then a clock rollback, must not collide.
      Date.now = () => Date.UTC(2026, 10, 2, 12);
      try {
        for (const seed of [101, 102, 103, 104])
          await p.store.replace(p.model.createCampaign(seed));
        Date.now = () => Date.UTC(2026, 10, 1, 12);
        await p.store.replace(p.model.createCampaign(105));
      } finally {
        Date.now = now;
      }
      const list = await p.store.listArchives();
      return {
        seeds: list.map((archive) => archive.seed),
        unique: new Set(list.map((archive) => archive.id)).size,
        ordered: list.every(
          (archive, i) =>
            i === 0 ||
            Date.parse(archive.archivedAt) < Date.parse(list[i - 1].archivedAt),
        ),
      };
    });
    assert.deepEqual(archived, {
      seeds: [104, 103, 102],
      unique: 3,
      ordered: true,
    });
    console.log(
      "Passed: durable native archives retain three campaigns with collision-free ordering through equal and backward clocks",
    );

    const archiveAbort = await first.evaluate(async () => {
      const p = window.storageProbe;
      const before = {
        records: await p.backend.read(),
        archives: await p.backend.listArchives(),
      };
      const revision = p.store.revision,
        put = IDBObjectStore.prototype.put;
      // Abort after the archive insertion, oldest pruning and backup write have
      // been queued, proving that no part of replacement commits separately.
      IDBObjectStore.prototype.put = function (value, key) {
        const request = put.call(this, value, key);
        if (key === "current") this.transaction.abort();
        return request;
      };
      let code;
      try {
        await p.store.replace(p.model.createCampaign(106));
        code = "unexpected-success";
      } catch (error) {
        code = error.code;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      const after = {
        records: await p.backend.read(),
        archives: await p.backend.listArchives(),
      };
      const sameRevision = p.store.revision === revision;
      await p.store.replace(p.model.createCampaign(106));
      return {
        code,
        unchanged: JSON.stringify(before) === JSON.stringify(after),
        sameRevision,
        retrySeed: (await p.store.load()).state.seed,
        seeds: (await p.store.listArchives()).map((archive) => archive.seed),
      };
    });
    assert.deepEqual(archiveAbort, {
      code: "storage",
      unchanged: true,
      sameRevision: true,
      retrySeed: 106,
      seeds: [105, 104, 103],
    });
    console.log(
      "Passed: abort rolls back current, backup, archive insertion and pruning together; retry succeeds",
    );

    await second.evaluate(async () => {
      const p = window.storageProbe;
      await p.store.load();
      p.archiveId = (await p.store.listArchives())[0].id;
    });
    await first.evaluate(async () => {
      const p = window.storageProbe;
      const state = (await p.store.load()).state;
      state.credits += 10;
      await p.store.save(state);
    });
    const staleArchive = await second.evaluate(async () => {
      const p = window.storageProbe;
      const before = {
        records: await p.backend.read(),
        archives: await p.backend.listArchives(),
      };
      const codes = [];
      for (const action of [
        () => p.store.restoreArchive(p.archiveId),
        () => p.store.replace(p.model.createCampaign(107)),
      ]) {
        try {
          await action();
          codes.push("unexpected-success");
        } catch (error) {
          codes.push(error.code);
        }
      }
      const after = {
        records: await p.backend.read(),
        archives: await p.backend.listArchives(),
      };
      return {
        codes,
        unchanged: JSON.stringify(before) === JSON.stringify(after),
      };
    });
    assert.deepEqual(staleArchive, {
      codes: ["conflict", "conflict"],
      unchanged: true,
    });
    console.log(
      "Passed: stale archive restore and new-campaign replacement preserve every native checkpoint and archive byte",
    );

    const protectedArchives = await first.evaluate(async () => {
      const p = window.storageProbe;
      const future = JSON.parse(p.store.export(p.model.createCampaign(108)));
      future.version = 99;
      const protectedRecords = [
        ["archive:2077-01-01T00:00:00.000Z", "{damaged"],
        ["archive:2077-01-02T00:00:00.000Z", JSON.stringify(future)],
      ];
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(p.CAMPAIGN_DATABASE, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction("checkpoints", "readwrite"),
            checkpoints = transaction.objectStore("checkpoints");
          for (const [id, raw] of protectedRecords) checkpoints.put(raw, id);
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
        const invalidVisible = (await p.store.listArchives()).some((archive) =>
          protectedRecords.some(([id]) => id === archive.id),
        );
        let code;
        try {
          await p.store.restoreArchive(protectedRecords[1][0]);
        } catch (error) {
          code = error.code;
        }
        for (const seed of [109, 110, 111, 112])
          await p.store.replace(p.model.createCampaign(seed));
        const raw = await p.backend.listArchives(),
          list = await p.store.listArchives();
        return {
          invalidVisible,
          code,
          untouched: protectedRecords.every(([id, checkpoint]) =>
            raw.some(
              (entry) => entry.id === id && entry.checkpoint === checkpoint,
            ),
          ),
          validSeeds: list.map((archive) => archive.seed),
          timestampUnaffected: list.every(
            (archive) => Date.parse(archive.archivedAt) < Date.UTC(2077, 0, 1),
          ),
        };
      } finally {
        database.close();
      }
    });
    assert.deepEqual(protectedArchives, {
      invalidVisible: false,
      code: "invalid",
      untouched: true,
      validSeeds: [111, 110, 109],
      timestampUnaffected: true,
    });
    console.log(
      "Passed: archive listing and three-valid-archive pruning preserve malformed/future records without affecting archive timestamps",
    );
    assert.deepEqual(errors, []);
    await Promise.all(
      [first, second].map((page) =>
        page.evaluate(() => {
          window.storageProbe.store.close();
          window.storageProbe.backend.close();
        }),
      ),
    );
    return recovery;
  } finally {
    await context.close();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const browser = await launchBrowser();
  try {
    await runCampaignStorageSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
    );
    console.log(
      "Campaign native storage contract probe passed; full game UI validation remains separate.",
    );
  } finally {
    await browser.close();
  }
}
