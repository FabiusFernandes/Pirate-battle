import type { ShipStats } from '@/game/config/gameConfig';
import { circlePenetration } from '@/game/world/obstacles';
import { clamp, wrapAngle } from '../math';
import type { Ship } from '../types';
import type { World } from '../World';

/** Minimum impact speed that emits a `ship_bump` event (for audio/visual feedback). */
const BUMP_SPEED = 45;

/** Integrates speed and heading for one step. */
export function sail(ship: Ship, stats: ShipStats, thrust: boolean, turn: number, dt: number, turnRateScale = 1): void {
  ship.heading = wrapAngle(ship.heading + turn * stats.turnRate * turnRateScale * (Math.PI / 180) * dt);
  if (thrust) ship.speed = Math.min(stats.maxSpeed, ship.speed + stats.acceleration * dt);
  else ship.speed = Math.max(0, ship.speed - stats.deceleration * dt);
  ship.x += Math.cos(ship.heading) * ship.speed * dt;
  ship.y += Math.sin(ship.heading) * ship.speed * dt;
}

/** Fraction of top speed lost when sailing straight into a coast (0 = none, 1 = full stop). */
const CONTACT_DRAG = 0.85;

/**
 * Pushes a ship out of every island/rock it overlaps and keeps it inside the arena. The
 * push-out cancels the motion into the obstacle, leaving the tangential part, so ships slide
 * along coastlines. While in contact, speed is capped by how head-on the contact is.
 */
export function resolveStatic(world: World, ship: Ship): void {
  const dirX = Math.cos(ship.heading);
  const dirY = Math.sin(ship.heading);
  const maxSpeed = world.statsFor(ship.kind).maxSpeed;
  let bumped = false;
  let headOnMax = 0;

  // Two passes handle ships wedged between two obstacles.
  for (let pass = 0; pass < 2; pass++) {
    for (const obstacle of world.geometry.obstacles) {
      const hit = circlePenetration(obstacle, ship.x, ship.y, ship.radius);
      if (!hit) continue;
      ship.x += hit.nx * hit.depth;
      ship.y += hit.ny * hit.depth;
      const headOn = -(dirX * hit.nx + dirY * hit.ny);
      if (headOn > 0) {
        if (pass === 0 && ship.speed > BUMP_SPEED && headOn > 0.5) bumped = true;
        headOnMax = Math.max(headOnMax, headOn);
      }
    }
  }

  const { width, height } = world.geometry;
  const x = clamp(ship.x, ship.radius, width - ship.radius);
  const y = clamp(ship.y, ship.radius, height - ship.radius);
  if (x !== ship.x || y !== ship.y) {
    // How directly the ship is sailing into the arena border it crossed.
    if (x !== ship.x) headOnMax = Math.max(headOnMax, Math.sign(ship.x - x) * dirX);
    if (y !== ship.y) headOnMax = Math.max(headOnMax, Math.sign(ship.y - y) * dirY);
    ship.x = x;
    ship.y = y;
  }

  if (headOnMax > 0) ship.speed = Math.min(ship.speed, maxSpeed * (1 - CONTACT_DRAG * headOnMax));

  if (bumped) world.emit({ type: 'ship_bump', shipId: ship.id, x: ship.x, y: ship.y });
}

/**
 * Pushes two overlapping ships apart. `share` is the fraction of the correction applied to
 * `a` (the rest goes to `b`). Returns true when they overlapped.
 */
export function separate(a: Ship, b: Ship, share: number, strength: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return false;
  const dist = Math.sqrt(distSq) || 1e-6;
  const nx = distSq > 0 ? dx / dist : 1;
  const ny = distSq > 0 ? dy / dist : 0;
  const correction = (minDist - dist) * strength;
  a.x -= nx * correction * share;
  a.y -= ny * correction * share;
  b.x += nx * correction * (1 - share);
  b.y += ny * correction * (1 - share);
  return true;
}

export function shipsTouch(a: Ship, b: Ship, slack = 0): boolean {
  const reach = a.radius + b.radius + slack;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy <= reach * reach;
}
