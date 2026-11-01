# Deployment

## Vercel

1. Import `Cabberefwenf/ServiceOPS` as a Next.js project.
2. Use the repository root and default build command `npm run build`.
3. No secrets or database are required. `NEXT_PUBLIC_DEMO_MODE=synthetic` is optional because synthetic mode is the default.
4. Deploy from the verified `main` commit.
5. Check response headers, desktop/mobile launch, the guided work-order flow, scenario reset, and exact deployed commit before publishing the URL.

Embedding is allowed only for the configured first-party portfolio/Vercel frame ancestors; direct launch remains the supported default. Expand `frame-ancestors` only after the portfolio origin is known.

## Verified release record

- Canonical public URL: <https://serviceops-phi.vercel.app>
- Portfolio origin: <https://veldariumworth.com/> (the application links back to this origin; no deployment ownership is implied)
- Vercel project: `serviceops` (`prj_zqjibfLJmzFpD6mNADaMF3dlwOlh`)
- Production branch: `main`
- Initial verified application commit: `6a32497ee03df3f6539ee1d1b61ff3c05c324c24`
- Initial deployment: `dpl_7gvhvA9BvaiXhFTnagvnT673cwvF`, state `READY`
- Browser acceptance: urgent work order assignment through closure, inventory consumption, financial receipt, scenario isolation/reset, and mobile navigation.

The default `serviceops-phi.vercel.app` alias is the supported direct launch. No custom domain has been purchased or configured.

## Publication verification

After a preview or production deployment, verify the rendered HTML and metadata endpoints against the exact deployed commit:

```bash
curl -fsS https://serviceops-phi.vercel.app | grep -E 'canonical|og:title|twitter:card|application/ld\+json'
curl -fsS https://serviceops-phi.vercel.app/robots.txt
curl -fsS https://serviceops-phi.vercel.app/sitemap.xml
curl -fsSI https://serviceops-phi.vercel.app/opengraph-image
```

The canonical URL must remain the verified Vercel alias until a founder-authorized deployment or domain change is complete. Do not advertise a preview URL, a portfolio origin, or an unverified custom domain as canonical.
