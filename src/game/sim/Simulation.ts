import type { GameConfig } from '@/game/config/gameConfig';
import type { ArenaMap } from '@/game/world/arenaMap';
import { buildArenaGeometry } from '@/game/world/obstacles';
import { Rng } from './math';
import { updateChaser, updateShooter } from './systems/ai';
import { resolveStatic, sail, separate, shipsTouch } from './systems/physics';
import { updateProjectiles } from './systems/projectiles';
import { Spawner } from './systems/spawner';
import { tickCooldowns, tryFire } from './systems/weapons';
import type { PlayerCommand, Ship, ShipSnapshot, SimEvent, SimSnapshot } from './types';
import { World } from './World';

/**
 * Deterministic, frame-rate independent simulation of one match. `step()` always advances
 * exactly `config.simulation.step` seconds; the caller (GameLoop) decides how many steps a
 * frame needs. Given the same seed, config and command sequence, the outcome is identical.
 */
export class Simulation {
  readonly world: World;
  readonly spawner: Spawner;
  readonly dt: number;

  constructor(config: Readonly<GameConfig>, map: ArenaMap, seed: number) {
    const geometry = buildArenaGeometry(map);
    this.world = new World(config, geometry, new Rng(seed), seed, map.playerStart);
    this.spawner = new Spawner(this.world);
    this.dt = config.simulation.step;
  }

  get running(): boolean {
    return this.world.running;
  }

  step(command: PlayerCommand): void {
    const world = this.world;
    if (!world.running) return;
    const dt = this.dt;
    const { player } = world;

    for (const ship of [player, ...world.enemies]) {
      ship.prevX = ship.x;
      ship.prevY = ship.y;
      ship.prevHeading = ship.heading;
    }
    world.steps += 1;
    world.elapsed = Math.min(world.config.match.duration, world.elapsed + dt);

    // Player
    tickCooldowns(player, dt);
    sail(player, world.config.player, command.thrust, command.turn, dt);
    resolveStatic(world, player);
    if (command.fireFront) tryFire(world, player, 'front', world.config.player.front);
    if (command.fireLeft) tryFire(world, player, 'left', world.config.player.side);
    if (command.fireRight) tryFire(world, player, 'right', world.config.player.side);

    // Enemies
    this.spawner.update(dt);
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      tickCooldowns(enemy, dt);
      if (enemy.kind === 'chaser') updateChaser(world, enemy, dt);
      else updateShooter(world, enemy, dt);
    }
    this.resolveShipContacts();

    updateProjectiles(world, dt);
    world.enemies = world.enemies.filter((e) => e.alive);

    // `end` is a no-op if the player was destroyed earlier in this step.
    if (world.elapsed >= world.config.match.duration) world.end('time_up');
  }

  /** Ship vs ship: chasers ram the player; everything else is pushed apart. */
  private resolveShipContacts(): void {
    const world = this.world;
    const { player, enemies } = world;
    const strength = world.config.ai.separation;

    for (const enemy of enemies) {
      if (!enemy.alive || !world.running) continue;
      if (enemy.kind === 'chaser' && shipsTouch(player, enemy, 2)) {
        const damage = world.config.chaser.contactDamage;
        world.emit({ type: 'chaser_rammed', id: enemy.id, x: enemy.x, y: enemy.y, damage });
        world.selfDestruct(enemy);
        world.damage(player, damage, 'ram');
        continue;
      }
      // Enemies yield to the player so it is never shoved into an island.
      if (separate(player, enemy, 0, 1)) resolveStatic(world, enemy);
    }

    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a?.alive) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (!b?.alive) continue;
        if (separate(a, b, 0.5, strength)) {
          resolveStatic(world, a);
          resolveStatic(world, b);
        }
      }
    }
  }

  drainEvents(): SimEvent[] {
    const events = this.world.events;
    this.world.events = [];
    return events;
  }

  snapshot(): SimSnapshot {
    const w = this.world;
    return {
      status: w.status,
      endReason: w.endReason,
      elapsed: w.elapsed,
      remaining: w.remaining,
      duration: w.config.match.duration,
      spawnInterval: w.config.spawn.interval,
      score: w.score,
      seed: w.seed,
      steps: w.steps,
      spawnCount: this.spawner.count,
      nextSpawnIn: Math.max(0, this.spawner.timer),
      player: shipSnapshot(w.player),
      enemies: w.enemies.filter((e) => e.alive).map(shipSnapshot),
      projectiles: w.projectiles.map((p) => ({
        id: p.id,
        team: p.team,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        traveled: p.traveled,
        damage: p.damage,
      })),
      stats: structuredClone(w.stats),
    };
  }
}

function shipSnapshot(ship: Ship): ShipSnapshot {
  return {
    id: ship.id,
    kind: ship.kind,
    x: ship.x,
    y: ship.y,
    heading: ship.heading,
    speed: ship.speed,
    health: ship.health,
    maxHealth: ship.maxHealth,
    radius: ship.radius,
    cooldowns: { ...ship.cooldowns },
  };
}
