import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireLocation, type AcquisitionEnvironment } from "../src/lib/location/acquisition";
import { initialState, reducer, type Event, type State } from "../src/lib/location/machine";

class Clock {
  now = 100000;
  next = 0;
  tasks = new Map<number, { due: number; callback: () => void }>();
  set = (callback: () => void, delay: number) => { const id = ++this.next; this.tasks.set(id, { due: this.now + delay, callback }); return id; };
  clear = (id: number) => { this.tasks.delete(id); };
  tick(ms: number) {
    const until = this.now + ms;
    for (;;) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > until) break;
      this.now = next[1].due; this.tasks.delete(next[0]); next[1].callback();
    }
    this.now = until;
  }
}
function position(clock: Clock, options: { lat?: number; lng?: number; accuracy?: number; timestamp?: number } = {}): GeolocationPosition {
  return { coords: { latitude: options.lat ?? 35.71522, longitude: options.lng ?? 51.40595, accuracy: options.accuracy ?? 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: options.timestamp ?? clock.now } as GeolocationPosition;
}
const error = (code: number) => ({ code, message: "sensor fixture", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;
function setup() {
  const clock = new Clock();
  let state: State = initialState;
  let blocked = 0;
  const events: Event[] = [];
  let watchSuccess: PositionCallback = () => {};
  let watchError: PositionErrorCallback = () => {};
  let resume = () => {};
  let listeners = 0;
  const cleared: number[] = [];
  const probes: { success: PositionCallback; error: PositionErrorCallback }[] = [];
  const hooks: { probe?: (success: PositionCallback, error: PositionErrorCallback) => void } = {};
  const geolocation: NonNullable<AcquisitionEnvironment["geolocation"]> = {
    watchPosition(success, failure) { watchSuccess = success; watchError = failure!; return 7; },
    getCurrentPosition(success, failure) { probes.push({ success, error: failure! }); hooks.probe?.(success, failure!); },
    clearWatch(id) { cleared.push(id); },
  };
  const environment: AcquisitionEnvironment = { secure: true, geolocation, now: () => clock.now, setTimer: clock.set, clearTimer: clock.clear, onResume(callback) { resume = callback; listeners++; return () => { listeners--; }; } };
  const emit = (event: Event) => { events.push(event); state = reducer(state, event); };
  const start = () => acquireLocation(environment, emit, () => { blocked++; });
  return { clock, environment, hooks, events, probes, cleared, start, emit, watch: (p: GeolocationPosition) => watchSuccess(p), fail: (code: number) => watchError(error(code)), resume: () => resume(), state: () => state, blocked: () => blocked, listeners: () => listeners };
}

test("Silent browser exits requesting/calibrating by 15 seconds, even without native error callbacks", () => {
  const run = setup(); run.start(); run.clock.tick(14999);
  assert.equal(run.state().phase, "requesting");
  run.clock.tick(1);
  assert.equal(run.state().phase, "manual");
  assert.equal(run.clock.tasks.size, 0);
  assert.deepEqual(run.cleared, [7]);
  assert.equal(run.listeners(), 0);
  const count = run.events.length;
  run.probes[0].success(position(run.clock));
  assert.equal(run.events.length, count);
});
test("Stationary watch giving one fix still locks through fresh one-shot requests", () => {
  const run = setup(); run.hooks.probe = success => success(position(run.clock)); run.start();
  run.watch(position(run.clock)); // Duplicate timestamp must not manufacture a second reading.
  run.clock.tick(5000);
  assert.equal(run.state().phase, "locked");
  assert.ok(run.probes.length >= 3);
  assert.equal(run.state().fix?.accuracy, 12);
});
test("Desktop coarse location appears, then requires manual verification instead of endless calibration", () => {
  const run = setup(); run.hooks.probe = success => success(position(run.clock, { accuracy: 900 })); run.start();
  assert.equal(run.state().phase, "calibrating");
  assert.equal(run.state().fix?.lat, 35.71522);
  run.clock.tick(15000);
  assert.equal(run.state().phase, "manual");
  assert.ok(run.state().problem?.includes("تقریبی"));
  assert.equal(run.state().fix?.accuracy, 900);
  assert.equal(run.events.some(e => e.type === "SAMPLE" && e.locked), false);
});
test("Same cached timestamp repeatedly returned never becomes accurate lock", () => {
  const run = setup(); const timestamp = run.clock.now;
  run.hooks.probe = success => success(position(run.clock, { timestamp })); run.start(); run.clock.tick(15000);
  assert.equal(run.state().phase, "manual");
  assert.equal(run.events.some(e => e.type === "SAMPLE" && e.locked), false);
});
test("Out-of-Iran fixes explain rejection, remain unselected, and exit loading", () => {
  const run = setup(); run.hooks.probe = success => success(position(run.clock, { lat: 51.5, lng: -0.1 })); run.start();
  assert.ok(run.state().problem?.includes("خارج از ایران"));
  run.clock.tick(15000);
  assert.equal(run.state().phase, "manual");
  assert.equal(run.state().fix, null);
  assert.ok(run.state().problem?.includes("خارج از ایران"));
});
test("Accurate lock followed by poor samples stays locked until freshness expires, never reopens spinner", () => {
  const run = setup(); run.hooks.probe = success => success(position(run.clock)); run.start(); run.clock.tick(5000);
  assert.equal(run.state().phase, "locked");
  const precise = run.state().fix;
  run.hooks.probe = success => success(position(run.clock, { accuracy: 1000 }));
  run.clock.tick(1000); run.watch(position(run.clock, { accuracy: 1000 }));
  assert.equal(run.state().phase, "locked");
  assert.equal(run.state().fix, precise);
  run.clock.tick(20000);
  assert.equal(run.state().phase, "locked");
  run.clock.tick(15000);
  assert.equal(run.state().phase, "manual");
  assert.equal(run.state().fix, null);
  assert.ok(run.state().problem?.includes("تازه نیست"));
});
test("Transient native timeout does not stop a watch that subsequently produces good readings", () => {
  const run = setup(); run.hooks.probe = (_success, fail) => fail(error(3)); run.start();
  assert.equal(run.state().phase, "calibrating");
  run.watch(position(run.clock)); run.clock.tick(1100); run.watch(position(run.clock)); run.clock.tick(1100); run.watch(position(run.clock));
  assert.equal(run.state().phase, "locked"); assert.equal(run.blocked(), 0);
});
test("Permission denial terminates immediately and opens help exactly once", () => {
  const run = setup(); run.start(); run.fail(1);
  assert.equal(run.state().phase, "manual"); assert.equal(run.blocked(), 1); assert.equal(run.clock.tasks.size, 0);
  run.fail(1); assert.equal(run.blocked(), 1);
});
test("Synchronous WebView denial cannot orphan the returned watch ID", () => {
  const run = setup();
  run.environment.geolocation!.watchPosition = (_success, failure) => { failure!(error(1)); return 19; };
  run.start(); assert.deepEqual(run.cleared, [19]); assert.equal(run.blocked(), 1); assert.equal(run.clock.tasks.size, 0);
});
test("Explicit cancel stops probes/timers and ignores late results after manual selection", () => {
  const run = setup(); const stop = run.start();
  stop(); run.emit({ type: "MANUAL", fix: { lat: 35.7, lng: 51.4, accuracy: null, timestamp: run.clock.now, source: "manual" } });
  const selected = run.state().fix;
  run.probes[0].success(position(run.clock)); run.watch(position(run.clock)); run.clock.tick(30000);
  assert.equal(run.state().fix, selected); assert.equal(run.clock.tasks.size, 0); assert.equal(run.listeners(), 0);
});
test("Background timer throttling cannot extend spinner after tab resumes", () => {
  const run = setup(); run.start(); run.clock.now += 60000; run.resume();
  assert.equal(run.state().phase, "manual"); assert.equal(run.clock.tasks.size, 0);
});
test("Retried acquisition is isolated from callbacks belonging to previous run", () => {
  const run = setup(); const stop = run.start(); const old = run.probes[0]; stop(); run.start();
  const count = run.events.length; old.success(position(run.clock));
  assert.equal(run.events.length, count); assert.equal(run.state().phase, "requesting");
});
test("Unsupported geolocation exits immediately with actionable fallback", () => {
  const run = setup(); run.environment.geolocation = null; run.start();
  assert.equal(run.state().phase, "manual"); assert.equal(run.blocked(), 1); assert.equal(run.clock.tasks.size, 0);
});
test("Late progress cannot overwrite manual or submitted patient state", () => {
  const run = setup(); run.emit({ type: "MANUAL" });
  const manual = run.state(); run.emit({ type: "LOCATION_PROGRESS", message: "late sensor" });
  assert.equal(run.state(), manual);
});
