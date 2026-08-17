# Final B2B Dashboard - Deployment Handoff for Anil

## Objective

Deploy the latest authenticated Cult Enterprise B2B Spend Dashboard to Cloudflare, with company-wide viewer access and restricted editor access.

## Source of truth

- Latest production package: `Final B2B Dashboard - Production Assets.zip`
- GitHub repository: `https://github.com/cultsport/cult-enterprise-marketing.git`
- Target deployment branch: `codex/pages-final-dashboard`
- Current Cloudflare service: `cult-enterprise-marketing`
- Existing URL: `https://cult-enterprise-marketing.cultfit.workers.dev/`
- Preferred custom URL: `b2b-spend-dashboard.cultfit.in`

As of August 7, 2026, unauthenticated requests to both `/` and `/api` return `403`. This confirms Cloudflare Access is active, but the currently deployed code version must be verified after signing in or redeploying the branch above.

The local production package contains Anil's editor access update. Before deploying through Cloudflare's Git integration, confirm the target branch contains `anil.kumar@curefit.com` in `cloudflare-worker/worker.template.js` and the generated `cloudflare-worker/worker.js`. Alternatively, deploy directly from the production package using Wrangler.

## Access model

Cloudflare Access must authenticate users and forward the authenticated email in the `cf-access-authenticated-user-email` request header.

Viewer access is allowed for authenticated users on these company domains:

- `@curefit.com`
- `@cultfit.in`

Approved editors:

- `nikhil.zutshi@curefit.com`
- `divya.agarwal@curefit.com`
- `alvina.davidson@curefit.com`
- `arjit.shukla@curefit.com`
- `anil.kumar@curefit.com`

Viewers can access Overview and all Spend Category tabs. Spend Forecast and every Operations tab are editor-only. The Worker also rejects viewer write requests server-side.

## Production files

- `Final B2B Dashboard.html`: dashboard UI and client-side application
- `assets/cult-for-corporates-logo-white.png`: active transparent Cult for Corporates logo asset
- `assets/google-sheet-snapshot.js`: versioned FY26-27 data import from the approved marketing spend Sheet
- `cloudflare-worker/worker.template.js`: editable Worker source and access rules
- `cloudflare-worker/build-worker.mjs`: builds the deployable Worker
- `cloudflare-worker/worker.js`: generated deployable Worker
- `cloudflare-worker/wrangler.jsonc`: Cloudflare Worker and KV configuration
- `cloudflare-worker/package.json`: build and deployment commands
- `cloudflare-worker/package-lock.json`: locked deployment dependencies
- `backend/`: optional Google Sheets / Apps Script fallback; not required by the Cloudflare KV deployment

## Imported production data

Source Sheet:

- `https://docs.google.com/spreadsheets/d/1Pbr5E2EOmpI0WcpNfmlO5-Hr_SX9u4lqfFSXqrIQElg/edit`

The current snapshot contains 120 spends totaling ₹3,74,20,011.37, 119 linked payment records, 20 vendors, five base budgets, and two budget reallocations. The Worker migration compares `sourceDataVersion`; deploying this version will replace an older demo-state KV record once with the approved Sheet snapshot. Later editor changes in Cloudflare KV are preserved until another intentionally versioned Sheet snapshot is deployed.

The Worker is configured for live one-way reads from the Google Sheet on each authenticated `/api` request. The browser does not receive Google credentials. Share the Sheet with the configured Google service-account email and add the service-account secrets to Wrangler. The dashboard is read-only from the Sheet; edit the Sheet and refresh the UI. The embedded snapshot is retained only as a local fallback.

The source Sheet has three payment-ledger amount mismatches: `CULT-ENT-3`, `CULT-ENT-17`, and `CULT-ENT-18`. The import intentionally keeps the amount from `Marketing Detail Spends` and merges payment metadata by ID, preserving the ₹3,74,20,011.37 Overview total.

## Cloudflare deployment

From the project root:

```bash
cd cloudflare-worker
npm ci
npm run build
npx wrangler deploy
```

Before deploying, confirm:

1. Wrangler is authenticated to the `cultfit` Cloudflare account.
2. The `APP_STATE` KV binding exists and is attached to the Worker.
3. The production source is `codex/pages-final-dashboard`, with `cloudflare-worker` as the deployment root when using Git integration.
4. Cloudflare Access protects both the `workers.dev` URL and any custom hostname.
5. The Access policy allows the two company domains and blocks external identities.

## Custom URL

Attach `b2b-spend-dashboard.cultfit.in` as a Worker custom domain or route, then add the same hostname to the Cloudflare Access application. Keep the existing `workers.dev` URL until the custom hostname and Access policy have been verified.

## Required verification

1. Open `/` while signed in as `anil.kumar@curefit.com`; the header must show `Editor access`.
2. Confirm Anil can see Spend Forecast and all Operations tabs.
3. Add a temporary test spend, verify it persists after refresh, and then remove it.
4. Open `/` as a non-editor company user; the header must show `View only`.
5. Confirm a viewer cannot see Spend Forecast or Operations tabs and cannot submit a write request.
6. Confirm an external email cannot access the application.
7. Open `/api` while authenticated and confirm a JSON response rather than `404`.
8. Confirm the Cult for Corporates logo appears correctly in the sidebar with no background patch.
9. Confirm the overview shows 120 transactions, ₹3.74 crore total spend, and ₹11.39 crore effective budget.

## Known deployment dependency

The application relies on Cloudflare Access for verified identity. Without the Access header, the dashboard safely treats the visitor as unauthorized and does not grant editor access.

## Rollback

If verification fails, roll back to the previous Cloudflare Worker deployment from the Cloudflare deployment history. Do not delete the existing Worker or hostname while testing the new version.
