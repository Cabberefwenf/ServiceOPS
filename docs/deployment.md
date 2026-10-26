# Deployment

## Vercel

1. Import `Cabberefwenf/ServiceOPS` as a Next.js project.
2. Use the repository root and default build command `npm run build`.
3. No secrets or database are required. `NEXT_PUBLIC_DEMO_MODE=synthetic` is optional because synthetic mode is the default.
4. Deploy from the verified `main` commit.
5. Check response headers, desktop/mobile launch, the guided work-order flow, scenario reset, and exact deployed commit before publishing the URL.

Embedding is allowed only for the configured first-party portfolio/Vercel frame ancestors; direct launch remains the supported default. Expand `frame-ancestors` only after the portfolio origin is known.
