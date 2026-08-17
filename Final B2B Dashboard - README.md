# Final B2B Dashboard

Internal marketing spend dashboard and deployment bundle for Cult Enterprise.

The August 2026 interface refresh applies the shared Cult Enterprise design language across the full product: near-black editorial surfaces, Outfit/Inter typography, purposeful pink/cyan/yellow status accents, refined data cards and tables, and restrained motion. Dashboard calculations, forecast logic, Google Sheet data, and access controls remain intact.

## Included

- `Final B2B Dashboard.html` — complete interactive dashboard UI and local preview
- `assets/cult-for-corporates-logo-white.png` — active transparent Cult for Corporates logo used by the dashboard
- `assets/google-sheet-snapshot.js` — versioned import of the approved FY26-27 marketing spend Sheet
- `backend/` — Google Sheets / Apps Script backend preparation files
- `cloudflare-worker/` — Cloudflare Worker deployment bundle for the live version
- `Final B2B Dashboard - Production Assets.zip` — current packaged handoff archive
- `Final B2B Dashboard - Anil Deployment Handoff.md` — concise production rollout checklist

## Current GitHub State

The target deployment branch is:

- `codex/pages-final-dashboard`

The organization repository uses a protected, PR-based branch workflow.
The local production ZIP is the latest handoff source until the Anil editor-access update is synced to that branch.

## Local Preview

Open:

- `Final B2B Dashboard.html`

Or directly open the local file in a browser:

- `/Users/nikhilzutshi/Documents/Final B2B Dashboard/Final B2B Dashboard.html`

## Current Data Source

The dashboard snapshot was imported from:

- `Marketing Spend Dashboard: cult Enterprise | FY26-27`
- `https://docs.google.com/spreadsheets/d/1Pbr5E2EOmpI0WcpNfmlO5-Hr_SX9u4lqfFSXqrIQElg/edit`

Current imported totals:

- 120 populated spend records
- 119 populated payment records merged by transaction ID
- 20 vendor records
- ₹3,74,20,011.37 total spend
- ₹11,39,00,000 effective FY budget after two reallocations

This is a versioned deployment snapshot, not a continuous Google Sheets sync. Updating the Sheet later requires refreshing `assets/google-sheet-snapshot.js`, rebuilding `cloudflare-worker/worker.js`, and redeploying.

Data-quality note: the Sheet currently has payment-ledger amount mismatches for `CULT-ENT-3`, `CULT-ENT-17`, and `CULT-ENT-18`. The dashboard uses `Marketing Detail Spends` as the financial amount source and merges only payment metadata by transaction ID, so its total remains aligned with the Sheet Overview.

## Cloudflare Deployment Bundle

Use the files in `cloudflare-worker/` for the Cloudflare-native deployment path.

Key files:

- `cloudflare-worker/worker.js`
- `cloudflare-worker/wrangler.jsonc`
- `cloudflare-worker/DEPLOYMENT_STATUS.md`

### Intended deploy flow

```bash
cd cloudflare-worker
npm install
npm run deploy
```

The Worker config is set up to:

- deploy the Worker named `cult-enterprise-marketing`
- serve on its Cloudflare `workers.dev` URL until a custom domain is attached
- provision/use the `APP_STATE` KV binding for shared dashboard state

## Notes

- Company viewer and editor access logic is wired in the app and Worker.
- Approved editor emails and viewer domains are embedded in the Worker bundle.
- The generated Worker contains the same latest interface as the standalone HTML.
- A new snapshot version replaces stale demo data in browser storage and Cloudflare KV once during rollout.
- GitHub contains the current source; Cloudflare production still needs to deploy the latest Worker build from `codex/pages-final-dashboard`.
