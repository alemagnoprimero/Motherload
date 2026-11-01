import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-helpers.mjs";

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
