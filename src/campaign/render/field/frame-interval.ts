/**
 * T2 spike: the p95 of the interval between rendered frames over the last
 * 10 s, for the F1 readout. F1's p95 is the CPU cost from Phaser's pre-step
 * to its post-render; a GPU-bound shader shows up as longer intervals
 * instead (the browser holds frames back while the GPU catches up), so the
 * phone test reads both.
 */
export class FrameIntervals {
  private samples: { at: number; interval: number }[] = [];
  private last: number | undefined;
  tick(now = performance.now()) {
    if (this.last !== undefined) {
      this.samples.push({ at: now, interval: now - this.last });
      while (this.samples.length && this.samples[0]!.at <= now - 10000)
        this.samples.shift();
    }
    this.last = now;
  }
  p95() {
    if (!this.samples.length) return undefined;
    const ordered = this.samples.map((s) => s.interval).sort((a, b) => a - b);
    return ordered[
      Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))
    ];
  }
}
