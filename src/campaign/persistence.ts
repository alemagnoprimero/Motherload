import { decodeCampaign } from "./model";
import type { CampaignCheckpoint, CampaignState } from "./types";

export const CAMPAIGN_DATABASE = "motherload.campaign.v1";
/** Bounded transport limit; later slices must measure their entity/export size. */
export const MAX_CAMPAIGN_BYTES = 16 * 1024 * 1024;

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

/** One compare-and-swap transaction changes the current and optional backup. */
export interface CampaignBackend {
  read(): Promise<CampaignRecords>;
  commit(
    expected: string | null,
    current: string,
    backup?: string | null,
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

/** IndexedDB current/backup rotation is atomic, including quota/abort failure. */
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
  ): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("checkpoints", "readwrite");
      const store = transaction.objectStore("checkpoints");
      let failure: unknown;
      const previous = store.get("current");
      previous.onsuccess = () => {
        if ((previous.result ?? null) !== expected) {
          failure = new CampaignSaveError(
            "conflict",
            "Another tab changed this campaign. Load its checkpoint before continuing, or export this tab first.",
          );
          transaction.abort();
          return;
        }
        if (backup !== undefined) {
          if (backup === null) store.delete("backup");
          else store.put(backup, "backup");
        }
        store.put(current, "current");
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(failure ?? transaction.error);
      transaction.onabort = () => reject(failure ?? transaction.error);
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

  private async write(state: CampaignState, replace: boolean): Promise<void> {
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
      backup = validCheckpoint(this.expected) ? this.expected : undefined;
    try {
      await this.backend.commit(this.expected, raw, backup);
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

  /** Call only after the player confirms replacing the loaded campaign. */
  async replace(state: CampaignState): Promise<void> {
    const snapshot = decodeCampaign(JSON.stringify(state));
    return this.queue(() => this.write(snapshot, true));
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
