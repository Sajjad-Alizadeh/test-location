import { test } from "node:test";
import assert from "node:assert/strict";
import { distance, inIran, project, unproject } from "../src/lib/location/geometry";
import { freshFix, LocationEngine } from "../src/lib/location/engine";
import { initialState, reducer } from "../src/lib/location/machine";
import { cleanPayload, validPayload } from "../src/lib/location/validation";
import type { DispatchPayload, Fix } from "../src/lib/location/types";
const time = 100000;
const fix = (timestamp = time, changes: Partial<Fix> = {}): Fix => ({ lat: 35.71522, lng: 51.40595, accuracy: 12, source: "gps", timestamp, ...changes });
test("Iran boundary accepts Tehran, Mashhad, Shiraz, Tabriz and Qeshm", () => {
  for (const p of [{ lat: 35.71522, lng: 51.40595 }, { lat: 36.2972, lng: 59.6067 }, { lat: 29.5918, lng: 52.5837 }, { lat: 38.0962, lng: 46.2738 }, { lat: 26.958, lng: 56.271 }]) assert.equal(inIran(p), true);
});
test("Polygon rejects neighboring countries inside broad Iran bounding rectangle", () => {
  for (const p of [{ lat: 33.315, lng: 44.366 }, { lat: 37.96, lng: 58.33 }, { lat: 25.3, lng: 51.5 }, { lat: NaN, lng: 51.4 }]) assert.equal(inIran(p), false);
});
test("Map projection round trips without coordinate drift", () => {
  const original = fix(); const result = unproject(project(original, 17), 17);
  assert.ok(distance(original, result) < 0.001);
});
test("Single attractive sample cannot declare accurate lock", () => {
  assert.deepEqual(new LocationEngine(time).ingest(fix(), time), { accepted: true, fix: fix(), locked: false });
});
test("Three stable independent timestamps produce conservative lock", () => {
  const engine = new LocationEngine(time);
  engine.ingest(fix(time, { accuracy: 15 }), time);
  engine.ingest(fix(time + 1000, { lat: 35.71523, accuracy: 20 }), time + 1000);
  const result = engine.ingest(fix(time + 2000), time + 2000);
  assert.ok(result.accepted && result.locked);
  if (result.accepted) assert.ok(result.fix.accuracy! >= 20);
});
test("Dynamic threshold accepts stable 50m samples only after 12 seconds", () => {
  const engine = new LocationEngine(time);
  for (let i = 0; i < 3; i++) { const result = engine.ingest(fix(time + i * 1000, { accuracy: 50 }), time + i * 1000); assert.ok(result.accepted && !result.locked); }
  for (let i = 13; i < 16; i++) { const result = engine.ingest(fix(time + i * 1000, { accuracy: 50 }), time + i * 1000); if (i === 15) assert.ok(result.accepted && result.locked); }
});
test("Uncertain regional browser fixes never become precise lock", () => {
  const engine = new LocationEngine(time);
  for (let i = 0; i < 5; i++) { const result = engine.ingest(fix(time + i * 1000, { accuracy: 900 }), time + i * 1000); assert.ok(result.accepted && !result.locked); }
});
test("Reject stale, future and duplicate readings", () => {
  const engine = new LocationEngine(time);
  assert.deepEqual(engine.ingest(fix(time - 16000), time), { accepted: false, reason: "stale" });
  assert.deepEqual(engine.ingest(fix(time + 3000), time), { accepted: false, reason: "stale" });
  engine.ingest(fix(), time);
  assert.deepEqual(engine.ingest(fix(), time), { accepted: false, reason: "stale" });
});
test("Reject outside-Iran GPS before it moves map", () => {
  assert.deepEqual(new LocationEngine(time).ingest(fix(time, { lat: 51.5, lng: -0.1 }), time), { accepted: false, reason: "outside" });
});
test("Reject impossible speed above 180km/h", () => {
  const engine = new LocationEngine(time); engine.ingest(fix(), time);
  assert.deepEqual(engine.ingest(fix(time + 1000, { lat: 35.8 }), time + 1000), { accepted: false, reason: "jump" });
});
test("Rejected jump does not poison next legitimate sample", () => {
  const engine = new LocationEngine(time); engine.ingest(fix(), time);
  engine.ingest(fix(time + 1000, { lat: 35.8 }), time + 1000);
  assert.ok(engine.ingest(fix(time + 2000), time + 2000).accepted);
});
test("Invalid radii and fabricated source cannot enter GPS engine", () => {
  for (const changes of [{ accuracy: NaN }, { accuracy: 0 }, { accuracy: -1 }, { accuracy: 20000 }, { source: "carrier" as const }]) assert.deepEqual(new LocationEngine(time).ingest(fix(time, changes), time), { accepted: false, reason: "invalid" });
});
test("Freshness differs between precise GPS and broad carrier estimates", () => {
  assert.equal(freshFix(fix(time), time + 31000), false);
  assert.equal(freshFix(fix(time, { source: "carrier" }), time + 119000), true);
  assert.equal(freshFix(fix(time, { source: "carrier" }), time + 121000), false);
});
test("GPS cannot overwrite manual patient choice", () => {
  const manual = reducer(initialState, { type: "MANUAL", fix: fix(time, { source: "manual", accuracy: null }) });
  assert.equal(reducer(manual, { type: "SAMPLE", fix: fix(), locked: true }), manual);
});
test("Cannot submit before lock or manual selection", () => {
  const state = reducer(reducer(initialState, { type: "REQUEST" }), { type: "SAMPLE", fix: fix(), locked: false });
  assert.equal(reducer(state, { type: "SEND" }), state);
  assert.equal(reducer(initialState, { type: "SEND" }), initialState);
});
test("Late GPS cannot alter in-flight submission", () => {
  const ready = reducer(initialState, { type: "MANUAL", fix: fix(time, { source: "manual", accuracy: null }) });
  const sending = reducer(ready, { type: "SEND" });
  assert.equal(reducer(sending, { type: "SAMPLE", fix: fix(), locked: true }), sending);
  assert.equal(reducer(sending, { type: "MANUAL", fix: fix() }), sending);
});
test("Submission failure preserves location and offers retry", () => {
  const ready = reducer(initialState, { type: "MANUAL", fix: fix(time, { source: "manual", accuracy: null }) });
  const sending = reducer(ready, { type: "SEND" });
  const failed = reducer(sending, { type: "FAIL", message: "offline" });
  assert.equal(failed.phase, "manual"); assert.equal(failed.fix, ready.fix); assert.equal(failed.problem, "offline");
});
test("No success without in-flight dispatch acknowledgement", () => {
  const receipt = { receiptId: "r-1", acceptedAt: time };
  assert.equal(reducer(initialState, { type: "ACK", receipt }), initialState);
  const ready = reducer(initialState, { type: "MANUAL", fix: fix() });
  const done = reducer(reducer(ready, { type: "SEND" }), { type: "ACK", receipt });
  assert.equal(done.phase, "submitted"); assert.equal(reducer(done, { type: "REQUEST" }), done);
});
const payload = (location: Fix = fix()): DispatchPayload => ({ location, address: "تهران، خیابان ولیعصر", addressSource: "reverse", details: "", verified: true, device: { userAgent: "browser", language: "fa", platform: "iPhone", viewport: "390x844" } });
test("Server accepts verified fresh GPS payload", () => assert.equal(validPayload({ ...payload() }, time), true));
test("Manual point requires unknown accuracy, never invented meter radius", () => {
  assert.equal(validPayload({ ...payload(fix(time, { source: "manual", accuracy: null })) }, time), true);
  assert.equal(validPayload({ ...payload(fix(time, { source: "manual", accuracy: 5 })) }, time), false);
});
test("Server rejects stale GPS, missing verification and missing address", () => {
  assert.equal(validPayload({ ...payload() }, time + 31000), false);
  assert.equal(validPayload({ ...payload(), verified: false }, time), false);
  assert.equal(validPayload({ ...payload(), address: "" }, time), false);
});
test("Server rejects malformed metadata, future time and outside border", () => {
  assert.equal(validPayload({ ...payload(), device: null }, time), false);
  assert.equal(validPayload({ ...payload(fix(time + 9000)) }, time), false);
  assert.equal(validPayload({ ...payload(fix(time, { lat: 33.315, lng: 44.366 })) }, time), false);
});

test("Stale retry envelope remains structurally valid for receipt lookup, never new submit", () => {
  assert.equal(validPayload({ ...payload() }, time + 100000), false);
  assert.equal(validPayload({ ...payload() }, time + 100000, false), true);
  assert.equal(validPayload({ ...payload(), verified: false }, time + 100000, false), false);
});
test("Clearing stale selection requires fresh patient choice", () => {
  const ready = reducer(initialState, { type: "MANUAL", fix: fix() });
  const fallback = reducer(ready, { type: "FALLBACK", clearFix: true, message: "stale" });
  assert.equal(fallback.fix, null); assert.equal(reducer(fallback, { type: "SEND" }), fallback);
});

test("Dispatch whitelist cannot override authenticated incident identity or inject provider flags", () => {
  const malicious = { ...payload(), incidentId: "another-incident", tokenHash: "attacker-hash", locationAccepted: true, location: { ...fix(), patientPhone: "unexpected" }, device: { ...payload().device, administrator: true } };
  const clean = cleanPayload(malicious);
  assert.equal("incidentId" in clean, false);
  assert.equal("tokenHash" in clean, false);
  assert.equal("locationAccepted" in clean, false);
  assert.equal("patientPhone" in clean.location, false);
  assert.equal("administrator" in clean.device, false);
  assert.deepEqual(clean, payload());
});

test("Stable individual radii cannot lock when conservative combined uncertainty exceeds threshold", () => {
  const engine = new LocationEngine(time);
  engine.ingest(fix(time, { lat: 35.7154, accuracy: 20 }), time);
  engine.ingest(fix(time + 1000, { accuracy: 20 }), time + 1000);
  const result = engine.ingest(fix(time + 2000, { accuracy: 20 }), time + 2000);
  assert.ok(result.accepted);
  if (result.accepted) { assert.ok(result.fix.accuracy! > 35); assert.equal(result.locked, false); }
});
