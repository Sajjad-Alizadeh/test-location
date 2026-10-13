import boundary from "./iran.json";
import type { Point } from "./types";

export function distance(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function inRing(point: Point, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point.lat) !== (yj > point.lat) && point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inIran(point: Point): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  return boundary.coordinates.some(polygon => inRing(point, polygon[0]) && !polygon.slice(1).some(ring => inRing(point, ring)));
}
export function project(point: Point, zoom: number): Point {
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin(Math.max(-85, Math.min(85, point.lat)) * Math.PI / 180);
  return { lng: (point.lng + 180) / 360 * scale, lat: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}
export function unproject(pixel: Point, zoom: number): Point {
  const scale = 256 * 2 ** zoom;
  return { lng: pixel.lng / scale * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * pixel.lat / scale))) * 180 / Math.PI };
}
