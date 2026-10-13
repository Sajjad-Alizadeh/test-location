import { test } from "node:test";
import assert from "node:assert/strict";
import { newToken, tokenHash, validToken } from "../src/lib/server/tokens";
import { trustedClientIp } from "../src/lib/server/client-ip";
test("Opaque emergency tokens are 256-bit URL-safe credentials, unique and hash-only at rest", () => {
  const first = newToken(), second = newToken();
  assert.equal(validToken(first), true); assert.notEqual(first, second);
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.equal(tokenHash(first).length, 64); assert.notEqual(tokenHash(first), first);
  assert.notEqual(tokenHash(first), tokenHash(second));
});
test("Token format rejects URLs, padding, unexpected alphabet and missing tokens", () => {
  for (const input of [null, undefined, 123, "", "A".repeat(42), "A".repeat(44), "!".repeat(43), "https://example.ir/token"]) assert.equal(validToken(input), false);
});
test("Client IP is unavailable unless an explicit trusted ingress header is configured", () => {
  const saved = process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    assert.equal(trustedClientIp(new Request("https://example.ir", { headers: { "X-Real-IP": "8.8.8.8", "X-Forwarded-For": "8.8.8.8" } })), undefined);
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-forwarded-for";
    assert.equal(trustedClientIp(new Request("https://example.ir", { headers: { "X-Forwarded-For": "8.8.8.8" } })), undefined);
  } finally { if (saved === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER; else process.env.TRUSTED_CLIENT_IP_HEADER = saved; }
});
test("Configured ingress IP rejects malformed, list, loopback and private addresses", () => {
  const saved = process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
    for (const ip of ["127.0.0.1", "192.168.1.1", "10.0.0.1", "172.16.1.1", "::1", "fd00::1", "8.8.8.8,1.1.1.1", "bad"]) assert.equal(trustedClientIp(new Request("https://example.ir", { headers: { "X-Real-IP": ip } })), undefined);
    assert.equal(trustedClientIp(new Request("https://example.ir", { headers: { "X-Real-IP": "8.8.8.8" } })), "8.8.8.8");
  } finally { if (saved === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER; else process.env.TRUSTED_CLIENT_IP_HEADER = saved; }
});
