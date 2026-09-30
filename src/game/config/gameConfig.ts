/**
 * Every gameplay parameter lives here. Systems read values from the match's config snapshot
 * and never hard-code balancing numbers, so tuning never requires touching game logic.
 *
 * Units: distances in world units (1 unit = 1 px of the 1x tile sheet, arena = 1600 × 896),
 * durations in seconds, angles in degrees (converted once when the match starts).
 */

export interface WeaponConfig {
  /** Damage applied by each projectile, once. */
  damage: number;
  /** Projectile speed in units per second. */
  projectileSpeed: number;
  /** Maximum travel distance before the projectile expires. */
  range: number;
  /** Maximum projectile lifetime (whichever of range / lifetime is reached first). */
  lifetime: number;
  /** Minimum time between two shots of this weapon. */
  cooldown: number;
  /** Projectile collision radius. */
  projectileRadius: number;
  /** Projectiles per shot (fired in parallel lines). */
  count: number;
  /** Distance between parallel projectiles along the ship's length. */
  spacing: number;
  /** Distance from the ship's centre where projectiles appear. */
  muzzleOffset: number;
}

export interface ShipStats {
  maxHealth: number;
  /** Collision circle radius. */
  radius: number;
  /** Sprite scale applied by the renderer (does not affect rules). */
  displayScale: number;
  /** Top speed in units per second. */
  maxSpeed: number;
  /** Units per second² while accelerating. */
  acceleration: number;
  /** Units per second² while coasting (no thrust). */
  deceleration: number;
  /** Degrees per second. */
  turnRate: number;
}

export interface ChaserConfig extends ShipStats {
  /** Damage dealt to the player when a chaser rams it (the chaser explodes). */
  contactDamage: number;
}

export interface ShooterConfig extends ShipStats {
  /** Distance at which the shooter is allowed to fire. */
  attackRange: number;
  /** Distance the shooter tries to keep from the player. */
  preferredRange: number;
  /** The shooter fires only when the player is within ± half this arc of its bow. */
  fireArc: number;
  weapon: WeaponConfig;
}

export type EnemyKind = 'chaser' | 'shooter';

export interface SpawnConfig {
  /** Time between spawns. Exposed in Options (see SPAWN_INTERVAL_LIMITS). */
  interval: number;
  /** Delay before the first spawn. */
  initialDelay: number;
  /** Spawns are skipped while this many enemies are alive. */
  maxAlive: number;
  /** Relative spawn probability per enemy kind. */
  weights: Record<EnemyKind, number>;
  /** Kinds forced for the first spawns so both types always show up in a standard match. */
  openingSequence: readonly EnemyKind[];
  /** Minimum distance between a spawn point and the player. */
  minDistanceFromPlayer: number;
  /** Extra clearance around obstacles and other ships at the spawn point. */
  clearance: number;
  /** Spawn points are picked within this distance of the arena border. */
  edgeBand: number;
  /** Random candidates evaluated per spawn attempt. */
  attempts: number;
  /** When no valid point is found, try again after this delay. */
  retryDelay: number;
}

export interface GameConfig {
  match: {
    /** Match length in seconds of active play. Exposed in Options (see SESSION_TIME_LIMITS). */
    duration: number;
  };
  simulation: {
    /** Fixed simulation step (seconds). */
    step: number;
    /** Longest frame delta processed at once; protects against huge catch-up bursts. */
    maxFrameDelta: number;
  };
  player: ShipStats & {
    front: WeaponConfig;
    side: WeaponConfig;
  };
  chaser: ChaserConfig;
  shooter: ShooterConfig;
  spawn: SpawnConfig;
  ai: {
    /** Look-ahead distance used to steer around islands. */
    avoidanceProbe: number;
    /** Angular step (degrees) between candidate headings when avoiding obstacles. */
    avoidanceStep: number;
    /** How strongly ships push each other apart when overlapping (0..1 per step). */
    separation: number;
  };
}

/** Options exposed to the player, with their documented limits. */
export const SESSION_TIME_LIMITS = { min: 60, max: 180, step: 10, default: 120 } as const;
export const SPAWN_INTERVAL_LIMITS = { min: 1, max: 10, step: 0.5, default: 3 } as const;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  match: { duration: SESSION_TIME_LIMITS.default },
  simulation: { step: 1 / 60, maxFrameDelta: 0.25 },
  player: {
    maxHealth: 100,
    radius: 30,
    displayScale: 0.86,
    maxSpeed: 170,
    acceleration: 240,
    deceleration: 160,
    turnRate: 150,
    front: {
      damage: 34,
      projectileSpeed: 560,
      range: 560,
      lifetime: 1.4,
      cooldown: 0.4,
      projectileRadius: 5,
      count: 1,
      spacing: 0,
      muzzleOffset: 50,
    },
    side: {
      damage: 25,
      projectileSpeed: 460,
      range: 380,
      lifetime: 1.2,
      cooldown: 1.2,
      projectileRadius: 5,
      count: 3,
      spacing: 24,
      muzzleOffset: 28,
    },
  },
  chaser: {
    maxHealth: 50,
    radius: 27,
    displayScale: 0.78,
    maxSpeed: 125,
    acceleration: 180,
    deceleration: 160,
    turnRate: 110,
    contactDamage: 20,
  },
  shooter: {
    maxHealth: 75,
    radius: 29,
    displayScale: 0.84,
    maxSpeed: 90,
    acceleration: 140,
    deceleration: 160,
    turnRate: 90,
    attackRange: 400,
    preferredRange: 300,
    fireArc: 24,
    weapon: {
      damage: 10,
      projectileSpeed: 360,
      range: 440,
      lifetime: 1.6,
      cooldown: 1.8,
      projectileRadius: 5,
      count: 1,
      spacing: 0,
      muzzleOffset: 48,
    },
  },
  spawn: {
    interval: SPAWN_INTERVAL_LIMITS.default,
    initialDelay: 1.5,
    maxAlive: 8,
    weights: { chaser: 0.55, shooter: 0.45 },
    openingSequence: ['chaser', 'shooter'],
    minDistanceFromPlayer: 480,
    clearance: 16,
    edgeBand: 140,
    attempts: 40,
    retryDelay: 0.5,
  },
  ai: {
    avoidanceProbe: 130,
    avoidanceStep: 20,
    separation: 0.5,
  },
};

/** Player-facing options persisted locally (Options screen). */
export interface PlayerOptions {
  sessionTime: number;
  spawnInterval: number;
}

export const DEFAULT_PLAYER_OPTIONS: PlayerOptions = {
  sessionTime: SESSION_TIME_LIMITS.default,
  spawnInterval: SPAWN_INTERVAL_LIMITS.default,
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return structuredClone(base);
  const out = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : structuredClone(value);
  }
  return out as T;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Builds the immutable config snapshot used by one match: defaults, then player options,
 * then optional overrides (test scenarios / balancing experiments). Later changes to the
 * options never affect a match already in progress.
 */
export function createMatchConfig(options: PlayerOptions, overrides?: DeepPartial<GameConfig>): Readonly<GameConfig> {
  const withOptions = deepMerge(DEFAULT_GAME_CONFIG, {
    match: { duration: options.sessionTime },
    spawn: { interval: options.spawnInterval },
  });
  return deepFreeze(deepMerge(withOptions, overrides));
}
