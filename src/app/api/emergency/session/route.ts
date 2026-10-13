import { trustedClientIp } from "@/lib/server/client-ip";
import { cookies } from "next/headers";
import { assertOrigin, failure, json, readBody, HttpError } from "@/lib/server/http";
import { COOKIE, publicSession, resolveSession, validToken } from "@/lib/server/session";
export async function GET(request: Request) {
  try { return json(publicSession(await resolveSession(undefined, trustedClientIp(request)))); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { token } = await readBody(request);
    if (!validToken(token)) throw new HttpError(401, "Invalid emergency link");
    const session = await resolveSession(token, trustedClientIp(request));
    (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/emergency", maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) });
    return json(publicSession(session));
  } catch (error) { return failure(error); }
}
