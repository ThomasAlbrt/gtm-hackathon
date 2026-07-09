/* eslint-disable @next/next/no-img-element -- logos externes (CDN Context.dev) */
import type { Metadata } from "next";
import { BoltIcon } from "@heroicons/react/16/solid";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { notFound } from "next/navigation";

import { BrandTheme } from "../../components/brand-theme";
import { CalEmbed } from "../../components/cal-embed";
import { sanitizeHexColor } from "../../lib/brand-css";
import type { BrandKit } from "../../lib/contacts";
import { getContact, getSenderBrand } from "../../lib/contacts";

export const dynamic = "force-dynamic";

type PersonalizedPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PersonalizedPageProps): Promise<Metadata> {
  const { id } = await params;
  const [contact, senderBrand] = await Promise.all([
    getContact(id),
    getSenderBrand(),
  ]);
  const senderName = getSenderName(senderBrand);

  return {
    title: contact
      ? `${contact.firstName}, we made this for you — ${senderName}`
      : `A personal invitation — ${senderName}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Landing page de prospection co-brandée. Le thème visuel vient de la marque
 * EXPÉDITRICE (sender:brand) via les variables --brand-* posées par
 * BrandTheme ; les données du prospect (contact.*) fournissent le contenu, et
 * son accent (contact.brand.accent, sanitisé) teinte les éléments
 * personnalisés. Chaque bloc média (vidéo, voice note) est optionnel : la
 * page doit rester complète sans eux.
 */
export default async function PersonalizedLandingPage({
  params,
}: PersonalizedPageProps) {
  const { id } = await params;
  const [contact, senderBrand] = await Promise.all([
    getContact(id),
    getSenderBrand(),
  ]);

  if (!contact) {
    notFound();
  }

  const senderName = getSenderName(senderBrand);
  const fullName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
  const senderUrl = senderBrand?.domain
    ? `https://${senderBrand.domain}`
    : undefined;
  const prospectAccent = sanitizeHexColor(contact.brand?.accent);
  const prospectColor = prospectAccent ? { color: prospectAccent } : undefined;
  const hasPersonalMessage = Boolean(
    contact.message || contact.videoUrl || contact.audioUrl,
  );

  return (
    <BrandTheme brand={senderBrand}>
      <main className="isolate min-h-dvh bg-(--brand-background) font-(family-name:--brand-font-body) text-(--brand-text)">
        {/* Bandeau supérieur + hero, sur un léger voile aux couleurs de la marque */}
        <div className="bg-linear-to-b from-[color-mix(in_oklab,var(--brand-palette-3)_24%,white)] to-white">
          <header>
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-6 px-6 py-5 lg:px-8">
              {/* Co-branding : marque du prospect 🤝 marque expéditrice.
                  Même hauteur pour les deux logos pour garder l'équilibre. */}
              <span
                aria-label={`${contact.company} and ${senderName}`}
                className="flex min-w-0 shrink-0 items-center gap-x-3 font-(family-name:--brand-font-heading) text-lg font-semibold tracking-tight text-(--brand-text)"
              >
                {contact.brand?.logoUrl ? (
                  <img
                    src={contact.brand.logoUrl}
                    alt={contact.brand?.name ?? contact.company}
                    className="h-6 w-auto shrink-0"
                  />
                ) : (
                  contact.company
                )}
                <span aria-hidden="true" className="text-xl leading-none">
                  🤝
                </span>
                {senderBrand?.logoUrl ? (
                  <img
                    src={senderBrand.logoUrl}
                    alt={senderName}
                    className="h-6 w-auto shrink-0"
                  />
                ) : (
                  senderName
                )}
              </span>
              {/* Redondant avec le logo prospect : masqué quand l'espace manque */}
              <p className="hidden min-w-0 truncate text-base text-neutral-600 sm:block sm:text-sm">
                Prepared for{" "}
                <span
                  className="font-medium text-neutral-950"
                  style={prospectColor}
                >
                  {contact.company}
                </span>
              </p>
            </div>
          </header>

          <section
            aria-labelledby="hero-title"
            className="pt-14 pb-16 sm:pt-20 sm:pb-24"
          >
            <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center lg:px-8">
              {/* Kicker façon Pigment : uppercase, tracking large, neutre discret */}
              <p className="text-[0.8125rem] font-medium tracking-[0.08em] text-neutral-500 uppercase">
                An invitation from {senderName}
              </p>
              {/* Gaps mesurés sur le hero de pigment.com : kicker→h1 ~8px,
                  h1→sous-titre 16px, sous-titre→CTA 24px ; h1 64/64 -0.02em */}
              <h1
                id="hero-title"
                className="mt-2 max-w-[24ch] font-(family-name:--brand-font-heading) text-4xl font-semibold tracking-[-0.02em] text-balance text-(--brand-text) sm:text-[4rem] sm:leading-16"
              >
                <span style={prospectColor}>{contact.firstName}</span>, we made
                this for you
              </h1>
              <p className="mt-4 inline-flex max-w-full items-start gap-x-2 rounded-full border border-neutral-950/10 bg-white py-1.5 pr-3 pl-1.5 text-base text-neutral-700 sm:text-sm">
                <BoltIcon className="size-4 h-lh shrink-0 fill-(--brand-palette-2)" />
                <span className="min-w-0 text-pretty">{contact.signal}</span>
              </p>
              <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row">
                {contact.calLink ? (
                  <a
                    href="#rdv"
                    className="inline-flex min-h-12 items-center justify-center gap-x-3 bg-(--brand-cta) py-3 pr-4 pl-5 text-base font-medium text-(--brand-cta-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--brand-cta) sm:text-sm"
                  >
                    Book 15 minutes
                    <ArrowUpRightIcon className="size-5 h-lh shrink-0" />
                  </a>
                ) : null}
                {senderUrl ? (
                  <a
                    href={senderUrl}
                    className="inline-flex min-h-12 items-center justify-center gap-x-3 border border-(--brand-cta)/8 py-3 pr-4 pl-5 text-base font-medium text-(--brand-cta) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--brand-cta) sm:text-sm"
                  >
                    Discover {senderName}
                    <ArrowUpRightIcon className="size-5 h-lh shrink-0" />
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {hasPersonalMessage ? (
          <section
            aria-labelledby="message-title"
            className="border-t border-neutral-950/5 py-16 sm:py-24"
          >
            <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center lg:px-8">
              <h2
                id="message-title"
                className="max-w-[40ch] font-(family-name:--brand-font-heading) text-3xl font-semibold tracking-tight text-balance text-(--brand-text) sm:text-4xl"
              >
                This one&apos;s for{" "}
                <span style={prospectColor}>{contact.company}</span>
              </h2>

              {contact.videoUrl ? (
                <div className="mt-10 w-full">
                  {/* La vidéo arrive en asynchrone : bloc optionnel */}
                  <video
                    src={contact.videoUrl}
                    controls
                    playsInline
                    className="aspect-video w-full rounded-[min(1vw,8px)] bg-neutral-950 outline-1 -outline-offset-1 outline-black/10"
                  />
                </div>
              ) : null}

              {contact.message ? (
                <p className="mt-10 max-w-[40ch] font-(family-name:--brand-font-accent) text-2xl whitespace-pre-line text-pretty text-neutral-800 sm:text-3xl">
                  {contact.message}
                </p>
              ) : null}

              {contact.audioUrl ? (
                <div className="mt-10 w-full">
                  <p className="text-base text-neutral-600 sm:text-sm">
                    The audio version, recorded for you.
                  </p>
                  <audio
                    src={contact.audioUrl}
                    controls
                    className="mx-auto mt-3 w-full max-w-md"
                  />
                </div>
              ) : null}

              <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-center">
                {(senderBrand?.iconUrl ?? senderBrand?.logoUrl) ? (
                  <img
                    src={senderBrand?.iconUrl ?? senderBrand?.logoUrl}
                    alt=""
                    className="mt-0.5 h-5 w-auto shrink-0"
                  />
                ) : null}
                <p className="text-base text-neutral-600 sm:text-sm">
                  <span className="font-medium text-neutral-950">
                    The {senderName} team
                  </span>
                  {senderBrand?.slogan ? <> — {senderBrand.slogan}</> : null}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {contact.calLink ? (
          <section
            id="rdv"
            aria-labelledby="rdv-title"
            className="bg-[color-mix(in_oklab,var(--brand-palette-3)_18%,white)] py-16 sm:py-24"
          >
            <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center lg:px-8">
              <h2
                id="rdv-title"
                className="max-w-[40ch] font-(family-name:--brand-font-heading) text-3xl font-semibold tracking-tight text-balance text-(--brand-text) sm:text-4xl"
              >
                Let&apos;s take 15 minutes
              </h2>
              <p className="mt-4 max-w-[56ch] text-lg text-pretty text-neutral-600 sm:text-base">
                Pick whichever slot works for you — the invite arrives
                pre-filled, there&apos;s nothing else to do.
              </p>
              <div className="mt-10 w-full rounded-(--radius) bg-white p-(--padding) text-left shadow-sm ring-1 ring-black/5 [--padding:--spacing(2)] [--radius:var(--radius-lg)] sm:[--padding:--spacing(4)]">
                {/* Sur mobile, Cal déroule tous les créneaux : on plafonne avec un
                    scroll interne pour que le footer reste atteignable */}
                <div className="max-h-[44rem] min-h-[560px] overflow-x-hidden overflow-y-auto rounded-[calc(var(--radius)-var(--padding))] sm:max-h-none sm:overflow-hidden">
                  <CalEmbed
                    calLink={contact.calLink}
                    contactId={contact.id}
                    name={fullName}
                    email={contact.email}
                  />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <footer aria-label="Sender" className="bg-(--brand-palette-1)">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between sm:py-16 lg:px-8">
            <div className="max-w-md">
              <p className="flex items-center gap-x-2.5 font-(family-name:--brand-font-heading) text-lg font-semibold tracking-tight text-white">
                {/* Icône plutôt que logo complet : le wordmark des logos
                    light est illisible sur le bandeau sombre (pas de
                    logoDarkUrl dans le BrandKit) */}
                {(senderBrand?.iconUrl ?? senderBrand?.logoUrl) ? (
                  <img
                    src={senderBrand?.iconUrl ?? senderBrand?.logoUrl}
                    alt=""
                    className="h-6 w-auto shrink-0"
                  />
                ) : null}
                {senderName}
              </p>
              {senderBrand?.slogan ? (
                <p className="mt-4 text-base text-pretty text-white/70 sm:text-sm">
                  {senderBrand.slogan}.
                </p>
              ) : null}
            </div>
            <p className="max-w-[48ch] text-base text-pretty text-white/50 sm:text-right sm:text-sm">
              This page was prepared by the {senderName} team for{" "}
              {contact.firstName}
              {contact.company ? ` — ${contact.company}` : ""}.
            </p>
          </div>
        </footer>
      </main>
    </BrandTheme>
  );
}

function getSenderName(senderBrand?: BrandKit | null): string {
  return senderBrand?.name ?? senderBrand?.domain ?? "our team";
}
