import { project } from "../location/geometry";
import type { Point } from "../location/types";
import type { RasterMapProvider, TileCoordinate } from "./types";

export type VisibleTile = TileCoordinate & { key: string; left: number; top: number };
export function tileUrl(provider: RasterMapProvider, tile: TileCoordinate): string | null {
  const count = 2 ** tile.z;
  if (!Number.isInteger(tile.z) || tile.z < provider.minZoom || tile.z > provider.maxZoom || !Number.isInteger(tile.x) || !Number.isInteger(tile.y) || tile.x < 0 || tile.y < 0 || tile.x >= count || tile.y >= count) return null;
  const y = provider.scheme === "tms" ? count - tile.y - 1 : tile.y;
  return provider.tileUrlTemplate.replaceAll("{z}", String(tile.z)).replaceAll("{x}", String(tile.x)).replaceAll("{y}", String(y));
}
/** Only intersecting viewport tiles; no look-ahead, prefetch, or alternate zoom downloads. */
export function visibleTiles(center: Point, zoom: number, size: { width: number; height: number }, offset: { x: number; y: number }): VisibleTile[] {
  if (size.width <= 0 || size.height <= 0) return [];
  const pixel = project(center, zoom);
  const left = pixel.lng - size.width / 2 - offset.x;
  const top = pixel.lat - size.height / 2 - offset.y;
  const xStart = Math.max(0, Math.floor(left / 256));
  const yStart = Math.max(0, Math.floor(top / 256));
  const xEnd = Math.min(2 ** zoom - 1, Math.ceil((left + size.width) / 256) - 1);
  const yEnd = Math.min(2 ** zoom - 1, Math.ceil((top + size.height) / 256) - 1);
  const tiles: VisibleTile[] = [];
  for (let x = xStart; x <= xEnd; x++) {
    for (let y = yStart; y <= yEnd; y++) tiles.push({ key: `${zoom}/${x}/${y}`, z: zoom, x, y, left: x * 256 - left, top: y * 256 - top });
  }
  return tiles;
}
