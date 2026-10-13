import { isIP } from "node:net";
// Only configure a header that the trusted ingress OVERWRITES. Never trust arbitrary X-Forwarded-For.
export function trustedClientIp(request: Request): string | undefined {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!header || !["cf-connecting-ip", "x-real-ip"].includes(header.toLowerCase())) return;
  const ip = request.headers.get(header)?.trim();
  if (!ip || !isIP(ip)) return;
  if (isIP(ip) === 4) {
    const octets = ip.split(".").map(Number);
    if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || octets[0] >= 224 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 169 && octets[1] === 254) return;
  } else if (ip === "::1" || ip === "::" || /^(fc|fd|fe80|::ffff:)/i.test(ip)) return;
  return ip;
}
