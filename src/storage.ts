import { decodeSave, SAVE_KEY, type State } from "./model";

export const SAVE_BACKUP_KEY = `${SAVE_KEY}.backup`;
export const SAVE_RECOVERY_KEY = `${SAVE_KEY}.recovery`;
export const MAX_SAVE_BYTES = 256 * 1024;
const LOCK_NAME = `${SAVE_KEY}.write`;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type SaveErrorCode = "conflict" | "blocked" | "storage" | "invalid";
export class SaveError extends Error {
  constructor(
    public readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SaveError";
  }
}

export interface SaveLoadResult {
  state?: State;
  notice?: string;
  blocked: boolean;
  fromBackup: boolean;
  backupAvailable: boolean;
}

type ExclusiveWrite = (operation: () => void) => Promise<void>;

function browserExclusiveWrite(operation: () => void): Promise<void> {
  // Web Locks serialize this app's writes across tabs on HTTPS/localhost.
  // The raw-value check still protects against already-observed changes on
  // browsers without Web Locks (for example an insecure LAN preview).
  if (typeof window !== "undefined" && navigator.locks)
    return navigator.locks.request(LOCK_NAME, async () => operation());
  return Promise.resolve().then(operation);
}

/** Local expedition storage, independent of the game renderer and UI. */
export class SaveStore {
  private expectedRaw: string | null | undefined;
  private blocked = true;
  private generation = 0;

  constructor(
    private readonly storage: StorageLike,
    private readonly exclusiveWrite: ExclusiveWrite = browserExclusiveWrite,
  ) {}

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      throw new SaveError(
        "storage",
        "Device storage is unavailable. Export your expedition to keep a copy.",
      );
    }
  }

  private valid(raw: string | null): State | undefined {
    if (raw === null) return undefined;
    try {
      return this.inspectImport(raw);
    } catch {
      return undefined;
    }
  }

  private async withWrite(operation: () => void): Promise<void> {
    try {
      await this.exclusiveWrite(operation);
    } catch (error) {
      if (error instanceof SaveError) throw error;
      throw new SaveError(
        "storage",
        "Device storage could not be accessed safely. Export this expedition to keep your progress.",
      );
    }
  }

  private backup(current: string | null): {
    raw: string | null;
    state?: State;
    fromRecovery: boolean;
  } {
    const raw = this.read(SAVE_BACKUP_KEY),
      state = this.valid(raw),
      recovery = this.read(SAVE_RECOVERY_KEY);
    // An interrupted backup rotation may leave the restored expedition in
    // both normal slots. Its preceding primary is then safe in this journal.
    // Match the intended primary so an old journal cannot replace a newer run.
    try {
      if (recovery && recovery.length <= MAX_SAVE_BYTES * 3) {
        const journal = JSON.parse(recovery);
        if (
          journal?.version === 1 &&
          typeof journal.primary === "string" &&
          typeof journal.backup === "string" &&
          journal.primary === current &&
          (!state || JSON.stringify(state) === current)
        ) {
          const previous = this.valid(journal.backup);
          if (previous)
            return {
              raw: journal.backup,
              state: previous,
              fromRecovery: true,
            };
        }
      }
    } catch {
      // A damaged journal never prevents loading a valid normal save/backup.
    }
    return { raw, state, fromRecovery: false };
  }

  private clearRecovery() {
    try {
      if (this.storage.getItem(SAVE_RECOVERY_KEY) === null) return;
      if (this.storage.removeItem) this.storage.removeItem(SAVE_RECOVERY_KEY);
      else this.storage.setItem(SAVE_RECOVERY_KEY, "");
    } catch {
      // Matching rules ignore an obsolete journal even if cleanup is denied.
    }
  }

  load(): SaveLoadResult {
    // A Load/New/Import must not be overwritten by an older queued autosave.
    this.generation++;
    try {
      const raw = this.read(SAVE_KEY);
      const backup = this.backup(raw).state;
      const state = this.valid(raw);
      this.expectedRaw = raw;
      this.blocked = raw !== null && !state;
      if (state) {
        return {
          state,
          blocked: false,
          fromBackup: false,
          backupAvailable: Boolean(backup),
          notice:
            JSON.parse(raw!).version !== state.version
              ? "Previous expedition upgraded. Its original save will be backed up before saving."
              : undefined,
        };
      }
      if (backup) {
        this.blocked = true;
        return {
          state: backup,
          blocked: true,
          fromBackup: true,
          backupAvailable: true,
          notice:
            "A valid backup is loaded for review. Restore backup to resume saving; the current save is kept intact.",
        };
      }
      return {
        blocked: this.blocked,
        fromBackup: false,
        backupAvailable: false,
        notice: this.blocked
          ? "The saved expedition is damaged or unsupported. Saving is paused to keep it intact. Import a valid save or confirm a new expedition."
          : undefined,
      };
    } catch (error) {
      this.blocked = true;
      this.expectedRaw = undefined;
      return {
        blocked: true,
        fromBackup: false,
        backupAvailable: false,
        notice:
          error instanceof Error
            ? error.message
            : "Device storage unavailable.",
      };
    }
  }

  hasExternalChange(): boolean {
    return this.expectedRaw !== this.read(SAVE_KEY);
  }

  inspectImport(raw: string): State {
    if (
      typeof raw !== "string" ||
      raw.length > MAX_SAVE_BYTES ||
      new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES
    )
      throw new SaveError("invalid", "Save files must be at most 256 KiB.");
    try {
      return decodeSave(raw);
    } catch {
      throw new SaveError(
        "invalid",
        "This is not a supported, valid Motherload expedition. Your current save has not changed.",
      );
    }
  }

  export(state: State): string {
    return JSON.stringify(this.inspectImport(JSON.stringify(state)), null, 2);
  }

  async save(state: State): Promise<void> {
    const generation = this.generation;
    const raw = JSON.stringify(this.inspectImport(JSON.stringify(state)));
    return this.withWrite(() => {
      if (generation !== this.generation) return;
      if (this.blocked || this.expectedRaw === undefined)
        throw new SaveError(
          "blocked",
          "Saving is paused to protect the existing expedition. Load, restore a backup, or confirm a replacement first.",
        );
      const current = this.read(SAVE_KEY);
      if (current !== this.expectedRaw)
        throw new SaveError(
          "conflict",
          "Another tab saved this expedition. Load its save or export your current run before continuing.",
        );
      this.commit(raw, current);
    });
  }

  /** Call only after the user confirms a new expedition or validated import. */
  async replace(state: State): Promise<void> {
    const raw = JSON.stringify(this.inspectImport(JSON.stringify(state)));
    this.generation++;
    return this.withWrite(() => this.commit(raw, this.read(SAVE_KEY)));
  }

  /** Explicitly restore the validated backup, preserving the current valid save. */
  async restoreBackup(): Promise<State> {
    this.generation++;
    let restored: State | undefined;
    await this.withWrite(() => {
      const current = this.read(SAVE_KEY),
        backup = this.backup(current),
        backupRaw = backup.raw;
      if (backupRaw === null)
        throw new SaveError("invalid", "No backup expedition is available.");
      restored = this.inspectImport(backupRaw);
      const raw = JSON.stringify(restored);
      if (!this.valid(current) || raw === current) {
        this.commit(raw, current);
        return;
      }
      // Persist the current expedition before replacing either normal copy.
      // When restoring from the journal, first put that target back in the
      // normal backup so overwriting the journal cannot lose our only copy.
      if (backup.fromRecovery) this.storage.setItem(SAVE_BACKUP_KEY, backupRaw);
      this.storage.setItem(
        SAVE_RECOVERY_KEY,
        JSON.stringify({ version: 1, primary: raw, backup: current }),
      );
      this.storage.setItem(SAVE_KEY, raw);
      // If rotation fails after the primary commit, restoration succeeded and
      // backup() will still find the previous expedition in the journal.
      try {
        this.storage.setItem(SAVE_BACKUP_KEY, current!);
        this.clearRecovery();
      } catch {
        // Leave the journal intact for this instance and future page loads.
      }
      this.expectedRaw = raw;
      this.blocked = false;
    });
    return restored!;
  }

  private commit(raw: string, current: string | null): void {
    try {
      if (raw !== current) {
        // Each localStorage write is atomic. If backup creation fails, do not
        // touch the primary. If the primary write fails, both valid copies of
        // the preceding expedition remain usable.
        const validCurrent = current !== null && this.valid(current);
        if (validCurrent) this.storage.setItem(SAVE_BACKUP_KEY, current);
        this.storage.setItem(SAVE_KEY, raw);
        if (validCurrent) this.clearRecovery();
      }
    } catch {
      throw new SaveError(
        "storage",
        "The expedition could not be saved. The previous save is intact; export this run to keep your progress.",
      );
    }
    this.expectedRaw = raw;
    this.blocked = false;
  }
}
