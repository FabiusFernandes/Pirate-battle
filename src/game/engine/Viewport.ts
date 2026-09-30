export interface ViewportRect {
  /** Left offset of the arena inside the host element, in CSS pixels. */
  x: number;
  /** Top offset of the arena inside the host element, in CSS pixels. */
  y: number;
  /** Arena width on screen, in CSS pixels. */
  width: number;
  /** Arena height on screen, in CSS pixels. */
  height: number;
  /** CSS pixels per world unit. */
  scale: number;
}

/**
 * Maps the fixed-size world (arena) onto the available screen area while preserving its
 * aspect ratio ("contain" / letterbox). Game rules only ever see world units, so resizing
 * the window or rotating a phone never changes gameplay.
 */
export class Viewport {
  private rect: ViewportRect = { x: 0, y: 0, width: 0, height: 0, scale: 1 };

  constructor(
    readonly worldWidth: number,
    readonly worldHeight: number,
  ) {}

  fit(screenWidth: number, screenHeight: number): ViewportRect {
    const scale = Math.max(0.0001, Math.min(screenWidth / this.worldWidth, screenHeight / this.worldHeight));
    const width = this.worldWidth * scale;
    const height = this.worldHeight * scale;
    this.rect = {
      x: Math.round((screenWidth - width) / 2),
      y: Math.round((screenHeight - height) / 2),
      width,
      height,
      scale,
    };
    return this.rect;
  }

  get current(): ViewportRect {
    return this.rect;
  }

  /** Converts a point in host-element CSS pixels into world coordinates. */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const { x, y, scale } = this.rect;
    return { x: (screenX - x) / scale, y: (screenY - y) / scale };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const { x, y, scale } = this.rect;
    return { x: x + worldX * scale, y: y + worldY * scale };
  }
}
