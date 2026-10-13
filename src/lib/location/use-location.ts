"use client";
import { useCallback, useEffect, useRef } from "react";
import { LocationEngine } from "./engine";
import type { Event } from "./machine";

export function useLocationAcquisition(emit: (event: Event) => void, onBlocked: () => void) {
  const cleanup = useRef<(() => void) | null>(null);
  const callbacks = useRef({ emit, onBlocked });
  useEffect(() => { callbacks.current = { emit, onBlocked }; }, [emit, onBlocked]);
  const stop = useCallback(() => { cleanup.current?.(); cleanup.current = null; }, []);
  const start = useCallback(() => {
    stop();
    callbacks.current.emit({ type: "REQUEST" });
    if (!window.isSecureContext || !navigator.geolocation) {
      callbacks.current.emit({ type: "FALLBACK", message: "دسترسی به موقعیت در این مرورگر ممکن نیست. محل خود را روی نقشه انتخاب کنید." });
      callbacks.current.onBlocked();
      return;
    }
    const engine = new LocationEngine(Date.now());
    let active = true;
    let watch: number | undefined;
    let lastLockedAt = 0;
    const fallback = (message: string) => {
      if (!active) return;
      callbacks.current.emit({ type: "FALLBACK", message });
      stop();
    };
    const deadline = window.setTimeout(() => fallback("موقعیت دقیق پیدا نشد. لطفاً محل خود را روی نقشه انتخاب کنید."), 20000);
    const staleTimer = window.setInterval(() => {
      if (lastLockedAt && Date.now() - lastLockedAt > 30000) fallback("موقعیت قبلی تازه نیست. دوباره پیدا کنید یا نقشه را تنظیم کنید.");
    }, 5000);
    cleanup.current = () => {
      active = false;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      clearTimeout(deadline);
      clearInterval(staleTimer);
    };
    try {
      watch = navigator.geolocation.watchPosition(position => {
        if (!active) return;
        const result = engine.ingest({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp, source: "gps" }, Date.now());
        if (!result.accepted) return;
        if (result.locked) { clearTimeout(deadline); lastLockedAt = Date.now(); }
        callbacks.current.emit({ type: "SAMPLE", fix: result.fix, locked: result.locked });
      }, error => {
        if (!active) return;
        if (error.code === 1) {
          fallback("دسترسی به موقعیت بسته است. می‌توانید محل خود را روی نقشه انتخاب کنید.");
          callbacks.current.onBlocked();
        } else {
          fallback(error.code === 3 ? "پیدا کردن موقعیت طول کشید. نقشه را روی محل خود تنظیم کنید." : "موقعیت در دسترس نیست. محل خود را روی نقشه انتخاب کنید.");
        }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    } catch {
      fallback("مرورگر به موقعیت دسترسی ندارد. نقشه را تنظیم کنید.");
      callbacks.current.onBlocked();
    }
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { start, stop };
}
