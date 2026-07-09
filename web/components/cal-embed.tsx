"use client";

import type { PrefillAndIframeAttrsConfig } from "@calcom/embed-core";
import Cal from "@calcom/embed-react";

type CalEmbedProps = {
  /** Cal.com event link, e.g. "user/15min". */
  calLink: string;
  /** Contact slug, passed through as the FLATTENED "metadata[contactId]" key. */
  contactId: string;
  /** Prefills the attendee name field. */
  name?: string;
  /** Prefills the attendee email field. */
  email?: string;
};

/**
 * Cal.com inline embed. Contract (implemented in B2-WPB): renders
 * @calcom/embed-react with name/email prefill and the contact slug as
 * "metadata[contactId]" — the key MUST stay flattened: a nested object
 * becomes "[object Object]" in the iframe URL and the webhook loses the
 * booking→contact link.
 */
export function CalEmbed({ calLink, contactId, name, email }: CalEmbedProps) {
  const config = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    "metadata[contactId]": contactId,
    layout: "month_view",
  } satisfies PrefillAndIframeAttrsConfig;

  return (
    <Cal
      calLink={calLink}
      config={config}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
