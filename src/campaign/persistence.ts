import { decodeCampaign } from "./model";
import type { CampaignCheckpoint, CampaignState } from "./types";

export const CAMPAIGN_DATABASE = "motherload.campaign.v1";
/** Bounded transport limit; later slices must measure their entity/export size. */
export const MAX_CAMPAIGN_BYTES = 16 * 1024 * 1024;
export const MAX_CAMPAIGN_ARCHIVES = 3;
const ARCHIVE_PREFIX = "archive:";

export type CampaignSaveCode = "conflict" | "blocked" | "invalid" | "storage";
export class CampaignSaveError extends Error {
  constructor(
    public readonly code: CampaignSaveCode,
    message: string,
  ) {
    super(message);
    this.name = "CampaignSaveError";
  }
}

export interface CampaignRecords {
  current: string | null;
  backup: string | null;
}

export interface CampaignArchiveRecord {
  id: string;
  checkpoint: string;
}

/** Summaries never expose mutable saved state to the menu. */
export interface CampaignArchive {
  id: string;
  archivedAt: string;
  savedAt: string;
  campaignId: string;
  seed: number;
  currentWorld: CampaignState["currentWorld"];
  /** Integer tenths, as in the active campaign. */
  credits: number;
  elapsed: number;
}

function archiveTime(id: string): number | undefined {
  if (!id.startsWith(ARCHIVE_PREFIX)) return;
  const iso = id.slice(ARCHIVE_PREFIX.length),
    time = Date.parse(iso);
  if (Number.isFinite(time) && new Date(time).toISOString() === iso)
    return time;
}

/** One compare-and-swap transaction includes backup and optional archive pruning. */
export interface CampaignBackend {
  read(): Promise<CampaignRecords>;
  listArchives(): Promise<CampaignArchiveRecord[]>;
  commit(
    expected: string | null,
    current: string,
    backup?: string | null,
    archive?: string,
  ): Promise<void>;
  close?(): void;
}

export interface CampaignLoadResult {
  state?: CampaignState;
  revision: number;
  notice?: string;
  blocked: boolean;
  backupAvailable: boolean;
  fromBackup: boolean;
}

function storageFailure(error: unknown): CampaignSaveError {
  if (error instanceof CampaignSaveError) return error;
  return new CampaignSaveError(
    "storage",
    "Campaign storage could not be written. Keep playing in memory and export a save before leaving.",
  );
}

/** Checkpoints and archives share a transaction, including quota/abort failure. */
export class IndexedCampaignBackend implements CampaignBackend {
  private database?: Promise<IDBDatabase>;

  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.database)
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (!this.factory) {
          reject(new Error("IndexedDB is unavailable"));
          return;
        }
        const request = this.factory.open(CAMPAIGN_DATABASE, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("checkpoints"))
            request.result.createObjectStore("checkpoints");
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => database.close();
          resolve(database);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(
            new Error("Another tab is holding the campaign database open"),
          );
      }).catch((error) => {
        this.database = undefined;
        throw error;
      });
    return this.database!;
  }

  async read(): Promise<CampaignRecords> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("checkpoints", "readonly");
      const store = transaction.objectStore("checkpoints");
      const current = store.get("current"),
        backup = store.get("backup");
      transaction.oncomplete = () => {
        // Unexpected record types are protected rather than silently replaced.
        if (
          (current.result != null && typeof current.result !== "string") ||
          (backup.result != null && typeof backup.result !== "string")
        ) {
          reject(new Error("Campaign database contains an unsupported record"));
          return;
        }
        resolve({
          current: current.result ?? null,
          backup: backup.result ?? null,
        });
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async commit(
    expected: string | null,
    current: string,
    backup?: string | null,
    archive?: string,
  ): Promise<void> {
    if (archive !== undefined) {
      // Archiving a replacement may only retain its validated preceding primary.
      decodeCheckpoint(archive);
      if (archive !== expected)
        throw new CampaignSaveError(
          "invalid",
          "The outgoing campaign changed.",
        );
    }
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("checkpoints", "readwrite");
      const store = transaction.objectStore("checkpoints");
      let failure: unknown;
      const abort = (error: unknown) => {
        failure = error;
        transaction.abort();
      };
      const writeCheckpoint = () => {
        if (backup !== undefined) {
          if (backup === null) store.delete("backup");
          else store.put(backup, "backup");
        }
        store.put(current, "current");
      };
      const previous = store.get("current");
      previous.onsuccess = () => {
        if ((previous.result ?? null) !== expected) {
          abort(
            new CampaignSaveError(
              "conflict",
              "Another tab changed this campaign. Load its checkpoint before continuing, or export this tab first.",
            ),
          );
          return;
        }
        try {
          if (archive === undefined) {
            writeCheckpoint();
            return;
          }
          const archives: { id: string; time: number }[] = [],
            occupiedIds = new Set<string>();
          let newestTime = Date.now() - 1;
          const request = store.openCursor();
          request.onsuccess = () => {
            try {
              const cursor = request.result;
              if (cursor) {
                if (typeof cursor.key === "string") {
                  const time = archiveTime(cursor.key);
                  if (time !== undefined) {
                    occupiedIds.add(cursor.key);
                    // Unsupported/corrupt records are never silently pruned.
                    if (
                      typeof cursor.value === "string" &&
                      validCheckpoint(cursor.value)
                    ) {
                      newestTime = Math.max(newestTime, time);
                      archives.push({ id: cursor.key, time });
                    }
                  }
                }
                cursor.continue();
                return;
              }
              let id: string;
              do {
                id = `${ARCHIVE_PREFIX}${new Date(++newestTime).toISOString()}`;
              } while (occupiedIds.has(id));
              store.put(archive, id);
              archives.sort((a, b) => b.time - a.time);
              for (const old of archives.slice(MAX_CAMPAIGN_ARCHIVES - 1))
                store.delete(old.id);
              writeCheckpoint();
            } catch (error) {
              abort(error);
            }
          };
        } catch (error) {
          abort(error);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(failure ?? transaction.error);
      transaction.onabort = () => reject(failure ?? transaction.error);
    });
  }

  async listArchives(): Promise<CampaignArchiveRecord[]> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("checkpoints", "readonly"),
        request = transaction.objectStore("checkpoints").openCursor(),
        archives: CampaignArchiveRecord[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (
          typeof cursor.key === "string" &&
          archiveTime(cursor.key) !== undefined &&
          typeof cursor.value === "string"
        )
          archives.push({ id: cursor.key, checkpoint: cursor.value });
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(archives);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  close() {
    void this.database?.then((database) => database.close()).catch(() => {});
    this.database = undefined;
  }
}

function decodeCheckpoint(raw: string): CampaignCheckpoint {
  if (new TextEncoder().encode(raw).byteLength > MAX_CAMPAIGN_BYTES)
    throw new CampaignSaveError(
      "invalid",
      "Campaign saves must be at most 16 MiB.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CampaignSaveError(
      "invalid",
      "This campaign file is not valid JSON.",
    );
  }
  const envelope = parsed as Partial<CampaignCheckpoint> | null;
  if (
    !envelope ||
    envelope.format !== "motherload-campaign" ||
    envelope.version !== 1 ||
    !Number.isSafeInteger(envelope.revision) ||
    envelope.revision! < 0 ||
    typeof envelope.savedAt !== "string" ||
    !Number.isFinite(Date.parse(envelope.savedAt))
  )
    throw new CampaignSaveError(
      "invalid",
      "This is not a supported campaign checkpoint. Import a Motherload campaign export.",
    );
  try {
    const state = decodeCampaign(JSON.stringify(envelope.state));
    return { ...envelope, state } as CampaignCheckpoint;
  } catch (error) {
    throw new CampaignSaveError(
      "invalid",
      error instanceof Error
        ? error.message
        : "This campaign state is invalid.",
    );
  }
}

function validCheckpoint(raw: string | null): CampaignCheckpoint | undefined {
  if (raw === null) return;
  try {
    return decodeCheckpoint(raw);
  } catch {
    return;
  }
}

/** Campaign snapshots do not read, convert or delete retired browser save data. */
export class CampaignStore {
  private expected: string | null | undefined;
  private protected = true;
  private currentRevision = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly channel?: BroadcastChannel;
  private readonly writer = `${Date.now()}-${Math.random()}`;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly backend: CampaignBackend = new IndexedCampaignBackend(),
  ) {
    if (
      typeof window !== "undefined" &&
      typeof BroadcastChannel !== "undefined"
    ) {
      this.channel = new BroadcastChannel(CAMPAIGN_DATABASE);
      this.channel.onmessage = (event) => {
        if (event.data?.writer !== this.writer)
          this.listeners.forEach((listener) => listener());
      };
    }
  }

  get revision() {
    return this.currentRevision;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<CampaignLoadResult> {
    await this.writes;
    let records: CampaignRecords;
    try {
      records = await this.backend.read();
    } catch {
      this.expected = undefined;
      this.protected = true;
      return {
        revision: 0,
        blocked: true,
        backupAvailable: false,
        fromBackup: false,
        notice:
          "Campaign storage is unavailable. This run can be played and exported in memory.",
      };
    }
    this.expected = records.current;
    const current = validCheckpoint(records.current),
      backup = validCheckpoint(records.backup);
    this.currentRevision = current?.revision ?? backup?.revision ?? 0;
    this.protected =
      (records.current !== null && !current) ||
      (records.current === null && records.backup !== null);
    if (current)
      return {
        state: current.state,
        revision: current.revision,
        blocked: false,
        backupAvailable: Boolean(backup),
        fromBackup: false,
      };
    if (backup) {
      this.protected = true;
      return {
        state: backup.state,
        revision: backup.revision,
        blocked: true,
        backupAvailable: true,
        fromBackup: true,
        notice:
          "The primary campaign is damaged or unsupported. A valid backup is open for review; explicitly restore it before saving.",
      };
    }
    return {
      revision: this.currentRevision,
      blocked: this.protected,
      backupAvailable: false,
      fromBackup: false,
      notice: this.protected
        ? "The saved campaign is damaged or from another version. It is preserved; export this run before explicitly replacing it."
        : undefined,
    };
  }

  private queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writes.then(operation);
    this.writes = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private snapshot(state: CampaignState, revision: number): string {
    const raw = JSON.stringify({
      format: "motherload-campaign",
      version: 1,
      revision,
      savedAt: new Date().toISOString(),
      state,
    } satisfies CampaignCheckpoint);
    decodeCheckpoint(raw);
    return raw;
  }

  private async write(
    state: CampaignState,
    replace: boolean,
    archiveOutgoing = false,
  ): Promise<void> {
    if (this.expected === undefined)
      throw new CampaignSaveError(
        "blocked",
        "Load campaign storage before saving. Export remains available.",
      );
    if (this.protected && !replace)
      throw new CampaignSaveError(
        "blocked",
        "This campaign is protected. Restore its backup or explicitly replace it before saving.",
      );
    const raw = this.snapshot(state, this.currentRevision + 1),
      previous = validCheckpoint(this.expected),
      backup = previous ? this.expected : undefined,
      archive =
        archiveOutgoing && previous && previous.state.id !== state.id
          ? this.expected!
          : undefined;
    try {
      await this.backend.commit(this.expected, raw, backup, archive);
    } catch (error) {
      if (error instanceof CampaignSaveError && error.code === "conflict")
        this.protected = true;
      throw storageFailure(error);
    }
    this.expected = raw;
    this.currentRevision += 1;
    this.protected = false;
    this.channel?.postMessage({
      writer: this.writer,
      revision: this.currentRevision,
    });
  }

  async save(state: CampaignState): Promise<void> {
    const snapshot = decodeCampaign(JSON.stringify(state));
    return this.queue(() => this.write(snapshot, false));
  }

  /** Confirmed replacement archives a different outgoing campaign atomically. */
  async replace(state: CampaignState): Promise<void> {
    const snapshot = decodeCampaign(JSON.stringify(state));
    return this.queue(() => this.write(snapshot, true, true));
  }

  async listArchives(): Promise<CampaignArchive[]> {
    await this.writes;
    try {
      const records = await this.backend.listArchives();
      return records
        .flatMap(({ id, checkpoint }) => {
          const saved = validCheckpoint(checkpoint),
            time = archiveTime(id);
          if (!saved || time === undefined) return [];
          return [
            {
              id,
              archivedAt: new Date(time).toISOString(),
              savedAt: saved.savedAt,
              campaignId: saved.state.id,
              seed: saved.state.seed,
              currentWorld: saved.state.currentWorld,
              credits: saved.state.credits,
              elapsed: saved.state.elapsed,
            },
          ];
        })
        .sort((a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt));
    } catch (error) {
      throw storageFailure(error);
    }
  }

  /** Call only after confirmation; callers must restore into a paused UI. */
  restoreArchive(id: string): Promise<CampaignState> {
    return this.queue(async () => {
      if (archiveTime(id) === undefined)
        throw new CampaignSaveError(
          "invalid",
          "This campaign archive is invalid.",
        );
      let records: CampaignRecords, archives: CampaignArchiveRecord[];
      try {
        [records, archives] = await Promise.all([
          this.backend.read(),
          this.backend.listArchives(),
        ]);
      } catch (error) {
        throw storageFailure(error);
      }
      if (records.current !== this.expected)
        throw new CampaignSaveError(
          "conflict",
          "Another tab changed this campaign. Reload before restoring an archive.",
        );
      const archived = validCheckpoint(
        archives.find((archive) => archive.id === id)?.checkpoint ?? null,
      );
      if (!archived)
        throw new CampaignSaveError(
          "invalid",
          "This archive is unavailable or from an unsupported version. Its saved data was not changed.",
        );
      await this.write(archived.state, true, true);
      return archived.state;
    });
  }

  restoreBackup(): Promise<CampaignState> {
    return this.queue(async () => {
      let records: CampaignRecords;
      try {
        records = await this.backend.read();
      } catch (error) {
        throw storageFailure(error);
      }
      if (records.current !== this.expected)
        throw new CampaignSaveError(
          "conflict",
          "Another tab changed this campaign. Reload before restoring a backup.",
        );
      const backup = validCheckpoint(records.backup);
      if (!backup)
        throw new CampaignSaveError(
          "invalid",
          "There is no valid campaign backup to restore.",
        );
      await this.write(backup.state, true);
      return backup.state;
    });
  }

  export(state: CampaignState): string {
    return this.snapshot(state, this.currentRevision);
  }

  inspectImport(raw: string): CampaignState {
    return decodeCheckpoint(raw).state;
  }

  close() {
    this.channel?.close();
    this.listeners.clear();
    this.backend.close?.();
  }
}
