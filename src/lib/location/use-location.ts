"use client";
import { useCallback, useEffect, useRef } from "react";
import { acquireLocation } from "./acquisition";
import type { Event } from "./machine";

export function useLocationAcquisition(emit: (event: Event) => void, onBlocked: () => void) {
  const cleanup = useRef<(() => void) | null>(null);
  const callbacks = useRef({ emit, onBlocked });
  useEffect(() => { callbacks.current = { emit, onBlocked }; }, [emit, onBlocked]);
  const stop = useCallback(() => { cleanup.current?.(); cleanup.current = null; }, []);
  const start = useCallback(() => {
    stop();
    cleanup.current = acquireLocation({
      secure: window.isSecureContext,
      geolocation: navigator.geolocation ?? null,
      now: Date.now,
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: id => window.clearTimeout(id),
      onResume: callback => {
        const resume = () => { if (document.visibilityState === "visible") callback(); };
        document.addEventListener("visibilitychange", resume);
        window.addEventListener("pageshow", callback);
        return () => { document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", callback); };
      },
    }, event => callbacks.current.emit(event), () => callbacks.current.onBlocked());
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { start, stop };
}
