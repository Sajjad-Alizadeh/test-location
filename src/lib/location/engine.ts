import { distance, inIran } from "./geometry";
import type { Fix } from "./types";

export type SampleResult = { accepted: false; reason: "invalid" | "stale" | "outside" | "jump" } | { accepted: true; fix: Fix; locked: boolean };
export class LocationEngine {
  private samples: Fix[] = [];
  private lastAccepted: Fix | null = null;
  constructor(private readonly startedAt: number) {}
  ingest(fix: Fix, now: number): SampleResult {
    if (fix.source !== "gps" || fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy <= 0 || fix.accuracy > 10000 || !Number.isFinite(fix.timestamp)) return { accepted: false, reason: "invalid" };
    if (now - fix.timestamp > 15000 || fix.timestamp > now + 2000 || (this.lastAccepted?.timestamp ?? 0) >= fix.timestamp) return { accepted: false, reason: "stale" };
    if (!inIran(fix)) return { accepted: false, reason: "outside" };
    const previous = this.lastAccepted;
    if (previous) {
      const seconds = (fix.timestamp - previous.timestamp) / 1000;
      const travel = Math.max(0, distance(previous, fix) - (previous.accuracy ?? 0) - fix.accuracy);
      if (travel / seconds > 50) return { accepted: false, reason: "jump" };
    }
    this.lastAccepted = fix;
    this.samples = this.samples.filter(s => now - s.timestamp <= 15000);
    // Dense watch/probe bursts must not continually evict the two-second stability history.
    if (!this.samples.length || fix.timestamp - this.samples[this.samples.length - 1].timestamp >= 1000) this.samples = [...this.samples, fix].slice(-5);
    // Relax to 65m after 12 seconds, never call a broad regional estimate precise.
    const threshold = now - this.startedAt > 12000 ? 65 : 35;
    const recent = this.samples.slice(-3);
    const locked = recent.length === 3 && recent[2].timestamp - recent[0].timestamp >= 2000 && recent.every(s => (s.accuracy ?? Infinity) <= threshold && distance(s, fix) <= Math.max(30, (s.accuracy ?? 0) + fix.accuracy!));
    // Do not shrink uncertainty by averaging correlated browser fixes.
    const accuracy = Math.max(fix.accuracy, ...recent.map(s => (s.accuracy ?? 0) + distance(s, fix)));
    return { accepted: true, fix: { ...fix, accuracy }, locked: locked && accuracy <= threshold };
  }
}
export function freshFix(fix: Fix | null, now = Date.now()): boolean {
  return !!fix && (fix.source === "manual" || (fix.source === "gps" ? now - fix.timestamp <= 30000 : now - fix.timestamp <= 120000));
}
