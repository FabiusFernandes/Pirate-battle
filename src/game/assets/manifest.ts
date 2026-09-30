/**
 * Runtime asset manifest. Files are produced in `public/game` by `scripts/prepare-assets.mjs`.
 * Each atlas is available at 1x and (when the pack provides it) 2x; the loader picks one
 * resolution per session based on the device pixel ratio.
 */

export type AssetResolution = 1 | 2;

export type AtlasKey = 'ui' | 'tiles' | 'ships';

const BASE = `${import.meta.env.BASE_URL}game/`;

export const ATLAS_URLS: Record<AtlasKey, Record<AssetResolution, string>> = {
  ui: { 1: `${BASE}atlas/ui_sheet.json`, 2: `${BASE}atlas/ui_sheet_retina.json` },
  tiles: { 1: `${BASE}atlas/tiles_sheet.json`, 2: `${BASE}atlas/tiles_sheet_retina.json` },
  // The pack's "retina" ship sheet has the same pixel density as the default one.
  ships: { 1: `${BASE}atlas/ships_sheet.json`, 2: `${BASE}atlas/ships_sheet.json` },
};

export const ATLAS_KEYS: readonly AtlasKey[] = ['ui', 'tiles', 'ships'];

/** URL of an individual UI image used by the DOM (React) layer. */
export function uiImageUrl(path: string): string {
  return `${BASE}ui/${path}`;
}

export function pickResolution(devicePixelRatio: number): AssetResolution {
  return devicePixelRatio > 1.25 ? 2 : 1;
}
