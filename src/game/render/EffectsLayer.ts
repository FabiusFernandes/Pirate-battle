import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { Rng } from '@/game/sim/math';

/** A short-lived sprite animated by simple kinematics and linear scale/alpha curves. */
interface Particle {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  /** Velocity multiplier per second (1 = no drag). */
  drag: number;
  spin: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  /** Optional frame sequence played over `frameSpan` of the lifetime. */
  frames: readonly Texture[] | null;
  frameSpan: number;
}

export interface ParticleOptions {
  texture: Texture;
  x: number;
  y: number;
  life: number;
  vx?: number;
  vy?: number;
  drag?: number;
  rotation?: number;
  spin?: number;
  scale?: [number, number];
  alpha?: [number, number];
  tint?: number;
  anchorX?: number;
  anchorY?: number;
  frames?: readonly Texture[];
  frameSpan?: number;
}

interface FloatingText {
  text: Text;
  age: number;
  life: number;
  startY: number;
}

const MAX_PARTICLES = 600;

/**
 * Pool-backed particle system for all transient effects. Sprites are recycled instead of
 * created per effect, and the whole layer advances only when `update` is called with the
 * effect clock (which stops while paused and follows the manual clock in tests). Effect
 * randomness uses its own seeded RNG, so effects are reproducible for visual tests.
 */
export class EffectsLayer {
  readonly view: Container;
  private readonly active: Particle[] = [];
  private readonly pool: Sprite[] = [];
  private readonly texts: FloatingText[] = [];
  readonly rng: Rng;

  constructor(label: string, seed: number) {
    this.view = new Container({ label });
    this.rng = new Rng(seed ^ 0x5eed);
  }

  get count(): number {
    return this.active.length + this.texts.length;
  }

  spawn(o: ParticleOptions): void {
    if (this.active.length >= MAX_PARTICLES) return;
    const sprite = this.pool.pop() ?? this.createSprite();
    sprite.texture = o.frames?.[0] ?? o.texture;
    sprite.anchor.set(o.anchorX ?? 0.5, o.anchorY ?? 0.5);
    sprite.position.set(o.x, o.y);
    sprite.rotation = o.rotation ?? 0;
    sprite.tint = o.tint ?? 0xffffff;
    const [scaleFrom, scaleTo] = o.scale ?? [1, 1];
    const [alphaFrom, alphaTo] = o.alpha ?? [1, 0];
    sprite.scale.set(scaleFrom);
    sprite.alpha = alphaFrom;
    sprite.visible = true;
    this.active.push({
      sprite,
      age: 0,
      life: o.life,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      drag: o.drag ?? 1,
      spin: o.spin ?? 0,
      scaleFrom,
      scaleTo,
      alphaFrom,
      alphaTo,
      frames: o.frames ?? null,
      frameSpan: o.frameSpan ?? 1,
    });
  }

  floatingText(value: string, x: number, y: number): void {
    const text = new Text({
      text: value,
      style: {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 26,
        fontWeight: '900',
        fill: 0xffd54f,
        stroke: { color: 0x3a2410, width: 5 },
      },
      resolution: 2,
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.view.addChild(text);
    this.texts.push({ text, age: 0, life: 0.9, startY: y });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        this.pool.push(p.sprite);
        this.active[i] = this.active[this.active.length - 1] as Particle;
        this.active.pop();
        continue;
      }
      const t = p.age / p.life;
      const damping = p.drag === 1 ? 1 : Math.pow(p.drag, dt);
      p.vx *= damping;
      p.vy *= damping;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      p.sprite.scale.set(p.scaleFrom + (p.scaleTo - p.scaleFrom) * t);
      p.sprite.alpha = p.alphaFrom + (p.alphaTo - p.alphaFrom) * t;
      if (p.frames) {
        const index = Math.min(p.frames.length - 1, Math.floor((t / p.frameSpan) * p.frames.length));
        const frame = p.frames[index];
        if (frame && p.sprite.texture !== frame) p.sprite.texture = frame;
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      if (!f) continue;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.text.destroy();
        this.texts.splice(i, 1);
        continue;
      }
      f.text.y = f.startY - 34 * t;
      f.text.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      f.text.scale.set(t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, t * 0.1));
    }
  }

  private createSprite(): Sprite {
    const sprite = new Sprite();
    this.view.addChild(sprite);
    return sprite;
  }

  destroy(): void {
    for (const f of this.texts) f.text.destroy();
    this.texts.length = 0;
    this.active.length = 0;
    this.pool.length = 0;
    this.view.destroy({ children: true });
  }
}
