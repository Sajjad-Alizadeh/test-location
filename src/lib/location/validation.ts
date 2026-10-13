import { inIran } from "./geometry";
import { freshFix } from "./engine";
import type { DispatchPayload, Fix } from "./types";
export function validPayload(value: Record<string, unknown>, now = Date.now(), requireFresh = true): value is Record<string, unknown> & DispatchPayload {
  const fix = value.location as Fix | undefined;
  const device = value.device as DispatchPayload["device"] | undefined;
  const string = (v: unknown, min: number, max: number) => typeof v === "string" && v.trim().length >= min && v.length <= max;
  return !!fix && inIran(fix) && ["gps", "carrier", "ip", "manual"].includes(fix.source) && typeof fix.timestamp === "number" && Number.isFinite(fix.timestamp) && fix.timestamp <= now + 2000 && (!requireFresh || freshFix(fix, now)) &&
    (fix.source === "manual" ? fix.accuracy === null : typeof fix.accuracy === "number" && Number.isFinite(fix.accuracy) && fix.accuracy > 0 && fix.accuracy <= 100000) &&
    value.verified === true && string(value.address, 3, 500) && ["reverse", "patient"].includes(value.addressSource as string) && string(value.details, 0, 500) &&
    !!device && string(device.userAgent, 0, 512) && string(device.language, 0, 40) && string(device.platform, 0, 100) && string(device.viewport, 1, 30);
}

// Construct a whitelist after validation. Never forward caller-supplied incident,
// token, provider flags, or extra nested fields into the trusted dispatch envelope.
export function cleanPayload(value: DispatchPayload): DispatchPayload {
  return {
    location: { lat: value.location.lat, lng: value.location.lng, source: value.location.source, accuracy: value.location.accuracy, timestamp: value.location.timestamp },
    address: value.address.trim(), addressSource: value.addressSource, details: value.details.trim(), verified: true,
    device: { userAgent: value.device.userAgent, language: value.device.language, platform: value.device.platform, viewport: value.device.viewport },
  };
}
