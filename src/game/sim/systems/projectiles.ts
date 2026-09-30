import { circleHitsAnyObstacle } from '@/game/world/obstacles';
import { segmentPointDistanceSq } from '../math';
import type { Projectile, Ship } from '../types';
import type { World } from '../World';

/**
 * Moves projectiles and resolves their outcome. Each projectile ends in exactly one way —
 * hitting a ship (damage applied once), hitting an obstacle, leaving the arena or expiring —
 * and is then removed. Ship hits use a swept segment test so nothing tunnels through.
 */
export function updateProjectiles(world: World, dt: number): void {
  const { width, height } = world.geometry;

  for (const p of world.projectiles) {
    if (!p.alive) continue;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.age += dt;
    p.traveled += p.speed * dt;

    const target = firstShipHit(world, p);
    if (target) {
      p.alive = false;
      world.emit({ type: 'hit', team: p.team, targetId: target.id, x: p.x, y: p.y, damage: p.damage });
      world.damage(target, p.damage, p.team === 'player' ? 'player_projectile' : 'enemy_projectile');
      continue;
    }

    if (circleHitsAnyObstacle(world.geometry, p.x, p.y, p.radius)) {
      p.alive = false;
      world.emit({ type: 'splash', x: p.x, y: p.y, cause: 'obstacle' });
      continue;
    }

    if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) {
      p.alive = false;
      world.emit({ type: 'splash', x: p.x, y: p.y, cause: 'bounds' });
      continue;
    }

    if (p.traveled >= p.range || p.age >= p.lifetime) {
      p.alive = false;
      world.emit({ type: 'splash', x: p.x, y: p.y, cause: 'expired' });
    }
  }

  world.projectiles = world.projectiles.filter((p) => p.alive);
}

function firstShipHit(world: World, p: Projectile): Ship | null {
  if (!world.running) return null;
  const candidates: readonly Ship[] = p.team === 'player' ? world.enemies : [world.player];
  let best: Ship | null = null;
  let bestDist = Infinity;
  for (const ship of candidates) {
    if (!ship.alive) continue;
    const reach = ship.radius + p.radius;
    if (segmentPointDistanceSq(p.prevX, p.prevY, p.x, p.y, ship.x, ship.y) > reach * reach) continue;
    // Prefer the ship closest to where the projectile started this step.
    const d = (ship.x - p.prevX) ** 2 + (ship.y - p.prevY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = ship;
    }
  }
  return best;
}
