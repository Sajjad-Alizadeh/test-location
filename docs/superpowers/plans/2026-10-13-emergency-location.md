# Emergency Location Implementation Plan

> Execute inline within the authorized checkout. Review each completed boundary before continuing.

**Goal:** Build an accessible Persian patient location flow with honest precision, resilient fallback, and authenticated dispatch integration.

**Architecture:** Pure location validation and state transitions feed an isolated acquisition hook and accessible slippy map. Next.js route handlers exchange opaque SMS tokens for HttpOnly cookies and proxy a durable dispatch gateway. Demo never calls dispatch.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, strict TypeScript, native browser APIs, Node test runner.

## Global constraints

Persian RTL; self-hosted Vazirmatn; minimum 56px touch targets. Reject samples outside Iran and speeds above 180 km/h. Never infer fine GPS accuracy from carrier/IP regions or manual selection. Never report successful delivery without a durable dispatch acknowledgement. No sensitive browser persistence.

### 1. Location engine and state machine

Files: `src/lib/location/{types,geometry,engine,machine}.ts`, `src/lib/location/iran.json`, `tests/location.test.ts`.

- [x] Define timestamped fixes, source, uncertainty, and immutable transition events.
- [x] Validate fresh finite samples, Iran polygon, velocity after uncertainty, and three-sample stability. Preserve conservative reported radius.
- [x] Test rejection, stable lock, manual override, stale fix, and retry transitions using `npm test`.

### 2. Secure service boundary

Files: `src/lib/server/{gateway,http,session}.ts`, `src/app/api/emergency/**/route.ts`, `src/lib/location/services.ts`.

- [x] Create opaque 256-bit tokens; persist only hashes with incident/phone and expiry through a durable gateway.
- [x] Require dispatcher credentials, same-origin JSON patient requests, bounded bodies, provider timeouts, validated replies, and idempotent dispatch acknowledgements.
- [x] Document gateway transactional SMS/LBS queue contract and deployment configuration.

### 3. Patient experience

Files: `src/components/emergency/{EmergencyApp,LocationMap,PermissionHelp,Icon}.tsx`, acquisition hook, app entry, layout, CSS.

- [x] Apply ink `#183c36`, green `#087f65`, pale mint `#edf6f2`, white surfaces, restrained amber errors. Bold Persian headlines and regular Persian body; system utility type for browser diagrams only.
- [x] Build responsive map-plus-verification layout, central crosshair, zoom, tap/keyboard movement, landmark search, address details, and explicit patient verification.
- [x] Handle denied permissions, WebViews, 20-second fallback, offline retry, stale GPS, and expired links. Stop GPS on manual edit/unmount/submission.

### 4. Verification and handoff

- [x] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- [x] Browser-check desktop/mobile layout and demo/manual/submission/error paths when browser execution permits.
- [x] Update README with adapter contracts, precision limitations, device test matrix, and operational prerequisites.

## Delivered verification

30 unit tests; typecheck; ESLint; production build. Chrome browser smoke covers responsive layouts, 56px controls, visual permission guide, search, sample-only receipt, invalid links, mocked GPS stabilization and manual override, and identical-payload/idempotency retry. Real gateway and physical iOS/Android acceptance remain operational prerequisites documented in README.
