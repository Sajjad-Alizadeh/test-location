export type TileCoordinate = { x: number; y: number; z: number };
export type MapAttribution = { text: string; url: string };
/** Raster adapter contract. Geography, GPS and dispatch do not depend on a vendor. */
export type RasterMapProvider = {
  id: string;
  tileUrlTemplate: string;
  attributions: readonly MapAttribution[];
  minZoom: number;
  maxZoom: number;
  scheme: "xyz" | "tms";
  referrerPolicy: "origin" | "no-referrer";
};
export type MapProviderResolution =
  | { status: "ready"; provider: RasterMapProvider }
  | { status: "disabled" }
  | { status: "invalid"; reason: string };
export type MapEnvironment = {
  provider?: string;
  tileUrl?: string;
  attributionText?: string;
  attributionUrl?: string;
};
