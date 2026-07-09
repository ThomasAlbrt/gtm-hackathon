# web/ — landing pages personnalisées + API

Brique front du projet (voir le [README racine](../README.md) pour
l'architecture complète). Next.js 16 (App Router) + Tailwind v4, déployée sur
Vercel (Root Directory = `web`).

- `GET /<slug>` — landing page co-brandée d'un prospect (lecture KV,
  `force-dynamic`, `noindex`).
- `POST /api/contacts` · `GET /api/bookings` — API admin (Bearer
  `ADMIN_TOKEN`).
- `POST /api/webhooks/cal` — webhook Cal.com (HMAC sha256).

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck && npm run lint && npm run test && npm run build
```

Env : `.env.local` — KV Upstash (`KV_REST_API_*` ou `UPSTASH_REDIS_REST_*`),
`ADMIN_TOKEN`, `CAL_WEBHOOK_SECRET`.

⚠️ Next 16 : lire [AGENTS.md](AGENTS.md) avant d'écrire du code ici.
