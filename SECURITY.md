# Security policy

Report suspected vulnerabilities privately to the repository owner rather than opening a public issue. ServiceOPS public demo data is synthetic and local to the browser. Do not place real customer information, credentials, API keys, or production integrations in this repository. Imported or persisted data must be schema-validated and size-bounded. The browser state is never an authorization boundary.

## Dependency audit status

The 2026-10-31 release audit reported zero vulnerabilities in production dependencies (`npm audit --omit=dev`). The full development tree reported 18 moderate findings, all inherited through the ESLint/Next.js lint toolchain and the `minimatch` glob-amplification advisory (`GHSA-g3hv-75wg-m249`). npm did not offer a compatible direct fix for the pinned toolchain. These packages do not ship in the browser production bundle; they remain tracked as build-time risk and must be reassessed with routine dependency updates rather than bypassed with a forced incompatible upgrade.
