# Legacy v5 tree (preserved)

Copied from GitHub `main` at `aa3b8a2` during the Next.js migration.

Contains the chatgpt.site static UI + worker:

- `dist/` — orders/shipping HTML/JS, workbook readers, shippo client, built worker bundle
- `worker/server.js` — test-only Shippo API + asset handler
- `scripts/build.mjs` — embeds static assets into `dist/server/index.js`

Do not delete until the Next.js app passes tests and production verification.
The original commit `f448a9d…` was not present on the remote; this upload tree is the behavioral source used for the port.

**Important:** These files must stay under `legacy/` only. Do not copy them into repo-root `dist/` or `public/`. Legacy `dist/index.html` meta-refreshes to `./orders.html`, and the worker maps `/` → `/orders.html` — publishing that tree as Vercel Output Directory (or as `public/` static files) makes Preview open the old UI instead of the Next.js app.
