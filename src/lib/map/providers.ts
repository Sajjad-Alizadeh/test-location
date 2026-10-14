import type { MapEnvironment, MapProviderResolution, RasterMapProvider } from "./types";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** Add vendor-specific raster profiles here; no changes to patient/GPS logic. */
export const MAP_PROVIDERS: Readonly<Record<string, RasterMapProvider>> = {
  osm: {
    id: "osm",
    tileUrlTemplate: OSM_TILE_URL,
    attributions: [{ text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" }],
    minZoom: 0,
    maxZoom: 19,
    scheme: "xyz",
    // Overrides document no-referrer ONLY for tiles. Sends site origin, never patient path/token.
    referrerPolicy: "origin",
  },
};

/** Literal accesses are required for Next.js build-time NEXT_PUBLIC_ inlining. */
export function readMapEnvironment(): MapEnvironment {
  return {
    provider: process.env.NEXT_PUBLIC_MAP_PROVIDER,
    tileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL,
    attributionText: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION_TEXT,
    attributionUrl: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION_URL,
  };
}

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url : null;
  } catch { return null; }
}

export function resolveMapProvider(environment: MapEnvironment, demo: boolean): MapProviderResolution {
  const tileUrl = environment.tileUrl?.trim() || "";
  const configured = environment.provider?.trim() || "";
  // Preserve old canonical OSM URL config. Never quietly select OSM on an unknown provider.
  const id = configured || (tileUrl ? tileUrl === OSM_TILE_URL ? "osm" : "custom" : demo ? "osm" : "disabled");
  if (id === "disabled") return { status: "disabled" };
  const known = Object.prototype.hasOwnProperty.call(MAP_PROVIDERS, id) ? MAP_PROVIDERS[id] : undefined;
  if (known) {
    if (tileUrl && tileUrl !== known.tileUrlTemplate) return { status: "invalid", reason: "Built-in provider has a conflicting NEXT_PUBLIC_MAP_TILE_URL; choose custom for another endpoint." };
    return { status: "ready", provider: known };
  }
  if (id !== "custom") return { status: "invalid", reason: "Unknown NEXT_PUBLIC_MAP_PROVIDER. Use osm, custom, or disabled." };
  if (!["{z}", "{x}", "{y}"].every(part => tileUrl.includes(part))) return { status: "invalid", reason: "NEXT_PUBLIC_MAP_TILE_URL must contain {z}, {x}, and {y}." };
  if (/\{[^}]*\}/.test(tileUrl.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0"))) return { status: "invalid", reason: "Tile URL has unsupported placeholders. Use a complete raster XYZ URL." };
  const parsed = httpsUrl(tileUrl.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0"));
  if (parsed && /\.(?:pbf|mvt|json)$/i.test(parsed.pathname)) return { status: "invalid", reason: "Vector tiles and style JSON require a vector renderer, not the raster XYZ adapter." };
  if (!parsed) return { status: "invalid", reason: "Custom tile URL must use HTTPS, without URL credentials or fragments." };
  if (parsed.hostname === "openstreetmap.org" || parsed.hostname.endsWith(".openstreetmap.org")) {
    if (tileUrl === OSM_TILE_URL) return { status: "ready", provider: MAP_PROVIDERS.osm };
    return { status: "invalid", reason: "For OSM standard tiles use provider osm and its canonical HTTPS tile URL." };
  }
  const text = environment.attributionText?.trim() || "";
  const url = environment.attributionUrl?.trim() || "";
  if (!text || text.length > 200 || !httpsUrl(url)) return { status: "invalid", reason: "Custom providers require NEXT_PUBLIC_MAP_ATTRIBUTION_TEXT and an HTTPS NEXT_PUBLIC_MAP_ATTRIBUTION_URL." };
  return {
    status: "ready",
    provider: { id: "custom", tileUrlTemplate: tileUrl, attributions: [{ text, url }], minZoom: 0, maxZoom: 18, scheme: "xyz", referrerPolicy: "origin" },
  };
}

export function mapZoomLimits(provider: RasterMapProvider | null): { min: number; max: number } {
  return { min: Math.max(5, provider?.minZoom ?? 5), max: Math.min(18, provider?.maxZoom ?? 18) };
}
export function clampMapZoom(zoom: number, provider: RasterMapProvider | null): number {
  const { min, max } = mapZoomLimits(provider);
  return Math.max(min, Math.min(max, Math.round(zoom)));
}
