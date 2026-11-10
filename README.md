# Yiyi Shipping Assistant (Next.js)

Next.js migration of the v5 **一一妈咪好物团** shipping ops dashboard.

- **Do not modify** production chatgpt.site: https://yiyi-shipping-assistant.tangwenyuan1208.chatgpt.site
- Legacy v5 tree is preserved under `legacy/` (and still at repo root `dist/`, `worker/`, `scripts/`).
- **No production deploy** until tests pass, preview is verified, and an operator explicitly approves.

## Stack

- Next.js App Router + TypeScript strict
- Auth.js (next-auth v5) Google login + `ALLOWED_EMAILS`
- Google Sheets via service account (server-only)
- Shippo **test tokens only** (`shippo_test_…`, `was_test === true`)
- Zod validation, Vitest unit tests

## Quick start

```bash
cp .env.example .env.local
# fill values — never commit .env.local
npm install
npm run dev
```

Without Google/Shippo credentials the app uses an in-memory Sheets mock and reports Shippo as unconfigured.

## Environment (names only)

See `.env.example`:

| Name                                                  | Purpose                        |
| ----------------------------------------------------- | ------------------------------ |
| `GOOGLE_SHEET_ID`                                     | Spreadsheet ID (server-owned)  |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`                        | Sheets SA email                |
| `GOOGLE_PRIVATE_KEY`                                  | SA private key (`\n` escaped)  |
| `AUTH_SECRET`                                         | Auth.js secret                 |
| `GOOGLE_AUTH_CLIENT_ID` / `GOOGLE_AUTH_CLIENT_SECRET` | Google OAuth                   |
| `ALLOWED_EMAILS`                                      | Comma-separated allowlist      |
| `SHIPPO_TEST_TOKEN`                                   | Must start with `shippo_test_` |
| `NEXTAUTH_URL`                                        | App URL                        |

### Google Cloud / Sheets setup

1. Create a GCP project service account with Sheets scope only as needed.
2. Share **only** spreadsheet `1pq7nXgsUB9x0TAHMeu1-3FZwjMZl_MhBToHQdYcArOE` with the SA email (Editor if writes required).
3. Tabs: `自提`, `邮寄`, `三谷`, `95008`, `shippo` (fee table — not orders), `完成记录` (append-only archive).
4. Configure Google OAuth client for Auth.js; set `ALLOWED_EMAILS` to operator emails.

### Vercel

1. Import this repo / branch `vercel-next` as a **preview** project.
2. Set the env vars above in the Vercel project (never commit secrets).
3. Deploy preview only until operators approve production cutover.
4. Rollback: keep chatgpt.site live; revert Vercel to previous deployment or pause the project.

## Scripts

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

## Security notes

- Never commit `.env`, keys, spreadsheet exports, or customer CSVs.
- No `NEXT_PUBLIC_` secrets.
- Mutating APIs require session + allowlist + same-origin `Origin`.
- Spreadsheet ID, allowed tabs, and column mapping are server-owned — never trust client-supplied sheet IDs/ranges.
- Live Shippo tokens are refused.

## Verification checklist (before any production cutover)

- [ ] Google login works; non-allowlisted email → 403
- [ ] Unauthenticated API → 401
- [ ] Orders refresh from Sheet; failed refresh keeps last data marked stale
- [ ] Status write requires confirm + fingerprint; conflict on change
- [ ] Import preview then confirm; duplicate signatures skipped
- [ ] Archive append-first; delete failure resumable by op ID
- [ ] Shippo rates/labels only with test token + `was_test`
- [ ] Explicit user approval before replacing chatgpt.site
