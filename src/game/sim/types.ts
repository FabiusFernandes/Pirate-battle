import type { EnemyKind } from '@/game/config/gameConfig';

export type ShipKind = 'player' | EnemyKind;
export type WeaponSlot = 'front' | 'left' | 'right';
export type Team = 'player' | 'enemy';

export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  readonly team: Team;
  readonly radius: number;
  readonly maxHealth: number;
  x: number;
  y: number;
  /** Radians, 0 = east, clockwise positive (screen coordinates, y down). */
  heading: number;
  /** Scalar speed along the heading (ships only sail forward). */
  speed: number;
  health: number;
  alive: boolean;
  /** Remaining cooldown per weapon slot, in seconds of simulation time. */
  cooldowns: Record<WeaponSlot, number>;
  /** Preferred side (+1 / -1) when steering around obstacles; gives AI hysteresis. */
  avoidSide: 1 | -1;
  /** Previous-step pose, used by the renderer to interpolate between fixed steps. */
  prevX: number;
  prevY: number;
  prevHeading: number;
}

export interface Projectile {
  readonly id: number;
  readonly team: Team;
  readonly ownerId: number;
  readonly damage: number;
  readonly radius: number;
  readonly range: number;
  readonly lifetime: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  traveled: number;
  age: number;
  alive: boolean;
}

export type MatchStatus = 'running' | 'ended';
export type EndReason = 'time_up' | 'destroyed';

/** Intent sampled from input once per simulation step. */
export interface PlayerCommand {
  thrust: boolean;
  /** -1 = counter-clockwise (left), 1 = clockwise (right). */
  turn: -1 | 0 | 1;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const IDLE_COMMAND: PlayerCommand = { thrust: false, turn: 0, fireFront: false, fireLeft: false, fireRight: false };

/** Discrete things that happened during a step; consumed by rendering, audio and the HUD. */
export type SimEvent =
  | { type: 'shot'; team: Team; slot: WeaponSlot; shipId: number; x: number; y: number; angle: number }
  | { type: 'hit'; team: Team; targetId: number; x: number; y: number; damage: number }
  | { type: 'splash'; x: number; y: number; cause: 'obstacle' | 'expired' | 'bounds' }
  | { type: 'enemy_spawned'; id: number; kind: EnemyKind; x: number; y: number }
  | { type: 'enemy_destroyed'; id: number; kind: EnemyKind; x: number; y: number; heading: number; scored: boolean }
  | { type: 'chaser_rammed'; id: number; x: number; y: number; damage: number }
  | { type: 'player_damaged'; amount: number; health: number }
  | { type: 'ship_bump'; shipId: number; x: number; y: number }
  | { type: 'score'; score: number }
  | { type: 'match_ended'; reason: EndReason; score: number; elapsed: number };

export interface ShipSnapshot {
  id: number;
  kind: ShipKind;
  x: number;
  y: number;
  heading: number;
  speed: number;
  health: number;
  maxHealth: number;
  radius: number;
  cooldowns: Record<WeaponSlot, number>;
}

export interface ProjectileSnapshot {
  id: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  damage: number;
}

export interface MatchStats {
  playerShots: Record<WeaponSlot, number>;
  enemyShots: number;
  projectilesFired: number;
  hitsOnEnemies: number;
  hitsOnPlayer: number;
  enemiesSpawned: number;
  enemiesSunk: number;
  chasersRammed: number;
}

/** Plain, serialisable view of the whole simulation (test instrumentation, debugging). */
export interface SimSnapshot {
  status: MatchStatus;
  endReason: EndReason | null;
  elapsed: number;
  remaining: number;
  duration: number;
  spawnInterval: number;
  score: number;
  seed: number;
  steps: number;
  spawnCount: number;
  nextSpawnIn: number;
  player: ShipSnapshot;
  enemies: ShipSnapshot[];
  projectiles: ProjectileSnapshot[];
  stats: MatchStats;
}
