/**
 * Static arena layout, expressed in tiles. Islands are built from "stamps": groups of tiles
 * from the tile sheet that form one complete island. Rendering and (later) collision shapes
 * are both derived from this single definition.
 */

export const TILE_SIZE = 64;

/** Tile ids refer to frames `tile_<id>` of the tile sheet (row-major, 16 columns). */
export type TileId = number;

export interface StampDefinition {
  /** Tile ids row by row; `0` means "no tile" (transparent). */
  tiles: readonly (readonly TileId[])[];
}

export const STAMPS = {
  sandIsland: {
    tiles: [
      [1, 2, 3],
      [17, 18, 19],
      [33, 34, 35],
    ],
  },
  grassIsland: {
    tiles: [
      [6, 7, 8, 9],
      [22, 23, 24, 25],
      [38, 39, 40, 41],
      [54, 55, 56, 57],
    ],
  },
  rock: { tiles: [[50]] },
  mossyRock: { tiles: [[66]] },
} as const satisfies Record<string, StampDefinition>;

export type StampName = keyof typeof STAMPS;

export interface StampPlacement {
  stamp: StampName;
  col: number;
  row: number;
}

export interface ArenaMap {
  cols: number;
  rows: number;
  waterTile: TileId;
  placements: readonly StampPlacement[];
  /** Player spawn, in world units; heading in degrees (0 = east, 90 = south). */
  playerStart: { x: number; y: number; heading: number };
}

export const ARENA_MAP: ArenaMap = {
  cols: 25,
  rows: 14,
  waterTile: 73,
  placements: [
    { stamp: 'grassIsland', col: 3, row: 2 },
    { stamp: 'sandIsland', col: 17, row: 1 },
    { stamp: 'grassIsland', col: 16, row: 8 },
    { stamp: 'sandIsland', col: 6, row: 9 },
    { stamp: 'rock', col: 11, row: 3 },
    { stamp: 'mossyRock', col: 22, row: 6 },
    { stamp: 'rock', col: 12, row: 11 },
  ],
  playerStart: { x: 800, y: 470, heading: -90 },
};

export function arenaSize(map: ArenaMap): { width: number; height: number } {
  return { width: map.cols * TILE_SIZE, height: map.rows * TILE_SIZE };
}
