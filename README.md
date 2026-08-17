# B2B Spends Dashboard

Cloudflare Workers deployment bundle for the Cult Enterprise B2B Spend Dashboard.

## Deploy

```bash
cd cloudflare-worker
npm ci
npm run build
npx wrangler deploy
```

The Worker reads the configured Google Sheet live on each authenticated `/api` request. The Sheet must be shared with the Google service-account email configured in Wrangler secrets. Local fallback data remains embedded only for development when live-sync secrets are absent. Do not commit credentials or local `.dev.vars` files.

## Live Google Sheets setup

Create or use a Google service account, share the source Sheet with its email as Viewer, then configure the Worker secrets:

```bash
cd cloudflare-worker
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

The source tabs are configured in `wrangler.jsonc`: `Marketing Detail Spends`, `Payments Tracker`, `Vendors & Agencies`, and `Budget`. With `GOOGLE_LIVE_SYNC=true`, the dashboard is read-only from the live Sheet; edit the Sheet and refresh the dashboard to see the change.

## Source and handoff

- Dashboard UI: `Final B2B Dashboard.html`
- Worker source: `cloudflare-worker/worker.template.js`
- Generated Worker: `cloudflare-worker/worker.js`
- Wrangler config: `cloudflare-worker/wrangler.jsonc`
- Production handoff: `Final B2B Dashboard - Anil Deployment Handoff.md`
