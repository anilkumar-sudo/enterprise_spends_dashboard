# Deployment Status

## Ready for deployment

- The final dashboard UI is in `Final B2B Dashboard.html`.
- The deployable Worker is generated at `cloudflare-worker/worker.js`.
- The Worker serves the UI and `/api`; the transparent Cult for Corporates logo is embedded in the generated production HTML.
- The Worker reads `Marketing Detail Spends`, `Payments Tracker`, `Vendors & Agencies`, and `Budget` live from Google Sheets on each authenticated `/api` request, with the embedded snapshot retained as a local fallback.
- Workers KV is configured through the `APP_STATE` binding.
- Company viewer and restricted editor permissions are enforced in the Worker.
- The target GitHub deployment branch is `codex/pages-final-dashboard`; confirm the Anil editor update has been synced before a Git-based deployment.

## Approved editors

- `nikhil.zutshi@curefit.com`
- `divya.agarwal@curefit.com`
- `alvina.davidson@curefit.com`
- `arjit.shukla@curefit.com`
- `anil.kumar@curefit.com`

## Viewer policy

- Authenticated `@curefit.com` and `@cultfit.in` users receive viewer access.
- Viewers can see Overview and all Spend Category tabs.
- Spend Forecast and all Operations tabs are editor-only.
- External domains are denied access.
- Viewer write attempts are rejected server-side.

## Cloudflare target

- Account: `cultfit`
- Account ID: `0909e93fab580fc177ba0f6b9f44155b`
- Zone: `cultfit.in`
- Zone ID: `b1790e90e2e45a45e17ef0495ca619f6`
- Worker name: `b2b-enterprise-spends-dashboard`
- Existing URL: `https://b2b-enterprise-spends-dashboard.cultfit.workers.dev/`
- Preferred custom URL: `b2b-spend-dashboard.cultfit.in`

## Current live check

On August 7, 2026, unauthenticated requests to both `/` and `/api` returned `403`, confirming that Cloudflare Access protects the live endpoint. The deployed code version cannot be verified anonymously.

## Remaining deployment work

1. Authenticate Wrangler or the Cloudflare Git integration with Worker deployment rights.
2. Deploy from GitHub branch `codex/pages-final-dashboard` using `cloudflare-worker` as the deployment root.
3. Confirm or create the `APP_STATE` KV binding.
4. Verify the Cloudflare Access policy forwards `cf-access-authenticated-user-email`.
5. Test one approved editor, one company viewer, and one external identity.
6. Attach `b2b-spend-dashboard.cultfit.in` only after the `workers.dev` deployment passes verification.
7. Verify the authenticated response reports `source.mode: live-google-sheet` and that a controlled Sheet edit appears after refreshing the dashboard.

## Local deployment commands

```bash
cd cloudflare-worker
npm ci
npm run build
npx wrangler deploy
```

## Success criteria

- `/api` returns authenticated JSON rather than `404`.
- An approved editor sees `Editor access` and all tabs.
- A company viewer sees `View only`, cannot see restricted tabs, and cannot write.
- External identities cannot access the application.
- Changes persist after refresh through Workers KV.
- Overview reports 120 transactions, ₹3.74 crore spend, and ₹11.39 crore effective budget.
