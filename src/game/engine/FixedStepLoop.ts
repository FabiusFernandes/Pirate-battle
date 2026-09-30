/**
 * Converts variable frame deltas into a whole number of fixed simulation steps. Leftover
 * time is kept for the next frame and exposed as `alpha` so rendering can interpolate
 * between the last two steps. Large deltas are clamped (tab switches, debugger pauses).
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    readonly step: number,
    private readonly maxFrameDelta: number,
  ) {}

  /** Runs `stepFn` as many times as `frameSeconds` allows. Returns the number of steps run. */
  advance(frameSeconds: number, stepFn: () => void): number {
    this.accumulator += Math.min(Math.max(0, frameSeconds), this.maxFrameDelta);
    let steps = 0;
    // Epsilon guards against float drift (e.g. 1/60 accumulated 60 times ≠ 1).
    while (this.accumulator + 1e-9 >= this.step) {
      this.accumulator -= this.step;
      stepFn();
      steps += 1;
    }
    return steps;
  }

  /** Interpolation factor between the previous and current step, in [0, 1). */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.accumulator / this.step));
  }

  /** Forgets leftover time; used when resuming so no paused time leaks into the simulation. */
  reset(): void {
    this.accumulator = 0;
  }
}
