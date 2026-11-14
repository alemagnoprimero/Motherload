/**
 * T2: the interval between rendered frames, and its p95 over the last 10 s
 * for the F1 readout. F1's p95 is the CPU cost from Phaser's pre-step to its
 * post-render; a GPU-bound shader shows up as longer intervals instead (the
 * browser holds frames back while the GPU catches up), so the terrain tier
 * (tier.ts) and the phone readings use the interval.
 */
export class FrameIntervals {
  private samples: { at: number; interval: number }[] = [];
  private last: number | undefined;
  /** A frame was rendered; returns the interval since the one before. */
  tick(now = performance.now()) {
    const interval = this.last === undefined ? undefined : now - this.last;
    if (interval !== undefined) {
      this.samples.push({ at: now, interval });
      while (this.samples.length && this.samples[0]!.at <= now - 10000)
        this.samples.shift();
    }
    this.last = now;
    return interval;
  }
  p95() {
    if (!this.samples.length) return undefined;
    const ordered = this.samples.map((s) => s.interval).sort((a, b) => a - b);
    return ordered[
      Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))
    ];
  }
}
