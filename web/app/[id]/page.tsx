/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowUpRightIcon } from "@heroicons/react/20/solid";
import { BoltIcon } from "@heroicons/react/24/solid";
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
      ? `${contact.firstName}, on a préparé ça pour vous — ${senderName}`
      : `Invitation personnelle — ${senderName}`,
    robots: { index: false, follow: false },
  };
}

export default async function PersonalizedLandingPage({
  params,
}: PersonalizedPageProps) {
  const { id } = await params;
  const contact = await getContact(id);

  if (!contact) {
    notFound();
  }

  const senderBrand = await getSenderBrand();
  const senderName = getSenderName(senderBrand);
  const fullName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
  const senderUrl = senderBrand?.domain
    ? `https://${senderBrand.domain}`
    : undefined;
  const prospectLogoAlt = contact.brand?.name ?? contact.company;
  const senderLogoAlt = senderName;
  const hasBothLogos = Boolean(contact.brand?.logoUrl && senderBrand?.logoUrl);
  const hasPersonalMessage = Boolean(
    contact.message || contact.videoUrl || contact.audioUrl,
  );
  const sanitizedProspectAccent = contact.brand?.accent
    ? sanitizeHexColor(contact.brand.accent)
    : undefined;
  const pageStyle = {
    "--prospect-accent": sanitizedProspectAccent ?? "var(--brand-accent)",
  } as CSSProperties;

  return (
    <BrandTheme brand={senderBrand}>
      <main
        className="min-h-dvh bg-white font-(family-name:--brand-font-body) text-(--brand-text)"
        style={pageStyle}
      >
        <div
          style={{
            background:
              "linear-gradient(to bottom, var(--brand-background), #ffffff)",
          }}
        >
          <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {contact.brand?.logoUrl ? (
                <img
                  src={contact.brand.logoUrl}
                  alt={prospectLogoAlt}
                  className="h-7 w-auto max-w-[140px] object-contain"
                />
              ) : null}
              {hasBothLogos ? (
                <span aria-hidden="true" className="text-base leading-none">
                  🤝
                </span>
              ) : null}
              {senderBrand?.logoUrl ? (
                <img
                  src={senderBrand.logoUrl}
                  alt={senderLogoAlt}
                  className="h-7 w-auto max-w-[140px] object-contain"
                />
              ) : null}
            </div>
            <p className="shrink-0 text-right text-sm text-(--brand-palette-2)">
              <span>Préparé pour </span>
              <span
                className="font-medium"
                style={{
                  color: "var(--prospect-accent, var(--brand-accent))",
                }}
              >
                {contact.company}
              </span>
            </p>
          </header>

          <section className="px-5 py-16 sm:px-8 md:py-24">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--brand-palette-2)">
                Une invitation de {senderName}
              </p>
              <h1 className="max-w-3xl font-(family-name:--brand-font-heading) text-4xl leading-[1.02] font-semibold md:text-[64px] md:leading-[64px] md:tracking-[-0.02em]">
                <span
                  style={{
                    color: "var(--prospect-accent, var(--brand-accent))",
                  }}
                >
                  {contact.firstName}
                </span>
                , on a préparé ça pour vous
              </h1>
              <div
                className="mt-6 inline-flex max-w-full items-start gap-2 rounded-full border bg-white px-4 py-2 text-sm leading-5 sm:max-w-2xl"
                style={signalBadgeStyle}
              >
                <BoltIcon
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-(--brand-accent)"
                />
                <span>{contact.signal}</span>
              </div>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {contact.calLink ? (
                  <a
                    href="#book"
                    className="inline-flex h-12 items-center justify-center rounded-md bg-(--brand-cta) px-6 text-sm font-semibold text-(--brand-cta-text) transition-opacity hover:opacity-90"
                  >
                    Réserver 15 minutes
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="ml-2 h-4 w-4"
                    />
                  </a>
                ) : null}
                {senderUrl ? (
                  <a
                    href={senderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-md border bg-white px-6 text-sm font-semibold text-(--brand-text) transition-colors"
                    style={secondaryCtaStyle}
                  >
                    Découvrir {senderName}
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="ml-2 h-4 w-4"
                    />
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {hasPersonalMessage ? (
          <section className="px-5 py-14 sm:px-8 md:py-20">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center text-center">
              <h2 className="font-(family-name:--brand-font-heading) text-3xl font-semibold leading-tight md:text-4xl">
                Un message pensé pour{" "}
                <span
                  style={{
                    color: "var(--prospect-accent, var(--brand-accent))",
                  }}
                >
                  {contact.company}
                </span>
              </h2>
              {contact.videoUrl ? (
                <video
                  controls
                  playsInline
                  src={contact.videoUrl}
                  className="mx-auto mt-8 aspect-video w-full max-w-3xl rounded-lg object-cover"
                  style={mediaStyle}
                />
              ) : null}
              {contact.audioUrl ? (
                <audio
                  controls
                  src={contact.audioUrl}
                  className="mx-auto mt-6 w-full max-w-xl"
                />
              ) : null}
              {contact.message ? (
                <blockquote className="mx-auto mt-8 max-w-2xl whitespace-pre-line font-(family-name:--brand-font-accent) text-2xl leading-9 text-(--brand-text)">
                  « {contact.message} »
                </blockquote>
              ) : null}
              <div className="mt-6 flex items-center justify-center gap-2">
                {senderBrand?.iconUrl ? (
                  <img
                    src={senderBrand.iconUrl}
                    className="h-5 w-auto"
                    alt=""
                  />
                ) : null}
                <span className="text-sm">
                  <strong>L&apos;équipe {senderName}</strong>
                  {senderBrand?.slogan ? (
                    <span className="text-(--brand-palette-2)">
                      {" "}
                      — {senderBrand.slogan}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {contact.calLink ? (
          <section id="book" className="px-5 py-14 sm:px-8 md:py-20">
            <div
              className="mx-auto w-full max-w-6xl rounded-lg border p-4 sm:p-6"
              style={calSectionStyle}
            >
              <h2 className="font-(family-name:--brand-font-heading) text-3xl font-semibold leading-tight md:text-4xl">
                Choisissez un créneau
              </h2>
              <div className="mt-6 h-[70vh] max-h-[640px] overflow-y-auto md:h-[720px] md:max-h-none md:overflow-visible">
                <CalEmbed
                  calLink={contact.calLink}
                  contactId={contact.id}
                  name={fullName}
                  email={contact.email}
                />
              </div>
            </div>
          </section>
        ) : null}

        <footer
          className="px-5 py-8 text-sm sm:px-8"
          style={footerBandStyle}
        >
          <div className="mx-auto w-full max-w-6xl">
            {senderName} · Préparé personnellement pour{" "}
            <span
              className="font-medium"
              style={{ color: "var(--prospect-accent, var(--brand-accent))" }}
            >
              {contact.firstName}
            </span>{" "}
            chez{" "}
            <span
              className="font-medium"
              style={{ color: "var(--prospect-accent, var(--brand-accent))" }}
            >
              {contact.company}
            </span>
          </div>
        </footer>
      </main>
    </BrandTheme>
  );
}

function getSenderName(senderBrand?: BrandKit | null): string {
  return senderBrand?.name ?? senderBrand?.domain ?? "notre équipe";
}

const signalBadgeStyle: CSSProperties = {
  borderColor: "color-mix(in oklab, var(--brand-palette-2) 22%, transparent)",
};

const secondaryCtaStyle: CSSProperties = {
  borderColor: "color-mix(in oklab, var(--brand-palette-2) 28%, transparent)",
  color: "var(--brand-text)",
};

const mediaStyle: CSSProperties = {
  background: "color-mix(in oklab, var(--brand-palette-3) 16%, white)",
};

const calSectionStyle: CSSProperties = {
  background: "color-mix(in oklab, var(--brand-palette-3) 12%, white)",
  borderColor: "color-mix(in oklab, var(--brand-palette-2) 18%, transparent)",
};

const footerBandStyle: CSSProperties = {
  background: "var(--brand-palette-1)",
  color: "color-mix(in oklab, var(--brand-palette-3) 24%, white)",
};
