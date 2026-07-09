/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
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
      ? `${contact.firstName}, this is for you — ${senderName}`
      : `Personal invitation — ${senderName}`,
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
        className="min-h-dvh bg-(--brand-background) font-(family-name:--brand-font-body) text-(--brand-text)"
        style={pageStyle}
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
            Prepared for {contact.company}
          </p>
        </header>

        <section
          className="px-5 py-16 sm:px-8 md:py-24"
          style={heroVeilStyle}
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--brand-palette-2)">
              An invitation from {senderName}
            </p>
            <h1 className="max-w-4xl font-(family-name:--brand-font-heading) text-4xl leading-[1.02] font-semibold md:text-[64px] md:leading-[64px] md:tracking-[-0.02em]">
              <span
                style={{ color: "var(--prospect-accent, var(--brand-accent))" }}
              >
                {contact.firstName}
              </span>
              , we made this for you
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8">
              A personal page from {senderName} for {contact.company} —
              here&apos;s why we reached out.
            </p>
            <div className="mt-6 flex w-full flex-col items-start gap-4">
              <div
                className="inline-flex max-w-full items-start gap-2 rounded-full border px-4 py-2 text-sm leading-5"
                style={signalBadgeStyle}
              >
                <BoltIcon
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-(--brand-accent)"
                />
                <span>{contact.signal}</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {contact.calLink ? (
                  <a
                    href="#book"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-(--brand-cta) px-6 text-sm font-semibold text-(--brand-cta-text) transition-opacity hover:opacity-90"
                  >
                    Book 15 minutes
                  </a>
                ) : null}
                {senderUrl ? (
                  <a
                    href={senderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-colors"
                    style={secondaryCtaStyle}
                  >
                    Discover {senderName}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {hasPersonalMessage ? (
          <section className="px-5 py-14 sm:px-8 md:py-20">
            <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] md:items-start">
              <div>
                <h2 className="font-(family-name:--brand-font-heading) text-3xl font-semibold leading-tight md:text-4xl">
                  This one&apos;s for {contact.company}
                </h2>
                {contact.message ? (
                  <p className="mt-5 max-w-3xl whitespace-pre-line font-(family-name:--brand-font-accent) text-xl leading-8">
                    {contact.message}
                  </p>
                ) : null}
                {contact.audioUrl ? (
                  <audio
                    controls
                    src={contact.audioUrl}
                    className="mt-6 w-full max-w-xl"
                  />
                ) : null}
              </div>
              {contact.videoUrl ? (
                <video
                  controls
                  playsInline
                  src={contact.videoUrl}
                  className="aspect-video w-full rounded-lg object-cover"
                  style={mediaStyle}
                />
              ) : null}
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
                Pick a time
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
            {senderName} · Prepared personally for {contact.firstName} at{" "}
            {contact.company}
          </div>
        </footer>
      </main>
    </BrandTheme>
  );
}

function getSenderName(senderBrand?: BrandKit | null): string {
  return senderBrand?.name ?? senderBrand?.domain ?? "our team";
}

const heroVeilStyle: CSSProperties = {
  background: "color-mix(in oklab, var(--brand-palette-3) 24%, white)",
};

const signalBadgeStyle: CSSProperties = {
  background: "color-mix(in oklab, var(--brand-palette-3) 18%, white)",
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
