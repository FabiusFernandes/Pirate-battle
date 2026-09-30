import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameAssets } from '@/game/assets/GameAssets';
import type { GameConfig } from '@/game/config/gameConfig';
import { lerp, lerpAngle } from '@/game/sim/math';
import type { Ship, ShipKind, SimEvent } from '@/game/sim/types';
import type { World } from '@/game/sim/World';
import { EffectsLayer } from './EffectsLayer';
import { HealthBar, createHealthBarTextures, destroyHealthBarTextures, type HealthBarTextures } from './HealthBar';
import { createProceduralTextures, destroyProceduralTextures, type ProceduralTextures } from './proceduralTextures';

/** Hull sprites per ship kind, from healthy to wrecked (the art has four damage stages). */
const SHIP_SKINS: Record<ShipKind, readonly [string, string, string, string]> = {
  player: ['ship_5', 'ship_11', 'ship_17', 'ship_23'],
  chaser: ['ship_2', 'ship_8', 'ship_14', 'ship_20'],
  shooter: ['ship_3', 'ship_9', 'ship_15', 'ship_21'],
};

/** Ship art points its bow down (+y); simulation heading 0 points east (+x). */
const SPRITE_ROTATION_OFFSET = -Math.PI / 2;

/** Fire spots on the hull (texture pixels relative to the hull centre), lit by damage stage. */
const FIRE_SPOTS: readonly { x: number; y: number }[] = [
  { x: -11, y: -20 },
  { x: 13, y: 14 },
];

const SPAWN_FADE = 0.35;
const HIT_FLASH = 0.12;
const SMOKE_INTERVAL = 0.14;

export function damageStage(health: number, maxHealth: number): 0 | 1 | 2 | 3 {
  if (health <= 0) return 3;
  const f = health / maxHealth;
  if (f > 2 / 3) return 0;
  if (f > 1 / 3) return 1;
  return 2;
}

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface EffectTextures {
  explosion: readonly Texture[];
  fire: readonly Texture[];
  wood: readonly Texture[];
  procedural: ProceduralTextures;
}

class ShipView {
  readonly view = new Container();
  private readonly hull: Sprite;
  private readonly hullHolder = new Container();
  private readonly fires: Sprite[];
  private readonly bar: HealthBar;
  private stage = -1;
  private age = 0;
  private flash = 0;
  private smokeClock = 0;
  private readonly phase: number;

  constructor(
    private readonly textures: readonly Texture[],
    ship: Ship,
    private readonly displayScale: number,
    barTextures: HealthBarTextures,
    fireTextures: readonly Texture[],
  ) {
    this.phase = (ship.id * 1.7) % (Math.PI * 2);
    this.hull = new Sprite(textures[0]);
    this.hull.anchor.set(0.5);
    this.hullHolder.scale.set(displayScale);
    this.hullHolder.addChild(this.hull);
    this.fires = FIRE_SPOTS.map((spot, i) => {
      const fire = new Sprite(fireTextures[i % fireTextures.length]);
      fire.anchor.set(0.5, 0.85);
      fire.position.set(spot.x, spot.y);
      fire.visible = false;
      this.hullHolder.addChild(fire);
      return fire;
    });
    this.bar = new HealthBar(barTextures, ship.kind === 'player' ? 72 : 60);
    this.bar.view.y = -ship.radius - 24;
    this.view.addChild(this.hullHolder, this.bar.view);
    this.view.alpha = 0;
  }

  hit(): void {
    this.flash = HIT_FLASH;
  }

  update(ship: Ship, alpha: number, dt: number, smoke: (x: number, y: number) => void): void {
    this.age += dt;
    this.view.alpha = Math.min(1, this.age / SPAWN_FADE);
    this.view.position.set(lerp(ship.prevX, ship.x, alpha), lerp(ship.prevY, ship.y, alpha));
    const rotation = lerpAngle(ship.prevHeading, ship.heading, alpha) + SPRITE_ROTATION_OFFSET;
    this.hullHolder.rotation = rotation;

    const stage = damageStage(ship.health, ship.maxHealth);
    if (stage !== this.stage) {
      this.stage = stage;
      this.hull.texture = this.textures[stage] ?? this.hull.texture;
      this.fires.forEach((fire, i) => (fire.visible = stage >= i + 1));
    }

    // Flickering fires; heavily damaged ships also trail smoke.
    const t = this.age * 14 + this.phase;
    this.fires.forEach((fire, i) => {
      if (!fire.visible) return;
      fire.scale.set(0.8 + 0.12 * Math.sin(t + i * 2.1), 0.85 + 0.2 * Math.sin(t * 1.3 + i));
    });
    if (this.stage >= 2 && dt > 0) {
      this.smokeClock += dt;
      if (this.smokeClock >= SMOKE_INTERVAL) {
        this.smokeClock = 0;
        const spot = FIRE_SPOTS[0];
        if (spot) {
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          const sx = spot.x * this.displayScale;
          const sy = spot.y * this.displayScale;
          smoke(this.view.x + sx * cos - sy * sin, this.view.y + sx * sin + sy * cos);
        }
      }
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      this.hull.tint = this.flash > 0 ? 0xff9a8a : 0xffffff;
    }
    this.bar.set(ship.health / ship.maxHealth);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

interface ProjectileView {
  ball: Sprite;
  trail: Sprite;
}

/**
 * Draws the dynamic part of the world from the simulation state and turns simulation events
 * into visual feedback. It only reads the world. Display objects are created lazily per
 * entity id and released when the entity disappears; projectile and particle sprites are
 * pooled. Layers, bottom to top: floating debris/wrecks, projectiles, ships, explosions.
 */
export class WorldRenderer {
  readonly view = new Container({ label: 'entities' });
  private readonly under: EffectsLayer;
  private readonly over: EffectsLayer;
  private readonly shipLayer = new Container({ label: 'ships' });
  private readonly projectileLayer = new Container({ label: 'projectiles' });
  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly projectilePool: ProjectileView[] = [];
  private readonly skins: Record<ShipKind, Texture[]>;
  private readonly barTextures: HealthBarTextures;
  private readonly fx: EffectTextures;
  private readonly ballTexture: Texture;
  private readonly reducedMotion = prefersReducedMotion();
  private shakeTime = 0;
  private shakeStrength = 0;

  constructor(
    assets: GameAssets,
    private readonly config: Readonly<GameConfig>,
    seed: number,
    /** Container moved by the screen-shake effect (arena + entities). */
    private readonly camera: Container | null = null,
  ) {
    this.skins = {
      player: SHIP_SKINS.player.map((n) => assets.texture('ships', n)),
      chaser: SHIP_SKINS.chaser.map((n) => assets.texture('ships', n)),
      shooter: SHIP_SKINS.shooter.map((n) => assets.texture('ships', n)),
    };
    this.barTextures = createHealthBarTextures(assets);
    this.ballTexture = assets.texture('ships', 'cannon_ball');
    this.fx = {
      explosion: ['explosion_3', 'explosion_2', 'explosion_1'].map((n) => assets.texture('ships', n)),
      fire: ['fire_1', 'fire_2'].map((n) => assets.texture('ships', n)),
      wood: ['wood_1', 'wood_2', 'wood_3', 'wood_4'].map((n) => assets.texture('ships', n)),
      procedural: createProceduralTextures(),
    };
    this.under = new EffectsLayer('effects-under', seed);
    this.over = new EffectsLayer('effects-over', seed + 1);
    this.view.addChild(this.under.view, this.projectileLayer, this.shipLayer, this.over.view);
  }

  get displayObjectCount(): number {
    return this.ships.size + this.projectiles.size + this.under.count + this.over.count;
  }

  /** Converts one frame's simulation events into effects. */
  handleEvents(events: readonly SimEvent[], world: World): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.muzzleFlash(e.x, e.y, e.angle, e.team === 'player' && e.slot !== 'front' ? this.config.player.side : null);
          break;
        case 'hit':
          this.impact(e.x, e.y);
          this.ships.get(e.targetId)?.hit();
          break;
        case 'splash':
          if (e.cause !== 'bounds') this.splash(e.x, e.y, e.cause === 'obstacle' ? 0.35 : 0.5);
          break;
        case 'enemy_spawned':
          this.ring(this.under, e.x, e.y, 0.5, 1.5, 0.8, 0.6);
          break;
        case 'enemy_destroyed':
          this.explode(e.x, e.y, e.kind, e.heading);
          if (e.scored) this.over.floatingText('+1', e.x, e.y - 34);
          break;
        case 'chaser_rammed':
          this.shake(9);
          break;
        case 'player_damaged':
          this.shake(e.health <= 0 ? 12 : 5);
          if (e.health <= 0) this.explode(world.player.x, world.player.y, 'player', world.player.heading);
          break;
        case 'ship_bump':
          this.ring(this.under, e.x, e.y, 0.3, 0.8, 0.6, 0.45);
          break;
        case 'score':
        case 'match_ended':
          break;
      }
    }
  }

  /**
   * Mirrors the world into display objects. `alpha` interpolates between fixed steps; `dt`
   * is the effect clock (0 while paused).
   */
  sync(world: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    const smoke = (x: number, y: number): void => {
      this.puff(x, y, 0x4a4a4a, 0.25, 0.8, 0.9);
    };
    const ships = world.player.alive ? [world.player, ...world.enemies] : world.enemies;
    for (const ship of ships) {
      if (!ship.alive) continue;
      seen.add(ship.id);
      let view = this.ships.get(ship.id);
      if (!view) {
        const scale = ship.kind === 'player' ? this.config.player.displayScale : this.config[ship.kind].displayScale;
        view = new ShipView(this.skins[ship.kind], ship, scale, this.barTextures, this.fx.fire);
        this.ships.set(ship.id, view);
        this.shipLayer.addChild(view.view);
      }
      view.update(ship, alpha, dt, smoke);
    }
    for (const [id, view] of this.ships) {
      if (!seen.has(id)) {
        view.destroy();
        this.ships.delete(id);
      }
    }

    seen.clear();
    for (const p of world.projectiles) {
      if (!p.alive) continue;
      seen.add(p.id);
      let view = this.projectiles.get(p.id);
      if (!view) {
        view = this.projectilePool.pop() ?? this.createProjectileView();
        view.ball.visible = true;
        view.trail.visible = true;
        view.ball.tint = p.team === 'player' ? 0xffffff : 0xffc2b0;
        this.projectiles.set(p.id, view);
      }
      const x = lerp(p.prevX, p.x, alpha);
      const y = lerp(p.prevY, p.y, alpha);
      view.ball.position.set(x, y);
      view.trail.position.set(x, y);
      view.trail.rotation = Math.atan2(p.vy, p.vx);
      view.trail.width = Math.min(46, p.traveled + 4);
      view.trail.height = 5;
    }
    for (const [id, view] of this.projectiles) {
      if (!seen.has(id)) {
        view.ball.visible = false;
        view.trail.visible = false;
        this.projectilePool.push(view);
        this.projectiles.delete(id);
      }
    }

    this.under.update(dt);
    this.over.update(dt);
    this.updateShake(dt);
  }

  private createProjectileView(): ProjectileView {
    const trail = new Sprite(this.fx.procedural.trail);
    trail.anchor.set(1, 0.5);
    trail.alpha = 0.55;
    const ball = new Sprite(this.ballTexture);
    ball.anchor.set(0.5);
    this.projectileLayer.addChild(trail, ball);
    return { ball, trail };
  }

  private muzzleFlash(x: number, y: number, angle: number, broadside: GameConfig['player']['side'] | null): void {
    const offsets: number[] = [];
    if (broadside) {
      for (let i = 0; i < broadside.count; i++) offsets.push((i - (broadside.count - 1) / 2) * broadside.spacing);
    } else {
      offsets.push(0);
    }
    // Broadsides fire perpendicular to the hull: spread the flashes along the hull.
    const alongX = Math.cos(angle + Math.PI / 2);
    const alongY = Math.sin(angle + Math.PI / 2);
    for (const offset of offsets) {
      const fx = x + alongX * offset;
      const fy = y + alongY * offset;
      this.over.spawn({
        texture: this.fx.explosion[0] ?? this.ballTexture,
        x: fx,
        y: fy,
        life: 0.14,
        scale: [0.36, 0.56],
        alpha: [1, 0.2],
        rotation: this.over.rng.range(0, Math.PI * 2),
      });
      this.puff(fx + Math.cos(angle) * 6, fy + Math.sin(angle) * 6, 0xe8e2d6, 0.2, 0.55, 0.5, Math.cos(angle) * 40, Math.sin(angle) * 40);
    }
  }

  private impact(x: number, y: number): void {
    this.over.spawn({
      texture: this.fx.explosion[0] ?? this.ballTexture,
      frames: this.fx.explosion.slice(0, 2),
      frameSpan: 0.6,
      x,
      y,
      life: 0.32,
      scale: [0.4, 0.7],
      alpha: [1, 0],
    });
    this.debris(x, y, 3, 80);
  }

  private splash(x: number, y: number, size: number): void {
    this.ring(this.under, x, y, size * 0.3, size, 0.85, 0.5);
    this.puff(x, y, 0xffffff, 0.12, 0.35, 0.35);
  }

  private explode(x: number, y: number, kind: ShipKind, heading: number): void {
    const scale = kind === 'player' ? this.config.player.displayScale : this.config[kind].displayScale;
    const wreck = this.skins[kind][3];
    if (wreck) {
      // The wreck floats, drifts and sinks (fades) under the explosion.
      this.under.spawn({
        texture: wreck,
        x,
        y,
        life: 2.8,
        rotation: heading + SPRITE_ROTATION_OFFSET,
        spin: this.under.rng.range(-0.25, 0.25),
        vx: this.under.rng.range(-8, 8),
        vy: this.under.rng.range(-8, 8),
        scale: [scale, scale * 0.82],
        alpha: [1, 0],
      });
    }
    this.ring(this.under, x, y, 0.4, 1.8, 0.7, 1.1);
    this.debris(x, y, 7, 150);
    this.over.spawn({
      texture: this.fx.explosion[0] ?? this.ballTexture,
      frames: this.fx.explosion,
      frameSpan: 0.55,
      x,
      y,
      life: 0.85,
      scale: [0.8, 1.6],
      alpha: [1, 0],
      rotation: this.over.rng.range(0, Math.PI * 2),
    });
    for (let i = 0; i < 4; i++) {
      this.puff(x + this.over.rng.range(-14, 14), y + this.over.rng.range(-14, 14), 0x3d3d3d, 0.4, 1.3, 1.2);
    }
  }

  private debris(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = this.under.rng.range(0, Math.PI * 2);
      const v = this.under.rng.range(speed * 0.4, speed);
      this.under.spawn({
        texture: this.fx.wood[i % this.fx.wood.length] ?? this.ballTexture,
        x,
        y,
        life: this.under.rng.range(0.8, 1.4),
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        drag: 0.08,
        rotation: angle,
        spin: this.under.rng.range(-4, 4),
        scale: [0.7, 0.55],
        alpha: [1, 0],
      });
    }
  }

  private ring(layer: EffectsLayer, x: number, y: number, from: number, to: number, alpha: number, life: number): void {
    layer.spawn({ texture: this.fx.procedural.ring, x, y, life, scale: [from, to], alpha: [alpha, 0] });
  }

  private puff(x: number, y: number, tint: number, from: number, to: number, life: number, vx = 0, vy = -18): void {
    this.over.spawn({ texture: this.fx.procedural.puff, x, y, life, vx, vy, drag: 0.3, tint, scale: [from, to], alpha: [0.55, 0] });
  }

  private shake(strength: number): void {
    if (this.reducedMotion || !this.camera) return;
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTime = 0.28;
  }

  private updateShake(dt: number): void {
    if (!this.camera || this.shakeTime <= 0 || dt <= 0) return;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) {
      this.shakeStrength = 0;
      this.camera.position.set(0, 0);
      return;
    }
    const s = this.shakeStrength * (this.shakeTime / 0.28);
    this.camera.position.set(this.over.rng.range(-s, s), this.over.rng.range(-s, s));
  }

  destroy(): void {
    for (const view of this.ships.values()) view.destroy();
    this.ships.clear();
    this.projectiles.clear();
    this.projectilePool.length = 0;
    this.camera?.position.set(0, 0);
    this.under.destroy();
    this.over.destroy();
    this.view.destroy({ children: true });
    destroyHealthBarTextures(this.barTextures);
    destroyProceduralTextures(this.fx.procedural);
  }
}
