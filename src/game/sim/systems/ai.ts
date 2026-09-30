import { segmentBlocked } from '@/game/world/obstacles';
import { DEG_TO_RAD, angleDelta, clamp } from '../math';
import type { Ship } from '../types';
import type { World } from '../World';
import { resolveStatic, sail } from './physics';
import { tryFire } from './weapons';

/**
 * Picks a heading close to `desired` whose path ahead is free of islands. Candidates fan out
 * alternately to both sides, starting with the side chosen last time (hysteresis avoids
 * jittering left/right in front of a coastline).
 */
function clearHeading(world: World, ship: Ship, desired: number): number {
  const { avoidanceProbe, avoidanceStep } = world.config.ai;
  const step = avoidanceStep * DEG_TO_RAD;
  const probeRadius = ship.radius * 0.85;
  const from = { x: ship.x, y: ship.y };
  const maxK = Math.ceil(Math.PI / step);

  for (let k = 0; k <= maxK; k++) {
    for (const side of k === 0 ? [0] : [ship.avoidSide, -ship.avoidSide]) {
      const candidate = desired + side * k * step;
      const to = {
        x: ship.x + Math.cos(candidate) * avoidanceProbe,
        y: ship.y + Math.sin(candidate) * avoidanceProbe,
      };
      if (!segmentBlocked(world.geometry, from, to, probeRadius)) {
        if (side !== 0) ship.avoidSide = side > 0 ? 1 : -1;
        return candidate;
      }
    }
  }
  return desired;
}

/** Turns towards `target` (limited by turn rate) and returns the remaining turn input. */
function turnInput(ship: Ship, target: number, turnRate: number, dt: number): number {
  const delta = angleDelta(ship.heading, target);
  const maxTurn = turnRate * DEG_TO_RAD * dt;
  return maxTurn > 0 ? clamp(delta / maxTurn, -1, 1) : 0;
}

/** Chaser: sails straight at the player, steering around islands. Ramming is resolved in Simulation. */
export function updateChaser(world: World, ship: Ship, dt: number): void {
  const stats = world.config.chaser;
  const player = world.player;
  const toPlayer = Math.atan2(player.y - ship.y, player.x - ship.x);
  const heading = clearHeading(world, ship, toPlayer);
  sail(ship, stats, true, turnInput(ship, heading, stats.turnRate, dt), dt);
  resolveStatic(world, ship);
}

/**
 * Shooter: approaches until it reaches its preferred range, then holds position and keeps
 * its bow on the player. Fires when the player is within range, inside its firing arc and
 * not hidden behind an island.
 */
export function updateShooter(world: World, ship: Ship, dt: number): void {
  const stats = world.config.shooter;
  const player = world.player;
  const dx = player.x - ship.x;
  const dy = player.y - ship.y;
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);

  const approach = distance > stats.preferredRange;
  const heading = approach ? clearHeading(world, ship, toPlayer) : toPlayer;
  sail(ship, stats, approach, turnInput(ship, heading, stats.turnRate, dt), dt);
  resolveStatic(world, ship);

  if (distance > stats.attackRange) return;
  if (Math.abs(angleDelta(ship.heading, toPlayer)) > (stats.fireArc * DEG_TO_RAD) / 2) return;
  if (ship.cooldowns.front > 0) return;
  const muzzle = {
    x: ship.x + Math.cos(ship.heading) * stats.weapon.muzzleOffset,
    y: ship.y + Math.sin(ship.heading) * stats.weapon.muzzleOffset,
  };
  if (segmentBlocked(world.geometry, muzzle, player, stats.weapon.projectileRadius)) return;
  tryFire(world, ship, 'front', stats.weapon);
}
