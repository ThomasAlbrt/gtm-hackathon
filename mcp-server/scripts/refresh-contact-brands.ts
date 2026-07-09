import "../src/env.js";

import { resolveBrand } from "../src/brand.js";
import { type Contact, contactKey } from "../src/contacts.js";
import { getKv } from "../src/kv.js";

/**
 * Migration one-off : re-résout le brand embarqué des contacts existants dont
 * le kit a l'ancienne shape (repo cheat : pas de champ plat `accent`).
 * Le domaine vient de contact.brand.domain ou de l'ancien champ companyDomain.
 */
const force = process.argv.includes("--force");
const kv = getKv();
const keys = await kv.keys("contact:*");

for (const key of keys) {
  const contact = await kv.get<
    Contact & { companyDomain?: string; brand?: { domain?: string } }
  >(key);
  if (!contact) continue;

  const domain = contact.brand?.domain ?? contact.companyDomain;
  if (!domain) {
    console.log(`${key}: pas de domaine, ignoré`);
    continue;
  }
  if (
    !force &&
    contact.brand &&
    "accent" in contact.brand &&
    contact.brand.accent
  ) {
    console.log(`${key}: déjà au nouveau schéma, ignoré`);
    continue;
  }

  const kit = await resolveBrand(domain);
  if (!kit) {
    console.log(`${key}: résolution échouée pour ${domain}, inchangé`);
    continue;
  }

  await kv.set(contactKey(contact.id), { ...contact, brand: kit });
  console.log(`${key}: brand rafraîchi (${domain}, accent ${kit.accent})`);
}
