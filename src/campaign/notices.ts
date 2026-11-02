export type NoticePriority = 0 | 1 | 2 | 3;
export interface Notice {
  id: string;
  text: string;
  priority: NoticePriority;
  at: number;
  until: number;
  remaining?: number;
}
/** Separate critical and transient lanes prevent hazards being hidden by fuel alerts. */
export class NoticeQueue {
  private queue: Notice[] = [];
  private active?: Notice;
  private conditions = new Map<string, string>();
  readonly recent: Notice[] = [];
  setCondition(id: string, text?: string) {
    if (text) this.conditions.set(id, text);
    else this.conditions.delete(id);
  }
  get critical() {
    return [...this.conditions.values()].join(" · ");
  }
  push(
    text: string,
    priority: NoticePriority = 3,
    now = performance.now(),
    id = text,
  ) {
    if (
      !text ||
      this.active?.id === id ||
      this.queue.some((notice) => notice.id === id)
    )
      return;
    const duration = priority === 1 ? 2000 : priority === 2 ? 2500 : 3500;
    const notice = { id, text, priority, at: now, until: now + duration };
    this.queue.push(notice);
    this.recent.unshift({ ...notice });
    this.recent.splice(20);
    this.queue.sort((a, b) => a.priority - b.priority || a.at - b.at);
  }
  current(now = performance.now()) {
    this.queue = this.queue.filter(
      (notice) => notice.priority < 3 || now - notice.at <= 5000,
    );
    const urgent = this.queue[0];
    if (
      this.active &&
      now < this.active.until &&
      (!urgent || urgent.priority >= this.active.priority)
    )
      return this.active;
    if (urgent) {
      if (this.active && now < this.active.until && this.active.priority < 3) {
        this.active.remaining = this.active.until - now;
        this.queue.push(this.active);
        this.queue.sort((a, b) => a.priority - b.priority || a.at - b.at);
      }
      this.active = this.queue.shift();
      this.active!.until =
        now +
        (this.active!.remaining ??
          (this.active!.priority === 1
            ? 2000
            : this.active!.priority === 2
              ? 2500
              : 3500));
      delete this.active!.remaining;
      return this.active;
    }
    if (this.active && now >= this.active.until) this.active = undefined;
    return this.active;
  }
  clear() {
    this.queue = [];
    this.active = undefined;
    this.conditions.clear();
  }
}
