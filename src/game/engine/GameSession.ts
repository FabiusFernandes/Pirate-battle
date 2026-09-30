import type { Container } from 'pixi.js';
import type { GameAssets } from '@/game/assets/GameAssets';
import { audio } from '@/game/audio/AudioManager';
import { MatchAudio } from '@/game/audio/MatchAudio';
import type { GameConfig } from '@/game/config/gameConfig';
import { InputState } from '@/game/input/InputState';
import { attachKeyboard } from '@/game/input/keyboard';
import { WorldRenderer } from '@/game/render/WorldRenderer';
import { Simulation } from '@/game/sim/Simulation';
import type { EndReason, SimEvent } from '@/game/sim/types';
import { ARENA_MAP } from '@/game/world/arenaMap';
import { Store, shallowEqual } from '@/lib/store';
import { FixedStepLoop } from './FixedStepLoop';

export type SessionStatus = 'running' | 'paused' | 'ended';
export type PauseReason = 'manual' | 'blur' | 'hidden' | 'orientation';

/** Coarse, UI-facing view of the match. Only changes a few times per second at most. */
export interface HudState {
  status: SessionStatus;
  pauseReason: PauseReason | null;
  health: number;
  maxHealth: number;
  score: number;
  /** Whole seconds left (rounded up), so the HUD re-renders at most once per second for time. */
  remaining: number;
  endReason: EndReason | null;
}

export interface MatchResult {
  matchId: string;
  seed: number;
  score: number;
  /** Effective (active) play time in seconds. */
  duration: number;
  reason: EndReason;
  sessionTime: number;
  spawnInterval: number;
  endedAt: string;
}

export interface GameSessionOptions {
  config: Readonly<GameConfig>;
  seed: number;
  matchId: string;
  onEnd?: (result: MatchResult) => void;
  /** Frame events for feedback layers (effects, audio). */
  onEvents?: (events: readonly SimEvent[]) => void;
}

/**
 * One match: owns the simulation, the input state and the pause/end lifecycle, and publishes
 * a throttled HUD snapshot for React. It is renderer-agnostic until `attachRenderer` is
 * called by the GameHost, and can be advanced either by the real frame clock (`frame`) or
 * by an external manual clock (`advanceBy`, used by tests).
 */
export class GameSession {
  readonly matchId: string;
  readonly config: Readonly<GameConfig>;
  readonly simulation: Simulation;
  readonly input = new InputState();
  readonly hud: Store<HudState>;
  /** Set once, when the match ends. */
  readonly result = new Store<MatchResult | null>(null);

  private readonly loop: FixedStepLoop;
  private readonly options: GameSessionOptions;
  private renderer: WorldRenderer | null = null;
  private readonly matchAudio: MatchAudio;
  private status: SessionStatus = 'running';
  private pauseReason: PauseReason | null = null;
  private finalResult: MatchResult | null = null;
  private readonly cleanups: (() => void)[] = [];
  /** Called after the state changed outside of a frame (manual clock, pause) so the host redraws. */
  requestRender: () => void = () => undefined;

  constructor(options: GameSessionOptions) {
    this.options = options;
    this.matchId = options.matchId;
    this.config = options.config;
    this.simulation = new Simulation(options.config, ARENA_MAP, options.seed);
    this.loop = new FixedStepLoop(options.config.simulation.step, options.config.simulation.maxFrameDelta);
    this.hud = new Store<HudState>(this.computeHud(), shallowEqual);
    this.matchAudio = new MatchAudio(this.hud);
  }

  get currentStatus(): SessionStatus {
    return this.status;
  }

  get currentPauseReason(): PauseReason | null {
    return this.pauseReason;
  }

  get matchResult(): MatchResult | null {
    return this.finalResult;
  }

  /**
   * Starts listening to keyboard, focus and visibility. Called by the host once the arena is
   * visible. `start`/`detach` may be repeated (React Strict Mode re-runs effects).
   */
  start(): void {
    if (this.cleanups.length > 0) return;
    this.cleanups.push(
      attachKeyboard(this.input, {
        isActive: () => this.status === 'running',
        onPauseKey: () => {
          this.pause('manual');
        },
        onMuteKey: () => {
          audio.toggleMuted();
        },
      }),
    );
    this.matchAudio.start();
    this.cleanups.push(() => {
      this.matchAudio.stop();
    });
    const onBlur = (): void => {
      this.pause('blur');
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.pause('hidden');
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  /**
   * @param parent container receiving the entity layers
   * @param camera container moved by screen shake (usually arena + entities)
   */
  attachRenderer(assets: GameAssets, parent: Container, camera: Container | null = null): void {
    this.renderer?.destroy();
    this.renderer = new WorldRenderer(assets, this.config, this.simulation.world.seed, camera);
    parent.addChild(this.renderer.view);
    this.renderer.sync(this.simulation.world, 1, 0);
  }

  /** Display objects currently owned by the renderer (profiling / leak checks). */
  get renderables(): number {
    return this.renderer?.displayObjectCount ?? 0;
  }

  /**
   * Real-time frame: advances the fixed-step loop by the elapsed frame time. Effects keep
   * animating after the match ends (final explosion) but freeze while paused.
   */
  frame(deltaSeconds: number): void {
    if (this.status === 'running') {
      this.loop.advance(deltaSeconds, this.stepOnce);
      this.afterSteps();
    }
    const effectsDt = this.status === 'paused' ? 0 : Math.min(deltaSeconds, 0.1);
    this.renderer?.sync(this.simulation.world, this.status === 'running' ? this.loop.alpha : 1, effectsDt);
    this.matchAudio.update(this.simulation.world);
  }

  /**
   * Manual clock: advances exactly `seconds` of simulation time (whole steps) through the
   * same loop and input path as real time, without the frame-delta clamp.
   */
  advanceBy(seconds: number): void {
    const steps = Math.round(seconds / this.loop.step);
    if (this.status === 'paused') {
      this.requestRender();
      return;
    }
    // Step and animate effects in fixed slices so effects look the same as in real time.
    for (let i = 0; i < steps; i++) {
      if (this.status === 'running') {
        this.stepOnce();
        this.afterSteps();
      }
      this.renderer?.sync(this.simulation.world, 1, this.loop.step);
    }
    if (steps === 0) this.renderer?.sync(this.simulation.world, 1, 0);
    this.requestRender();
  }

  pause(reason: PauseReason): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.pauseReason = reason;
    this.input.setEnabled(false);
    this.loop.reset();
    this.publishHud();
    this.requestRender();
  }

  /** Resuming always requires an explicit player action (button / key in the pause dialog). */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.pauseReason = null;
    this.input.clear();
    this.input.setEnabled(true);
    this.loop.reset();
    this.publishHud();
  }

  /** Destroys the display objects created by `attachRenderer` (called by the host before it tears down the stage). */
  detachRenderer(): void {
    this.renderer?.destroy();
    this.renderer = null;
    this.requestRender = () => undefined;
  }

  /** Releases listeners and display objects. The simulation state itself is plain data. */
  detach(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.input.clear();
    this.detachRenderer();
  }

  private readonly stepOnce = (): void => {
    this.simulation.step(this.input.command());
  };

  private afterSteps(): void {
    const events = this.simulation.drainEvents();
    if (events.length > 0) {
      const world = this.simulation.world;
      this.renderer?.handleEvents(events, world);
      this.matchAudio.handleEvents(events, world);
      this.options.onEvents?.(events);
    }
    for (const event of events) {
      if (event.type === 'match_ended') this.finish(event.reason);
    }
    this.publishHud();
  }

  private finish(reason: EndReason): void {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.pauseReason = null;
    this.input.setEnabled(false);
    const world = this.simulation.world;
    this.finalResult = {
      matchId: this.matchId,
      seed: world.seed,
      score: world.score,
      duration: Math.round(world.elapsed * 100) / 100,
      reason,
      sessionTime: this.config.match.duration,
      spawnInterval: this.config.spawn.interval,
      endedAt: new Date().toISOString(),
    };
    this.result.set(this.finalResult);
    this.options.onEnd?.(this.finalResult);
  }

  private computeHud(): HudState {
    const world = this.simulation.world;
    return {
      status: this.status,
      pauseReason: this.pauseReason,
      health: Math.ceil(world.player.health),
      maxHealth: world.player.maxHealth,
      score: world.score,
      remaining: Math.ceil(world.remaining - 1e-6),
      endReason: world.endReason,
    };
  }

  private publishHud(): void {
    this.hud.set(this.computeHud());
  }
}
