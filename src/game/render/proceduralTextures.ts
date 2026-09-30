import { Texture } from 'pixi.js';

/**
 * Small effect textures that the asset pack does not include (water ring, projectile trail,
 * smoke puff), drawn once per renderer on a 2D canvas. The owner destroys them on teardown.
 */
export interface ProceduralTextures {
  ring: Texture;
  trail: Texture;
  puff: Texture;
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  return [el, ctx];
}

function ringTexture(): Texture {
  const size = 128;
  const [el, ctx] = canvas(size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  return Texture.from(el);
}

/** Horizontal gradient: opaque at the right end (projectile), transparent at the left (tail). */
function trailTexture(): Texture {
  const [el, ctx] = canvas(64, 8);
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.75)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(64, 0.5);
  ctx.lineTo(64, 7.5);
  ctx.closePath();
  ctx.fill();
  return Texture.from(el);
}

function puffTexture(): Texture {
  const size = 64;
  const [el, ctx] = canvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(el);
}

export function createProceduralTextures(): ProceduralTextures {
  return { ring: ringTexture(), trail: trailTexture(), puff: puffTexture() };
}

export function destroyProceduralTextures(textures: ProceduralTextures): void {
  textures.ring.destroy(true);
  textures.trail.destroy(true);
  textures.puff.destroy(true);
}
