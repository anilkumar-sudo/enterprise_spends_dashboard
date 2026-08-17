# B2B Spends Dashboard

Cloudflare Workers deployment bundle for the Cult Enterprise B2B Spend Dashboard.

## Deploy

```bash
cd cloudflare-worker
npm ci
npm run build
npx wrangler deploy
```

The Worker uses the `APP_STATE` KV binding for shared dashboard state. Configure the KV namespace ID in `cloudflare-worker/wrangler.jsonc` before deployment; do not commit credentials or local `.dev.vars` files.

## Source and handoff

- Dashboard UI: `Final B2B Dashboard.html`
- Worker source: `cloudflare-worker/worker.template.js`
- Generated Worker: `cloudflare-worker/worker.js`
- Wrangler config: `cloudflare-worker/wrangler.jsonc`
- Production handoff: `Final B2B Dashboard - Anil Deployment Handoff.md`
