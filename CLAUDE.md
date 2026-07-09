# GTM Campaign — instructions agent

Monorepo à deux briques : `web/` (Next 16, landing pages + API, Vercel) et
`mcp-server/` (serveur MCP stdio « gtm-campaign »). Elles ne communiquent
**que via Upstash Redis** — n'introduis jamais d'appel direct entre elles.
Vue d'ensemble : [README.md](README.md).

## Commandes

```bash
cd web        && npm run typecheck && npm run lint && npm run test && npm run build
cd mcp-server && npm run typecheck && npm run test && npm run build
```

Tous verts avant chaque commit. Commits en français, terminés par la ligne
`Co-Authored-By` de l'agent.

## Invariants — à préserver absolument

1. **Schéma dupliqué** : `Contact`/`BrandKit`/`FontLink`/`BookingEvent`
   existent en double (`web/lib/contacts.ts` ↔ `mcp-server/src/contacts.ts`).
   Toute modification se fait DANS LES DEUX fichiers, même commit.
2. **Barrière de sanitization CSS** (`web/lib/brand-css.ts`) : les valeurs de
   BrandKit viennent d'une API externe et sont injectées dans du CSS. Rien ne
   contourne `sanitizeHexColor`/`sanitizeFontFamily`/`fontFaceRules`. Les vars
   `--brand-*` se posent sur un wrapper (`BrandTheme`), jamais sur `:root`.
3. **Barrière d'injection AppleScript** (`mcp-server/src/imessage.ts`) :
   destinataire et texte passent en ARGV du script `on run argv` — jamais
   interpolés dans le source AppleScript.
4. **Human-in-the-loop** : `launch_campaign` refuse sans `confirm:true`.
   N'appelle jamais ce tool sans l'accord explicite du sales rep. Argument
   central du pitch — ne pas affaiblir.
5. **Best-effort marque** : un échec Context.dev ne bloque JAMAIS la création
   d'une page (`resolveBrand` retourne null, ne throw pas).
6. **HMAC webhook Cal** : sha256 du body BRUT + `timingSafeEqual` ;
   vérification active seulement si `CAL_WEBHOOK_SECRET` est posé.

## Pièges connus (payés — ne pas redécouvrir)

- **Next 16** : `params` est une `Promise` (`await params` partout, y compris
  `generateMetadata`). `force-dynamic` est valide car `cacheComponents` est
  OFF — ne pas l'activer. Voir `web/AGENTS.md` + `node_modules/next/dist/docs/`.
- **Tailwind v4** : famille de police = `font-(family-name:--var)` — le
  raccourci `font-(--var)` casse silencieusement. Couleurs simples OK :
  `bg-(--brand-cta)`.
- **`next/font` interdit pour les polices de marque** (build-time only ; les
  marques arrivent au runtime). La génération `@font-face` runtime est
  volontaire — ne pas « migrer ». Geist via next/font reste pour les défauts.
- **mcp-server tourne depuis `dist/`** : `npm run build` après CHAQUE
  changement de `src/`, sinon le serveur stdio sert l'ancien code.
- **ESM NodeNext** dans mcp-server : imports relatifs avec extension `.js`.
- **`.mcp.json`** : garder le wrapper `sh -c` qui sonde les candidats node
  (le Mac a nvm 16 en tête de PATH) — ne pas simplifier en `"command": "node"`.
- **`SITE_BASE_URL`** (`mcp-server/.env`) : localhost en dev ; à pointer sur
  le domaine de prod AVANT tout envoi réel (les URLs des iMessages en
  dépendent). Les liens prospects utilisent le domaine custom, jamais
  `*.vercel.app` (Deployment Protection).
- **Webhook Cal.com** : pointer un hôte canonique sans redirect (un 308 =
  POST avalé silencieusement). Vérif :
  `curl -s -o /dev/null -w '%{http_code}' -X POST https://<domaine>/api/webhooks/cal`
  → 200/401 attendu, jamais 3xx.
- **Slugs** : `firstname-xxxx` (NFD, suffixe base36 aléatoire) — jamais
  séquentiels, non devinables.
- **`signal`** : rendu VERBATIM en badge sur la page — toujours le
  synthétiser en une phrase courte avant tout appel de tool.
- **Langue** : tout le contenu visible des landing pages (chrome, copy) est
  en ANGLAIS (décision du 9 juillet) ; `signal` et `message` rendent verbatim
  dans la langue où le rep les écrit. Docs et commits : français.

## Env

- `web/.env.local` : KV (`KV_REST_API_*` ou `UPSTASH_REDIS_REST_*` — les deux
  orthographes sont acceptées par `getKv()`), `ADMIN_TOKEN`,
  `CAL_WEBHOOK_SECRET`.
- `mcp-server/.env` (voir `.env.example`) : même base KV, `CONTEXT_DEV_API_KEY`,
  `SENDER_DOMAIN`, `SITE_BASE_URL`. Chargé par `src/env.ts` sans écraser
  l'env existant.
- iMessage : macOS uniquement (Messages.app) — sur cette machine Linux les
  envois échouent proprement, c'est attendu.
