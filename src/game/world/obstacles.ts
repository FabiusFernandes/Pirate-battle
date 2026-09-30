import { clamp, type Vec2 } from '../sim/math';
import { TILE_SIZE, arenaSize, type ArenaMap, type StampName } from './arenaMap';

/**
 * Collision geometry of the arena. Islands are rounded rectangles (an inner rectangle
 * inflated by a corner radius), rocks are circles. Both block ships and projectiles.
 */
export type Obstacle =
  | { kind: 'roundedRect'; minX: number; minY: number; maxX: number; maxY: number; radius: number }
  | { kind: 'circle'; x: number; y: number; radius: number };

/** Collision outline of each stamp relative to its top-left tile corner (tuned to the art). */
const STAMP_SHAPES: Record<StampName, (x: number, y: number) => Obstacle> = {
  sandIsland: (x, y) => roundedRect(x + 8, y + 8, x + 3 * TILE_SIZE - 8, y + 3 * TILE_SIZE - 10, 34),
  grassIsland: (x, y) => roundedRect(x + 6, y + 6, x + 4 * TILE_SIZE - 6, y + 4 * TILE_SIZE - 8, 34),
  rock: (x, y) => ({ kind: 'circle', x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 + 2, radius: 20 }),
  mossyRock: (x, y) => ({ kind: 'circle', x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 + 2, radius: 20 }),
};

function roundedRect(minX: number, minY: number, maxX: number, maxY: number, radius: number): Obstacle {
  // Stored as the inner rectangle; the shape is every point within `radius` of it.
  return { kind: 'roundedRect', minX: minX + radius, minY: minY + radius, maxX: maxX - radius, maxY: maxY - radius, radius };
}

export interface ArenaGeometry {
  width: number;
  height: number;
  obstacles: readonly Obstacle[];
}

export function buildArenaGeometry(map: ArenaMap): ArenaGeometry {
  const { width, height } = arenaSize(map);
  // The Record type guarantees every stamp has a collision shape.
  const obstacles = map.placements.map((p) => STAMP_SHAPES[p.stamp](p.col * TILE_SIZE, p.row * TILE_SIZE));
  return { width, height, obstacles };
}

export interface Penetration {
  /** Unit normal pointing out of the obstacle. */
  nx: number;
  ny: number;
  /** Overlap depth (> 0 when overlapping). */
  depth: number;
}

/** Circle vs obstacle test. Returns how to push the circle out, or null when separated. */
export function circlePenetration(obstacle: Obstacle, cx: number, cy: number, r: number): Penetration | null {
  let px: number;
  let py: number;
  let reach: number;
  if (obstacle.kind === 'circle') {
    px = obstacle.x;
    py = obstacle.y;
    reach = obstacle.radius + r;
  } else {
    px = clamp(cx, obstacle.minX, obstacle.maxX);
    py = clamp(cy, obstacle.minY, obstacle.maxY);
    reach = obstacle.radius + r;
  }
  const dx = cx - px;
  const dy = cy - py;
  const distSq = dx * dx + dy * dy;
  if (distSq >= reach * reach) return null;
  const dist = Math.sqrt(distSq);
  if (dist > 1e-6) return { nx: dx / dist, ny: dy / dist, depth: reach - dist };

  // Centre exactly on the inner shape: push out along the shortest axis.
  if (obstacle.kind === 'circle') return { nx: 0, ny: -1, depth: reach };
  const left = cx - obstacle.minX;
  const right = obstacle.maxX - cx;
  const top = cy - obstacle.minY;
  const bottom = obstacle.maxY - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: left + reach };
  if (m === right) return { nx: 1, ny: 0, depth: right + reach };
  if (m === top) return { nx: 0, ny: -1, depth: top + reach };
  return { nx: 0, ny: 1, depth: bottom + reach };
}

export function circleHitsAnyObstacle(geometry: ArenaGeometry, cx: number, cy: number, r: number): boolean {
  return geometry.obstacles.some((o) => circlePenetration(o, cx, cy, r) !== null);
}

/**
 * True when a circle of radius `r` travelling in a straight line from A to B touches any
 * obstacle. Sampled at intervals of r/2, which is exact enough for AI probes and line of sight.
 */
export function segmentBlocked(geometry: ArenaGeometry, a: Vec2, b: Vec2, r: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length / Math.max(4, r / 2)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (circleHitsAnyObstacle(geometry, a.x + dx * t, a.y + dy * t, r)) return true;
  }
  return false;
}
