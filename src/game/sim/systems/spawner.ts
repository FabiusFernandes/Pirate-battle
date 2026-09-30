import type { EnemyKind } from '@/game/config/gameConfig';
import { circleHitsAnyObstacle } from '@/game/world/obstacles';
import type { Vec2 } from '../math';
import type { World } from '../World';

/**
 * Spawns enemies on a fixed interval of active play time. Spawn points are sampled (with
 * the match's seeded RNG) in a band along the arena border and must be clear of islands,
 * other ships, and far enough from the player to never deal unavoidable damage on arrival.
 */
export class Spawner {
  /** Seconds until the next spawn attempt. */
  timer: number;
  /** Enemies spawned so far this match. */
  count = 0;

  constructor(private readonly world: World) {
    this.timer = world.config.spawn.initialDelay;
  }

  update(dt: number): void {
    if (!this.world.running) return;
    this.timer -= dt;
    if (this.timer > 0) return;

    const cfg = this.world.config.spawn;
    const alive = this.world.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
    if (alive >= cfg.maxAlive) {
      // Arena is full: skip this slot and wait for the next interval.
      this.timer += cfg.interval;
      return;
    }

    const kind = cfg.openingSequence[this.count] ?? this.world.rng.pickWeighted(cfg.weights);
    const point = this.findSpawnPoint(kind);
    if (!point) {
      this.timer = cfg.retryDelay;
      return;
    }
    this.spawn(kind, point);
    this.timer += cfg.interval;
    // Never let a long frame queue up several spawns at once.
    if (this.timer <= 0) this.timer = cfg.interval;
  }

  spawn(kind: EnemyKind, point: Vec2, heading?: number): void {
    const world = this.world;
    const stats = world.config[kind];
    const facing = heading ?? Math.atan2(world.player.y - point.y, world.player.x - point.x);
    const ship = world.createShip(kind, stats, point.x, point.y, facing);
    world.enemies.push(ship);
    this.count += 1;
    world.stats.enemiesSpawned += 1;
    world.emit({ type: 'enemy_spawned', id: ship.id, kind, x: ship.x, y: ship.y });
  }

  findSpawnPoint(kind: EnemyKind): Vec2 | null {
    const world = this.world;
    const cfg = world.config.spawn;
    const radius = world.config[kind].radius;
    const { width, height } = world.geometry;
    const inset = radius + 4;
    const band = Math.max(inset, cfg.edgeBand);
    const minPlayerDistSq = cfg.minDistanceFromPlayer ** 2;
    const perimeter = 2 * (width + height);

    for (let attempt = 0; attempt < cfg.attempts; attempt++) {
      // Pick a position along the perimeter, then a depth into the arena.
      const along = world.rng.next() * perimeter;
      const depth = inset + world.rng.next() * (band - inset);
      let x: number;
      let y: number;
      if (along < width) {
        x = along;
        y = depth;
      } else if (along < width + height) {
        x = width - depth;
        y = along - width;
      } else if (along < 2 * width + height) {
        x = along - width - height;
        y = height - depth;
      } else {
        x = depth;
        y = along - 2 * width - height;
      }
      x = Math.min(width - inset, Math.max(inset, x));
      y = Math.min(height - inset, Math.max(inset, y));

      if ((x - world.player.x) ** 2 + (y - world.player.y) ** 2 < minPlayerDistSq) continue;
      if (circleHitsAnyObstacle(world.geometry, x, y, radius + cfg.clearance)) continue;
      const overlapsShip = world.enemies.some(
        (e) => e.alive && (e.x - x) ** 2 + (e.y - y) ** 2 < (e.radius + radius + cfg.clearance) ** 2,
      );
      if (overlapsShip) continue;
      return { x, y };
    }
    return null;
  }
}
