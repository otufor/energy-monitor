# Cloudflare Pages deploy debug handoff

Date: 2026-03-26

## Situation
- Target URL: https://energy-monitor-8sa.pages.dev/
- The page shell loads, but dashboard data requests fail in the browser.

## Confirmed findings
- Browser console shows CORS failures from `https://energy-monitor-8sa.pages.dev` to `https://energy-monitor-workers.mh076144.workers.dev`.
- Workers default CORS allowlist did not include preview subdomains like `*.pages.dev`.
- Dashboard bundle was sending `X-Api-Key` even when `VITE_API_KEY` was empty, which triggers a preflight.
- Direct requests to the Workers API without a key returned `401 Unauthorized`.
- Deploy workflow injects `VITE_WORKERS_API_URL` but not `VITE_API_KEY`.
- Docs also do not document `VITE_API_KEY`, which suggests the current client-side API key flow is incomplete or unintended.

## Changes made
- `apps/workers/src/index.ts`
  - Allow Cloudflare Pages preview origins matching `https://*.pages.dev`.
  - Keep exact allowlist support for configured origins.
  - Change `/api/*` auth so `GET` endpoints are public and non-GET endpoints still require `X-Api-Key`.
- `apps/dashboard/src/hooks/usePowerData.ts`
  - Stop sending `X-Api-Key` when `VITE_API_KEY` is empty.
- `apps/workers/tests/api.test.ts`
  - Add coverage for Pages preview origin CORS.
  - Add coverage for public GET and protected POST auth behavior.

## Remaining verification
- Run checks from WSL:
  - `vp check`
  - `vp test apps/workers/tests/api.test.ts`
- Redeploy Workers after the code change.
- Re-open `https://energy-monitor-8sa.pages.dev/` and confirm dashboard data loads.

## Notes
- I could not complete local validation in this PowerShell session because `vp` was not runnable from this environment and the sandbox/apply_patch path handling was unstable.
- The code edits were written directly to the working tree and should be reviewed in WSL before deploy.
