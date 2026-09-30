import type { PlayerCommand } from '@/game/sim/types';

export type GameAction = 'forward' | 'turnLeft' | 'turnRight' | 'fireFront' | 'fireLeft' | 'fireRight';

export const GAME_ACTIONS: readonly GameAction[] = ['forward', 'turnLeft', 'turnRight', 'fireFront', 'fireLeft', 'fireRight'];

/**
 * Device-independent input state. Keyboard keys and touch pointers register themselves as
 * "sources" holding an action, so releasing one finger never cancels a key still held for
 * the same action. The simulation samples it once per fixed step via `command()`.
 */
export class InputState {
  private readonly held = new Map<GameAction, Set<string>>();
  private enabled = true;

  press(action: GameAction, source: string): void {
    if (!this.enabled) return;
    let sources = this.held.get(action);
    if (!sources) {
      sources = new Set();
      this.held.set(action, sources);
    }
    sources.add(source);
  }

  release(action: GameAction, source: string): void {
    this.held.get(action)?.delete(source);
  }

  /** Releases everything held by one source (e.g. a touch pointer that was cancelled). */
  releaseSource(source: string): void {
    for (const sources of this.held.values()) sources.delete(source);
  }

  isHeld(action: GameAction): boolean {
    return (this.held.get(action)?.size ?? 0) > 0;
  }

  /** Drops all held input. Used on pause/resume so nothing carries over from the pause. */
  clear(): void {
    this.held.clear();
  }

  /** While disabled (paused / ended), presses are ignored. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  command(): PlayerCommand {
    const left = this.isHeld('turnLeft');
    const right = this.isHeld('turnRight');
    return {
      thrust: this.isHeld('forward'),
      turn: left === right ? 0 : left ? -1 : 1,
      fireFront: this.isHeld('fireFront'),
      fireLeft: this.isHeld('fireLeft'),
      fireRight: this.isHeld('fireRight'),
    };
  }
}
