import "server-only";
import { tokenHash, validToken } from "./tokens";
export { tokenHash, validToken } from "./tokens";
import { cookies } from "next/headers";
import { gateway, object } from "./gateway";
import { HttpError, text } from "./http";
import { inIran } from "../location/geometry";
import type { Fix, Session } from "../location/types";
export const COOKIE = "emergency_session";
export async function resolveSession(token?: string, clientIp?: string): Promise<Session & { hash: string }> {
  const credential = token ?? (await cookies()).get(COOKIE)?.value;
  if (!validToken(credential)) throw new HttpError(401, "Invalid emergency link");
  const hash = tokenHash(credential);
  const data = object(await gateway("sessions/resolve", { tokenHash: hash, ...(clientIp ? { clientIp } : {}) }));
  if (!text(data.incidentId, 1, 80) || !text(data.phoneHint, 1, 20) || !/[•*xX]/.test(data.phoneHint) || /[0-9۰-۹]{5}/.test(data.phoneHint) || !Number.isFinite(data.expiresAt) || typeof data.lbsPending !== "boolean") throw new HttpError(502, "Invalid session reply");
  const expiresAt = data.expiresAt as number;
  if (expiresAt <= Date.now() || expiresAt > Date.now() + 3600000) throw new HttpError(410, "Emergency link expired");
  let coarse: Fix | null = null;
  if (data.coarse) {
    const candidate = object(data.coarse);
    const point = { lat: candidate.lat as number, lng: candidate.lng as number };
    if (inIran(point) && ["carrier", "ip"].includes(candidate.source as string) && typeof candidate.accuracy === "number" && Number.isFinite(candidate.accuracy) && candidate.accuracy >= 100 && candidate.accuracy <= 100000 && typeof candidate.timestamp === "number" && candidate.timestamp <= Date.now() + 2000 && Date.now() - candidate.timestamp < 120000) {
      coarse = { ...point, accuracy: candidate.accuracy, source: candidate.source as "carrier" | "ip", timestamp: candidate.timestamp };
    }
  }
  return { incidentId: data.incidentId, phoneHint: data.phoneHint, expiresAt, lbsPending: data.lbsPending, coarse, hash };
}
export function publicSession(session: Session): Session {
  return { incidentId: session.incidentId, phoneHint: session.phoneHint, expiresAt: session.expiresAt, coarse: session.coarse, lbsPending: session.lbsPending };
}
