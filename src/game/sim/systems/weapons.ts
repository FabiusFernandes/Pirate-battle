import type { WeaponConfig } from '@/game/config/gameConfig';
import type { Ship, WeaponSlot } from '../types';
import type { World } from '../World';

const HALF_PI = Math.PI / 2;

export function tickCooldowns(ship: Ship, dt: number): void {
  const c = ship.cooldowns;
  c.front = Math.max(0, c.front - dt);
  c.left = Math.max(0, c.left - dt);
  c.right = Math.max(0, c.right - dt);
}

/** Direction of a weapon slot relative to the ship's heading (y-down: left = heading − 90°). */
export function slotAngle(ship: Ship, slot: WeaponSlot): number {
  if (slot === 'left') return ship.heading - HALF_PI;
  if (slot === 'right') return ship.heading + HALF_PI;
  return ship.heading;
}

/**
 * Fires a weapon if its cooldown allows. Multi-projectile weapons (broadsides) fire parallel
 * shots spread along the ship's length. Returns true when a shot was fired.
 */
export function tryFire(world: World, ship: Ship, slot: WeaponSlot, weapon: WeaponConfig): boolean {
  if (!world.running || !ship.alive || ship.cooldowns[slot] > 0) return false;
  ship.cooldowns[slot] = weapon.cooldown;

  const angle = slotAngle(ship, slot);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const alongX = Math.cos(ship.heading);
  const alongY = Math.sin(ship.heading);

  for (let i = 0; i < weapon.count; i++) {
    const offset = (i - (weapon.count - 1) / 2) * weapon.spacing;
    const x = ship.x + dirX * weapon.muzzleOffset + alongX * offset;
    const y = ship.y + dirY * weapon.muzzleOffset + alongY * offset;
    world.projectiles.push({
      id: world.nextId(),
      team: ship.team,
      ownerId: ship.id,
      damage: weapon.damage,
      radius: weapon.projectileRadius,
      range: weapon.range,
      lifetime: weapon.lifetime,
      speed: weapon.projectileSpeed,
      vx: dirX * weapon.projectileSpeed,
      vy: dirY * weapon.projectileSpeed,
      x,
      y,
      prevX: x,
      prevY: y,
      traveled: 0,
      age: 0,
      alive: true,
    });
  }

  world.stats.projectilesFired += weapon.count;
  if (ship.team === 'player') world.stats.playerShots[slot] += 1;
  else world.stats.enemyShots += 1;
  world.emit({
    type: 'shot',
    team: ship.team,
    slot,
    shipId: ship.id,
    x: ship.x + dirX * weapon.muzzleOffset,
    y: ship.y + dirY * weapon.muzzleOffset,
    angle,
  });
  return true;
}
