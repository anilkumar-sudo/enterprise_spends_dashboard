# Final B2B Dashboard - Deployment Handoff for Anil

## Objective

Deploy the latest authenticated Cult Enterprise B2B Spend Dashboard to Cloudflare, with company-wide viewer access and restricted editor access.

## Source of truth

- Latest production package: `Final B2B Dashboard - Production Assets.zip`
- GitHub repository: `https://github.com/cultsport/cult-enterprise-marketing.git`
- Target deployment branch: `codex/pages-final-dashboard`
- Current Cloudflare service: `b2b-enterprise-spends-dashboard`
- Existing URL: `https://b2b-enterprise-spends-dashboard.cultfit.workers.dev/`
- Preferred custom URL: `b2b-spend-dashboard.cultfit.in`

As of August 7, 2026, unauthenticated requests to both `/` and `/api` return `403`. This confirms Cloudflare Access is active, but the currently deployed code version must be verified after signing in or redeploying the branch above.

The local production package contains Anil's editor access update. Before deploying through Cloudflare's Git integration, confirm the target branch contains `anil.kumar@curefit.com` in `cloudflare-worker/worker.template.js` and the generated `cloudflare-worker/worker.js`. Alternatively, deploy directly from the production package using Wrangler.

## Access model

The Worker uses Google OAuth and accepts only verified `@curefit.com` accounts. Sessions are stored in the `ACCESS_STORE` KV namespace. Cloudflare Access headers remain supported for local/managed-identity testing.

The initial administrators are:

- `anil.kumar@curefit.com`
- `nikhil.zutshi@curefit.com`

Administrators can add, change, and remove approved users from the Access Management tab. Roles are `admin`, `editor`, and `viewer`; viewers can access Overview and Spend Category tabs, editors can access operations, and admins can also manage access. The Worker enforces the same permissions server-side.

## Production files

- `Final B2B Dashboard.html`: dashboard UI and client-side application
- `assets/cult-for-corporates-logo-white.png`: active transparent Cult for Corporates logo asset
- `assets/google-sheet-snapshot.js`: versioned FY26-27 data import from the approved marketing spend Sheet
- `cloudflare-worker/worker.template.js`: editable Worker source and access rules
- `cloudflare-worker/build-worker.mjs`: builds the deployable Worker
- `cloudflare-worker/worker.js`: generated deployable Worker
- `cloudflare-worker/wrangler.jsonc`: Cloudflare Worker and live Google Sheets configuration
- `cloudflare-worker/package.json`: build and deployment commands
- `cloudflare-worker/package-lock.json`: locked deployment dependencies
- `backend/`: optional Google Sheets / Apps Script fallback; not required by the direct Google Sheets API integration

## Imported production data

Source Sheet:

- `https://docs.google.com/spreadsheets/d/1Pbr5E2EOmpI0WcpNfmlO5-Hr_SX9u4lqfFSXqrIQElg/edit`

The previous snapshot contains 120 spends totaling ₹3,74,20,011.37, 119 linked payment records, 20 vendors, five base budgets, and two budget reallocations. It remains only as a local fallback; production reads the source tabs live through the Google Sheets API.

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
2. The Google service-account secrets are configured and the source Sheet is shared with the service-account email.
3. Set the Google OAuth web-client secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI`.
4. Register `https://b2b-enterprise-spends-dashboard.cultfit.workers.dev/auth/callback` as an authorized redirect URI in Google Cloud.
5. The production source is `codex/pages-final-dashboard`, with `cloudflare-worker` as the deployment root when using Git integration.
6. The `ACCESS_STORE` KV binding is present and Cloudflare Access, if enabled, forwards the authenticated email header.

## Custom URL

Attach `b2b-spend-dashboard.cultfit.in` as a Worker custom domain or route, then add the same hostname to the Cloudflare Access application. Keep the existing `workers.dev` URL until the custom hostname and Access policy have been verified.

## Required verification

1. Sign in through Google as `anil.kumar@curefit.com`; the header must show `Admin access`.
2. Confirm both initial admins can see and use Access Management.
3. Add a temporary viewer and editor, verify their tab visibility, then remove them.
4. Confirm an unlisted `@curefit.com` account receives access pending/denied messaging.
5. Confirm an external email cannot access the application.
6. Open `/api` while authenticated and confirm a JSON response rather than `404`.
7. Confirm the Cult for Corporates logo appears correctly in the sidebar with no background patch.
8. Confirm the overview shows 120 transactions, ₹3.74 crore total spend, and ₹11.39 crore effective budget.

## Known deployment dependency

Google OAuth secrets and the `ACCESS_STORE` KV binding are required for production login and persistent role management. Without a valid Google OAuth configuration, the Worker shows a configuration error rather than granting access.

## Rollback

If verification fails, roll back to the previous Cloudflare Worker deployment from the Cloudflare deployment history. Do not delete the existing Worker or hostname while testing the new version.
