import type { HudState } from '@/game/engine/GameSession';
import type { SimEvent } from '@/game/sim/types';
import type { World } from '@/game/sim/World';
import type { ReadableStore } from '@/lib/store';
import { audio, type LoopHandle } from './AudioManager';

const FIRE = ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'] as const;
const WATER = ['cannonball_water_hit_1', 'cannonball_water_hit_2'] as const;
const WOOD = ['ship_wood_hit_1', 'ship_wood_hit_2'] as const;
const EXPLOSION = ['ship_explosion_1', 'ship_explosion_2'] as const;

/**
 * Maps one match's simulation events and HUD changes to sound. Ambient loops follow the
 * match lifecycle: the sea plays throughout, the sailing loop follows the player's speed,
 * and both duck while paused.
 */
export class MatchAudio {
  private ocean: LoopHandle | null = null;
  private sailing: LoopHandle | null = null;
  private lastBump = -Infinity;
  private previous: HudState;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly hud: ReadableStore<HudState>) {
    this.previous = hud.getSnapshot();
  }

  start(): void {
    if (this.unsubscribe) return;
    audio.play('game_start', { volume: 0.6 });
    this.ocean = audio.loop('ocean_ambience_loop', 0.35);
    this.sailing = audio.loop('ship_sailing_loop', 0);
    this.unsubscribe = this.hud.subscribe(() => {
      this.onHud(this.hud.getSnapshot());
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ocean?.stop();
    this.sailing?.stop();
    this.ocean = null;
    this.sailing = null;
  }

  /** Per-frame hook: keeps the sailing loop in sync with the player's speed. */
  update(world: World): void {
    const speed = world.player.alive && world.running ? world.player.speed / world.config.player.maxSpeed : 0;
    this.sailing?.setVolume(0.45 * speed, 0.25);
  }

  handleEvents(events: readonly SimEvent[], world: World): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.team === 'player') {
            if (e.slot === 'front') audio.playAny(FIRE, { volume: 0.55 });
            else audio.play('cannon_broadside', { volume: 0.7, rate: 0.96 + Math.random() * 0.08 });
          } else {
            audio.playAny(FIRE, { volume: 0.3, rate: 0.85 });
          }
          break;
        case 'hit':
          audio.playAny(WOOD, { volume: e.team === 'enemy' ? 0.8 : 0.5 });
          break;
        case 'splash':
          if (e.cause !== 'bounds') audio.playAny(WATER, { volume: 0.25 });
          break;
        case 'enemy_destroyed':
          audio.playAny(EXPLOSION, { volume: 0.7 });
          audio.play('ship_sinking', { volume: 0.25 });
          break;
        case 'chaser_rammed':
          audio.play('ship_collision', { volume: 0.8 });
          break;
        case 'ship_bump':
          if (e.shipId === world.player.id && world.elapsed - this.lastBump > 0.6) {
            this.lastBump = world.elapsed;
            audio.play('ship_collision', { volume: 0.35 });
          }
          break;
        case 'score':
          audio.play('score_point', { volume: 0.5 });
          break;
        case 'match_ended':
          audio.play(e.reason === 'time_up' ? 'game_complete' : 'game_over', { volume: 0.8 });
          break;
        case 'player_damaged':
        case 'enemy_spawned':
          break;
      }
    }
  }

  private onHud(hud: HudState): void {
    const prev = this.previous;
    this.previous = hud;
    if (hud.status === 'paused' && prev.status !== 'paused') {
      audio.play('game_pause', { volume: 0.6 });
      this.ocean?.setVolume(0.12, 0.3);
      this.sailing?.setVolume(0, 0.1);
    } else if (hud.status === 'running' && prev.status === 'paused') {
      audio.play('game_resume', { volume: 0.6 });
      this.ocean?.setVolume(0.35, 0.3);
    } else if (hud.status === 'ended' && prev.status !== 'ended') {
      this.sailing?.setVolume(0, 0.2);
      this.ocean?.setVolume(0.18, 1);
    }

    const lowNow = hud.health > 0 && hud.health <= hud.maxHealth * 0.3;
    const lowBefore = prev.health > 0 && prev.health <= prev.maxHealth * 0.3;
    if (lowNow && !lowBefore) audio.play('health_low', { volume: 0.7 });

    if (hud.status === 'running' && hud.remaining !== prev.remaining && (hud.remaining === 10 || (hud.remaining <= 5 && hud.remaining > 0))) {
      audio.play('time_warning', { volume: 0.55 });
    }
  }
}
