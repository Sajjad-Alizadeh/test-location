import { test } from "node:test";
import assert from "node:assert/strict";
import { clampMapZoom, MAP_PROVIDERS, OSM_TILE_URL, resolveMapProvider } from "../src/lib/map/providers";
import { tileUrl, visibleTiles } from "../src/lib/map/tiles";
import type { RasterMapProvider } from "../src/lib/map/types";
const custom = { provider: "custom", tileUrl: "https://tiles.example.ir/{z}/{x}/{y}.png", attributionText: "© Example provider", attributionUrl: "https://tiles.example.ir/attribution" };

test("OSM profile sends origin-only Referer and carries visible license attribution", () => {
  const result = resolveMapProvider({ provider: "osm" }, false);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.provider.referrerPolicy, "origin");
  assert.equal(result.provider.tileUrlTemplate, OSM_TILE_URL);
  assert.equal(result.provider.attributions[0].text, "© OpenStreetMap contributors");
});
test("Unconfigured demo uses OSM; real links require explicit map configuration", () => {
  assert.equal(resolveMapProvider({}, true).status, "ready");
  assert.equal(resolveMapProvider({}, false).status, "disabled");
});
test("Explicit disabled and unknown providers never silently fetch OSM", () => {
  assert.deepEqual(resolveMapProvider({ provider: "disabled", tileUrl: OSM_TILE_URL }, true), { status: "disabled" });
  for (const provider of ["typo", "__proto__", "constructor"]) assert.equal(resolveMapProvider({ provider }, true).status, "invalid");
});
test("Existing canonical OSM tile URL remains compatible", () => {
  const result = resolveMapProvider({ tileUrl: OSM_TILE_URL }, false);
  assert.ok(result.status === "ready" && result.provider.id === "osm");
});
test("Custom provider changes only URL and license configuration", () => {
  const result = resolveMapProvider(custom, false);
  assert.ok(result.status === "ready");
  if (result.status !== "ready") return;
  assert.equal(tileUrl(result.provider, { z: 16, x: 42115, y: 25800 }), "https://tiles.example.ir/16/42115/25800.png");
  assert.deepEqual(result.provider.attributions, [{ text: custom.attributionText, url: custom.attributionUrl }]);
});
test("Custom URL in old environment infers custom provider but still requires attribution", () => {
  assert.equal(resolveMapProvider({ ...custom, provider: undefined }, true).status, "ready");
  assert.equal(resolveMapProvider({ tileUrl: custom.tileUrl }, true).status, "invalid");
});
test("Invalid tile protocols, credentials, fragments and missing placeholders fail closed", () => {
  for (const tileUrl of ["http://tiles.example.ir/{z}/{x}/{y}.png", "javascript:alert(1)", "https://user:secret@tiles.example.ir/{z}/{x}/{y}.png", "https://tiles.example.ir/{z}/{x}/{y}.png#token=secret", "https://tiles.example.ir/{z}/{x}.png", "https://tiles.example.ir/{s}/{z}/{x}/{y}.png", "https://tiles.example.ir/{z}/{x}/{y}.pbf?key={key}", "https://tiles.example.ir/{z}/{x}/{y}.pbf", "https://tiles.example.ir/{z}/{x}/{y}.json"]) {
    assert.equal(resolveMapProvider({ ...custom, tileUrl }, true).status, "invalid", tileUrl);
  }
});
test("Invalid attribution URLs cannot become executable map links", () => {
  for (const attributionUrl of ["", "javascript:alert(1)", "http://example.ir", "https://user:password@example.ir"]) assert.equal(resolveMapProvider({ ...custom, attributionUrl }, true).status, "invalid");
});
test("Standard OSM host cannot be disguised as custom tiles with different license", () => {
  assert.equal(resolveMapProvider({ ...custom, tileUrl: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" }, true).status, "invalid");
  const result = resolveMapProvider({ ...custom, tileUrl: OSM_TILE_URL }, true);
  assert.ok(result.status === "ready" && result.provider.id === "osm");
  assert.equal(resolveMapProvider({ provider: "osm", tileUrl: custom.tileUrl }, true).status, "invalid");
});
test("Provider zoom limits apply before rendering and tile URL generation", () => {
  const provider: RasterMapProvider = { ...MAP_PROVIDERS.osm, minZoom: 8, maxZoom: 16 };
  assert.equal(clampMapZoom(17, provider), 16);
  assert.equal(clampMapZoom(5, provider), 8);
  assert.equal(tileUrl(provider, { z: 17, x: 1, y: 1 }), null);
  assert.equal(tileUrl(provider, { z: 16, x: -1, y: 1 }), null);
  assert.equal(tileUrl(provider, { z: 16, x: 65536, y: 1 }), null);
});
test("TMS adapter changes only vertical tile addressing, never patient coordinates", () => {
  const provider = { ...MAP_PROVIDERS.osm, tileUrlTemplate: custom.tileUrl, scheme: "tms" as const };
  assert.equal(tileUrl(provider, { z: 5, x: 12, y: 8 }), "https://tiles.example.ir/5/12/23.png");
});
test("Only viewport-intersecting tiles requested, without prefetch or other zoom levels", () => {
  const tiles = visibleTiles({ lat: 35.71522, lng: 51.40595 }, 16, { width: 390, height: 355 }, { x: 20, y: -30 });
  assert.ok(tiles.length >= 4 && tiles.length <= 9);
  for (const tile of tiles) {
    assert.equal(tile.z, 16);
    assert.ok(tile.left < 390 && tile.left + 256 > 0);
    assert.ok(tile.top < 355 && tile.top + 256 > 0);
  }
  assert.deepEqual(visibleTiles({ lat: 35, lng: 51 }, 16, { width: 0, height: 0 }, { x: 0, y: 0 }), []);
});
