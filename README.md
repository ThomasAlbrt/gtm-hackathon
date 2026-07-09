# GTM Campaign — Agentic GTM Hackathon (Station F, 2026-07-09)

Un agent GTM qui transforme un **signal d'intention** (changement de poste,
levée de fonds, engagement concurrent…) en **outreach personnalisé
multi-canal** — landing page co-brandée préparée pour le prospect + iMessage —
avec le **sales rep dans la boucle** à chaque étape.

Équipe « Growth, Friends & Fun » · Stack sponsors : Claude (agent),
Sillage (signaux d'intention), FullEnrich (enrichissement contacts).

## Architecture

Deux briques indépendantes qui ne communiquent **que via Upstash Redis** —
aucun appel direct entre elles :

```
┌─────────────────────┐         ┌──────────────────────────┐
│  mcp-server/        │         │  web/                    │
│  Serveur MCP stdio  │  Redis  │  Next.js 16 (App Router) │
│  « gtm-campaign »   │ ──KV──▶ │  Landing pages + API     │
│  (les tools que     │ ◀──KV── │  (déployé sur Vercel)    │
│  Claude appelle)    │         │                          │
└─────────────────────┘         └──────────────────────────┘
```

- Le serveur MCP **écrit** les contacts (`contact:<slug>`) et les marques
  (`sender:brand`, `brand:v2:<domain>`) ; il **lit** les bookings.
- Le web **lit** les contacts/marques pour rendre les pages ; il **écrit**
  les bookings (webhook Cal.com). Écrire une clé rend la page vivante
  instantanément — zéro redéploiement.

### Clés KV

| Clé | Contenu |
| --- | --- |
| `contact:<slug>` | JSON `Contact` (une landing page) |
| `bookings` | Liste `BookingEvent`, LPUSH — plus récent en tête |
| `sender:brand` | `BrandKit` de l'émetteur (sans TTL) |
| `brand:v2:<domain>` | Cache `BrandKit` résolu, TTL 7 j |

Le schéma `Contact`/`BrandKit`/`BookingEvent` est **dupliqué** dans
`web/lib/contacts.ts` et `mcp-server/src/contacts.ts` : on change l'un,
on change l'autre.

## `web/` — landing pages + API

- `GET /<slug>` — la landing page personnalisée : co-branding
  prospect 🤝 émetteur (thème = marque de l'émetteur via variables
  `--brand-*`, accents = marque du prospect), badge signal, CTA Cal.com,
  blocs message/vidéo/audio optionnels. `force-dynamic`, `robots: noindex`.
- `POST /api/contacts` — upsert d'un contact (Bearer `ADMIN_TOKEN`).
- `GET /api/bookings` — liste des bookings (Bearer `ADMIN_TOKEN`).
- `POST /api/webhooks/cal` — webhook Cal.com `BOOKING_CREATED`
  (HMAC sha256 du body brut, `timingSafeEqual`, actif si
  `CAL_WEBHOOK_SECRET` est posé). Relie le booking au contact via
  `metadata[contactId]`.

Env (`web/.env.local`) : `KV_REST_API_URL` + `KV_REST_API_TOKEN` (ou
orthographe `UPSTASH_REDIS_REST_*`), `ADMIN_TOKEN`, `CAL_WEBHOOK_SECRET`.

## `mcp-server/` — le serveur MCP « gtm-campaign »

Six tools exposés à Claude (stdio) :

| Tool | Rôle |
| --- | --- |
| `create_landing_page` | Résout la marque du prospect (best-effort), écrit le contact, retourne l'URL |
| `launch_campaign` | Orchestrateur multi-prospects : pages + iMessage. **Refuse sans `confirm:true`** (approbation explicite du rep) |
| `send_imessage` | Envoi iMessage unitaire (macOS/Messages.app uniquement) |
| `set_sender_brand` | Résout et fixe la marque émettrice (`SENDER_DOMAIN`, déf. pigment.com) |
| `get_brand` | Résolution/inspection d'une marque |
| `get_bookings` | Poll des bookings — le ping proactif quand un prospect réserve |

- **Résolution de marque** : Context.dev (`brand.retrieve` +
  `web.extractStyleguide`, ~20 crédits/domaine, cache 7 j). Intégralement
  best-effort : un échec de marque ne bloque jamais une page.
- **iMessage** : `osascript` + Messages.app — fonctionne uniquement sur un
  Mac où Claude tourne ; destinataire et texte passent en argv AppleScript.

Env (`mcp-server/.env`, voir `.env.example`) : Upstash (même base que web),
`CONTEXT_DEV_API_KEY`, `SENDER_DOMAIN`, `SITE_BASE_URL` (⚠️ à pointer sur le
domaine de prod avant tout envoi réel — les URLs envoyées aux prospects
partent de là).

## Démarrage

```bash
# web
cd web && npm install
npm run dev                      # http://localhost:3000

# mcp-server
cd mcp-server && npm install
npm run build                    # le serveur stdio tourne depuis dist/

# Claude Code : .mcp.json (racine) enregistre gtm-campaign automatiquement.
```

Gates (à garder verts) :

```bash
cd web        && npm run typecheck && npm run lint && npm run test && npm run build
cd mcp-server && npm run typecheck && npm run test && npm run build
```

Sanity check marque (nécessite `CONTEXT_DEV_API_KEY`) :

```bash
cd mcp-server && npm run demo:brand -- stripe.com
```

## Déploiement

- Vercel, **Root Directory = `web`**, deploy sur push `main`. Env du projet :
  KV + `ADMIN_TOKEN` + `CAL_WEBHOOK_SECRET`. Même base Upstash qu'en local →
  une écriture KV locale est visible en prod instantanément.
- Les liens prospects doivent utiliser le **domaine custom** (les URLs
  `*.vercel.app` peuvent être derrière la Deployment Protection).
- Webhook Cal.com : pointer l'**hôte canonique sans redirection** —
  vérifier avant de câbler :
  `curl -s -o /dev/null -w '%{http_code}' -X POST https://<domaine>/api/webhooks/cal`
  → attendu 200/401, jamais 3xx (Cal.com avale silencieusement les POST
  sur redirect).

## Flow de démo

1. Signal détecté (Sillage) + contact enrichi (FullEnrich MCP).
2. Le rep passe en revue → `create_landing_page` / `launch_campaign`
   (`confirm:true` après accord explicite).
3. Le prospect reçoit l'iMessage avec SA page → réserve un créneau (Cal.com).
4. Le webhook pousse le booking → Claude le voit via `get_bookings` et
   **ping le rep proactivement**. La boucle est fermée.

## Sécurité

- **Barrière de sanitization CSS** (`web/lib/brand-css.ts`) : toute valeur de
  marque vient d'une API externe et finit dans du CSS — hex strict, familles
  de polices filtrées, URLs https sans caractères d'échappement.
- **HMAC webhook** : sha256 du body brut, comparaison `timingSafeEqual`.
- **Barrière d'injection AppleScript** : destinataire/texte uniquement en
  argv (`on run argv`), jamais interpolés dans le source.
- **Human-in-the-loop** : `launch_campaign` exige `confirm:true` après
  revue du rep ; pages `noindex` ; slugs non devinables (suffixe aléatoire).
