import type { EnemyKind, GameConfig, ShipStats } from '@/game/config/gameConfig';
import type { ArenaGeometry } from '@/game/world/obstacles';
import { DEG_TO_RAD, type Rng } from './math';
import type { EndReason, MatchStats, MatchStatus, Projectile, Ship, ShipKind, SimEvent } from './types';

/**
 * Mutable state of one match plus the match rules (damage, scoring, ending). Systems
 * receive the world and mutate it; nothing here knows about rendering, input or React.
 */
export class World {
  readonly config: Readonly<GameConfig>;
  readonly geometry: ArenaGeometry;
  readonly rng: Rng;
  readonly seed: number;

  status: MatchStatus = 'running';
  endReason: EndReason | null = null;
  /** Active play time in seconds (never advances while paused or after the end). */
  elapsed = 0;
  steps = 0;
  score = 0;
  player: Ship;
  enemies: Ship[] = [];
  projectiles: Projectile[] = [];
  /** Running totals (tests, profiling, debugging). */
  readonly stats: MatchStats = {
    playerShots: { front: 0, left: 0, right: 0 },
    enemyShots: 0,
    projectilesFired: 0,
    hitsOnEnemies: 0,
    hitsOnPlayer: 0,
    enemiesSpawned: 0,
    enemiesSunk: 0,
    chasersRammed: 0,
  };
  /** Events produced since the last `drainEvents()`. */
  events: SimEvent[] = [];

  private idCounter = 0;

  constructor(config: Readonly<GameConfig>, geometry: ArenaGeometry, rng: Rng, seed: number, playerStart: { x: number; y: number; heading: number }) {
    this.config = config;
    this.geometry = geometry;
    this.rng = rng;
    this.seed = seed;
    this.player = this.createShip('player', config.player, playerStart.x, playerStart.y, playerStart.heading * DEG_TO_RAD);
  }

  get running(): boolean {
    return this.status === 'running';
  }

  get remaining(): number {
    return Math.max(0, this.config.match.duration - this.elapsed);
  }

  nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  createShip(kind: ShipKind, stats: ShipStats, x: number, y: number, heading: number): Ship {
    return {
      id: this.nextId(),
      kind,
      team: kind === 'player' ? 'player' : 'enemy',
      radius: stats.radius,
      maxHealth: stats.maxHealth,
      x,
      y,
      heading,
      speed: 0,
      health: stats.maxHealth,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
      avoidSide: 1,
      prevX: x,
      prevY: y,
      prevHeading: heading,
    };
  }

  statsFor(kind: ShipKind): ShipStats {
    return kind === 'player' ? this.config.player : this.config[kind];
  }

  emit(event: SimEvent): void {
    this.events.push(event);
  }

  /**
   * Applies damage to a ship. Returns true when the ship was destroyed by this call.
   * Only enemies destroyed by the player's projectiles score.
   */
  damage(target: Ship, amount: number, source: 'player_projectile' | 'enemy_projectile' | 'ram'): boolean {
    if (!this.running || !target.alive || amount <= 0) return false;
    target.health = Math.max(0, target.health - amount);

    if (target.team === 'player') {
      if (source !== 'ram') this.stats.hitsOnPlayer += 1;
      this.emit({ type: 'player_damaged', amount, health: target.health });
      if (target.health <= 0) {
        target.alive = false;
        this.end('destroyed');
        return true;
      }
      return false;
    }

    this.stats.hitsOnEnemies += 1;
    if (target.health > 0) return false;
    target.alive = false;
    this.stats.enemiesSunk += 1;
    const scored = source === 'player_projectile';
    this.emit({
      type: 'enemy_destroyed',
      id: target.id,
      kind: target.kind as EnemyKind,
      x: target.x,
      y: target.y,
      heading: target.heading,
      scored,
    });
    if (scored) {
      this.score += 1;
      this.emit({ type: 'score', score: this.score });
    }
    return true;
  }

  /** Destroys a chaser that rammed the player. Never scores. */
  selfDestruct(chaser: Ship): void {
    if (!chaser.alive) return;
    chaser.alive = false;
    chaser.health = 0;
    this.stats.chasersRammed += 1;
    this.emit({
      type: 'enemy_destroyed',
      id: chaser.id,
      kind: chaser.kind as EnemyKind,
      x: chaser.x,
      y: chaser.y,
      heading: chaser.heading,
      scored: false,
    });
  }

  end(reason: EndReason): void {
    if (!this.running) return;
    this.status = 'ended';
    this.endReason = reason;
    this.emit({ type: 'match_ended', reason, score: this.score, elapsed: this.elapsed });
  }
}
