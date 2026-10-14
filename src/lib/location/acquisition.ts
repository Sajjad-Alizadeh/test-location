import { LocationEngine, type SampleResult } from "./engine";
import type { Event } from "./machine";
import type { Fix } from "./types";

export const ACQUISITION_LIMITS = { budgetMs: 15000, probeTimeoutMs: 5000, pollMs: 2500, lockedPollMs: 5000, staleMs: 30000 } as const;
export type AcquisitionEnvironment = {
  secure: boolean;
  geolocation: Pick<Geolocation, "watchPosition" | "getCurrentPosition" | "clearWatch"> | null;
  now: () => number;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (id: number) => void;
  onResume: (callback: () => void) => () => void;
};
const rejectionMessages: Record<Extract<SampleResult, { accepted: false }>["reason"], string> = {
  outside: "موقعیت گزارش‌شده خارج از ایران است. لطفاً محل بیمار را روی نقشه انتخاب کنید.",
  stale: "مرورگر هنوز موقعیت تازه‌ای نداده است. می‌توانید محل را روی نقشه انتخاب کنید.",
  jump: "موقعیت گزارش‌شده پایدار نیست. لطفاً محل بیمار را روی نقشه انتخاب کنید.",
  invalid: "موقعیت قابل اعتماد دریافت نشد. لطفاً محل بیمار را روی نقشه انتخاب کنید.",
};

/** One acquisition run. All deadlines/late callbacks are owned by this run, independently of React rendering. */
export function acquireLocation(environment: AcquisitionEnvironment, emit: (event: Event) => void, onBlocked: () => void): () => void {
  const { geolocation } = environment;
  const startedAt = environment.now();
  const engine = new LocationEngine(startedAt);
  const timers = new Set<number>();
  let active = true;
  let watch: number | undefined;
  const listener = { unsubscribe: () => {} };
  let latest: Fix | null = null;
  let lockedFix: Fix | null = null;
  let rejection: string | null = null;
  let probeSequence = 0;
  let inFlight = false;
  let deadline: number | undefined;

  function stop() {
    if (!active) return;
    active = false;
    if (watch !== undefined) geolocation?.clearWatch(watch);
    for (const id of timers) environment.clearTimer(id);
    timers.clear();
    listener.unsubscribe();
  }
  function schedule(callback: () => void, delay: number) {
    const id = environment.setTimer(() => { timers.delete(id); if (active) callback(); }, delay);
    timers.add(id);
    return id;
  }
  function finish(message: string, clearFix = false) {
    if (!active) return;
    stop();
    emit({ type: "FALLBACK", message, clearFix });
  }
  function fallbackMessage() {
    if (latest) return "موقعیت تقریبی پیدا شد. لطفاً محل دقیق و ورودی بیمار را روی نقشه بررسی کنید.";
    return rejection ?? "موقعیت پیدا نشد. لطفاً محل بیمار را روی نقشه انتخاب کنید یا دوباره تلاش کنید.";
  }
  function checkDeadline(): boolean {
    if (!active) return true;
    const candidate = lockedFix ?? latest;
    if (candidate && environment.now() - candidate.timestamp > ACQUISITION_LIMITS.staleMs) {
      finish("موقعیت قبلی تازه نیست. دوباره پیدا کنید یا محل بیمار را روی نقشه انتخاب کنید.", true);
      return true;
    }
    if (!lockedFix && environment.now() - startedAt >= ACQUISITION_LIMITS.budgetMs) {
      finish(fallbackMessage());
      return true;
    }
    return false;
  }
  function success(position: GeolocationPosition) {
    if (checkDeadline()) return;
    const result = engine.ingest({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp, source: "gps" }, environment.now());
    if (!result.accepted) {
      rejection = rejectionMessages[result.reason];
      if (!lockedFix) emit({ type: "LOCATION_PROGRESS", message: rejection });
      return;
    }
    latest = result.fix;
    if (result.locked) {
      lockedFix = result.fix;
      if (deadline !== undefined) { environment.clearTimer(deadline); timers.delete(deadline); deadline = undefined; }
      emit({ type: "SAMPLE", fix: result.fix, locked: true });
    } else if (!lockedFix) {
      emit({ type: "SAMPLE", fix: result.fix, locked: false });
      emit({ type: "LOCATION_PROGRESS", message: "موقعیت تقریبی پیدا شد؛ در حال بررسی محل دقیق‌تر هستیم. می‌توانید خودتان نقشه را تنظیم کنید." });
    }
    // Never downgrade a fresh accurate lock to an unbounded calibration spinner.
    // Poorer samples cannot replace it. The independent freshness check eventually expires it.
  }
  function error(value: GeolocationPositionError) {
    if (checkDeadline()) return;
    if (value.code === 1) {
      finish("دسترسی به موقعیت بسته است. می‌توانید محل خود را روی نقشه انتخاب کنید.", true);
      onBlocked();
    } else {
      rejection = value.code === 3 ? "پیدا کردن موقعیت طول کشید. لطفاً محل بیمار را روی نقشه انتخاب کنید." : "مرورگر نتوانست موقعیت را پیدا کند. لطفاً محل بیمار را روی نقشه انتخاب کنید.";
      if (!lockedFix && !latest) emit({ type: "LOCATION_PROGRESS", message: rejection });
    }
  }
  function probe() {
    if (checkDeadline() || inFlight || !geolocation) return;
    inFlight = true;
    const sequence = ++probeSequence;
    // Browser permission dialogs/background tabs can delay the native timeout; own guard releases this probe.
    const guard = schedule(() => { if (sequence === probeSequence) { inFlight = false; probeSequence++; } }, ACQUISITION_LIMITS.probeTimeoutMs);
    const complete = (callback: () => void) => {
      if (!active || sequence !== probeSequence) return;
      environment.clearTimer(guard); timers.delete(guard); inFlight = false;
      callback();
    };
    try {
      geolocation.getCurrentPosition(position => complete(() => success(position)), value => complete(() => error(value)), { enableHighAccuracy: true, maximumAge: 0, timeout: ACQUISITION_LIMITS.probeTimeoutMs });
    } catch {
      complete(() => { rejection = "مرورگر نتوانست موقعیت تازه‌ای بدهد. محل بیمار را روی نقشه انتخاب کنید."; });
    }
  }
  function tick() {
    if (checkDeadline()) return;
    probe();
    if (active) schedule(tick, lockedFix ? ACQUISITION_LIMITS.lockedPollMs : ACQUISITION_LIMITS.pollMs);
  }

  emit({ type: "REQUEST" });
  if (!environment.secure || !geolocation) {
    finish("دسترسی به موقعیت در این مرورگر ممکن نیست. محل خود را روی نقشه انتخاب کنید.", true);
    onBlocked();
    return stop;
  }
  deadline = schedule(() => { checkDeadline(); }, ACQUISITION_LIMITS.budgetMs);
  listener.unsubscribe = environment.onResume(() => { if (!checkDeadline()) probe(); });
  try {
    const id = geolocation.watchPosition(success, error, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    if (active) watch = id;
    else geolocation.clearWatch(id); // Covers synchronous native/WebView callbacks.
  } catch {
    finish("مرورگر به موقعیت دسترسی ندارد. محل بیمار را روی نقشه انتخاب کنید.", true);
    onBlocked();
  }
  if (active) tick();
  return stop;
}
