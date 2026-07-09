/**
 * Channel routing — the intelligence layer that decides HOW to reach a lead.
 *
 * Three outbound channels exist in gtm-campaign: SMS/iMessage (imessage.ts),
 * LinkedIn (HeyReach brick, arrives later) and email. This module answers one
 * question per lead — "which channel?" — and returns a decision plus a reason,
 * WITHOUT sending anything. Wiring the decision to an actual send is left to the
 * caller (the `launch_campaign` orchestration or a teammate's follow-up brick).
 *
 * The rules, in priority order:
 *   1. SMS   — we've had a prior interaction in the CRM (someone we KNOW) and we
 *              hold a phone number. Warmest channel, reserved for warm contacts.
 *   2. LinkedIn — no prior interaction, but the person's LinkedIn looks ACTIVE
 *              (recent posts / comments / a real following). Judged from Sillage
 *              intent signals, optionally via a Claude API call (env-gated) with
 *              a deterministic heuristic fallback.
 *   3. Email — no prior interaction and LinkedIn is not a promising channel.
 *              Falls back to LinkedIn when we have a profile URL but no email.
 *
 * Two dependencies are intentionally PLUGGABLE so this can live on a clean
 * branch off main without pulling in the whole Sillage/HeyReach stack:
 *   - CrmInteractionProvider   — resolve "have we talked before?" from a CRM.
 *   - LinkedInActivityProvider — fetch LinkedIn activity signals (from Sillage).
 * A teammate wires the Sillage client (`getSillageActivity`) and the real CRM
 * lookup here; until then the decision runs off the fields on the lead itself,
 * which keeps it fully testable.
 */
import Anthropic from "@anthropic-ai/sdk";

/** The three outbound channels, plus "none" when no handle is usable. */
export type Channel = "sms" | "linkedin" | "email" | "none";

/**
 * LinkedIn activity signals for a lead, typically sourced from Sillage. Every
 * field is optional — the judge works with whatever subset is present, and an
 * empty object means "no signal", which reads as inactive.
 */
export type LinkedInActivity = {
  /** Follower count on the profile. */
  followers?: number;
  /** Number of posts authored in the recent window (e.g. last 90 days). */
  postCount?: number;
  /** Comments / reactions authored in the recent window. */
  commentCount?: number;
  /** ISO date of the most recent post or comment. */
  lastActivityAt?: string;
  /** Count of Sillage intent signals attached to this lead. */
  signalCount?: number;
  /** Profile headline, useful context for the LLM judge. */
  headline?: string;
  /** A few sample post/comment excerpts, for the LLM judge to read. */
  excerpts?: string[];
};

/**
 * Everything the router needs about one lead. Contact handles (`phone`, `email`,
 * `linkedinUrl`) gate which channels are even possible; the CRM flag gates SMS.
 */
export type RoutingLead = {
  firstName: string;
  lastName?: string;
  company?: string;
  role?: string;
  /** iMessage-capable phone number; required for the SMS channel. */
  phone?: string;
  /** Professional email; required for the email channel. */
  email?: string;
  /** LinkedIn profile URL; required for the LinkedIn channel. */
  linkedinUrl?: string;
  /**
   * Explicit CRM signal: have we had a prior interaction with this person?
   * Set by the caller from their CRM. `lastInteractionAt` being present also
   * counts as a prior interaction.
   */
  hasPriorInteraction?: boolean;
  /** ISO date of the last CRM interaction, if any. */
  lastInteractionAt?: string;
  /**
   * Pre-fetched LinkedIn activity. When absent, an activity provider (if wired)
   * is asked to fetch it; when no provider is wired, LinkedIn is judged inactive.
   */
  linkedInActivity?: LinkedInActivity;
};

/** Verdict on whether a LinkedIn profile is worth reaching out on. */
export type ActivityVerdict = {
  active: boolean;
  /** 0..1 confidence that the profile is active enough to engage. */
  score: number;
  reason: string;
  /** Whether the verdict came from the Claude judge or the heuristic fallback. */
  judgedBy: "claude" | "heuristic";
};

/** The router's answer for one lead. */
export type ChannelDecision = {
  channel: Channel;
  /** One-sentence English explanation of why this channel was chosen. */
  reason: string;
  /** 0..1 confidence in the decision. */
  confidence: number;
  /** Present when LinkedIn activity was assessed. */
  activity?: ActivityVerdict;
};

/** Resolve "have we interacted before?" from a CRM. Best-effort. */
export type CrmInteractionProvider = (lead: RoutingLead) => Promise<boolean>;

/** Fetch LinkedIn activity for a lead (e.g. from Sillage). Best-effort. */
export type LinkedInActivityProvider = (
  lead: RoutingLead,
) => Promise<LinkedInActivity | null>;

/** Optional wiring for the router. Everything defaults to lead-local fields. */
export type RouteOptions = {
  crmProvider?: CrmInteractionProvider;
  activityProvider?: LinkedInActivityProvider;
};

// ---------------------------------------------------------------------------
// CRM signal
// ---------------------------------------------------------------------------

/** A lead counts as "known" if flagged, or if it carries a last-interaction date. */
export function hasPriorInteraction(lead: RoutingLead): boolean {
  return (
    lead.hasPriorInteraction === true ||
    typeof lead.lastInteractionAt === "string"
  );
}

// ---------------------------------------------------------------------------
// LinkedIn activity judge
// ---------------------------------------------------------------------------

/** Claude model used to judge LinkedIn activity; a cheap classifier by default. */
const JUDGE_MODEL = process.env.ROUTING_JUDGE_MODEL ?? "claude-haiku-4-5";

/** Score at or above which a profile is considered active. */
const ACTIVE_THRESHOLD = 0.5;

/** Days within which activity is considered "recent" for the heuristic. */
const RECENT_DAYS = 60;

/**
 * Deterministic activity score in [0, 1] from raw metrics. Weighted so that a
 * single strong signal (a recent post, a real following) already clears the
 * threshold, while an empty profile scores 0. This is the fallback when the
 * Claude judge is unavailable, and it is a pure function — easy to test.
 */
export function heuristicActivityScore(activity: LinkedInActivity): number {
  let score = 0;

  const followers = activity.followers ?? 0;
  if (followers >= 500) score += 0.25;
  if (followers >= 2000) score += 0.1;

  const posts = activity.postCount ?? 0;
  if (posts >= 1) score += 0.25;
  if (posts >= 5) score += 0.1;

  const comments = activity.commentCount ?? 0;
  if (comments >= 1) score += 0.15;

  if ((activity.signalCount ?? 0) >= 1) score += 0.15;

  if (isRecent(activity.lastActivityAt)) score += 0.2;

  return Math.min(1, score);
}

/** True when `iso` parses to a date within RECENT_DAYS of now. */
function isRecent(iso: string | undefined): boolean {
  if (!iso) return false;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return false;
  const ageDays = (Date.now() - then) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= RECENT_DAYS;
}

/** Build the heuristic verdict from raw activity. */
export function heuristicVerdict(activity: LinkedInActivity): ActivityVerdict {
  const score = heuristicActivityScore(activity);
  const active = score >= ACTIVE_THRESHOLD;

  return {
    active,
    score,
    judgedBy: "heuristic",
    reason: active
      ? "LinkedIn profile shows recent activity or a real following — likely to reply on LinkedIn."
      : "LinkedIn profile shows little recent activity — unlikely to reply on LinkedIn.",
  };
}

const JUDGE_SYSTEM =
  "You assess whether a B2B prospect is likely to notice and reply to an outbound message on LinkedIn, based on their activity signals. " +
  "An active profile posts or comments recently and/or has a real following. A dormant profile has little to no recent activity. " +
  "Reply ONLY with a JSON object: {\"active\": boolean, \"score\": number between 0 and 1, \"reason\": one short English sentence}.";

/**
 * Parse the Claude judge's reply into a verdict. Exported so it can be unit
 * tested without a network call. Returns null when the text has no usable JSON
 * object, so callers can fall back to the heuristic.
 */
export function parseVerdict(text: string): ActivityVerdict | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const rawScore = typeof obj.score === "number" ? obj.score : NaN;
  if (Number.isNaN(rawScore)) return null;
  const score = Math.min(1, Math.max(0, rawScore));

  const active =
    typeof obj.active === "boolean" ? obj.active : score >= ACTIVE_THRESHOLD;
  const reason =
    typeof obj.reason === "string" && obj.reason.trim().length > 0
      ? obj.reason.trim()
      : "Assessed from LinkedIn activity signals.";

  return { active, score, reason, judgedBy: "claude" };
}

/**
 * Ask Claude to judge the activity. Returns null (never throws) when
 * ANTHROPIC_API_KEY is unset or the call fails, so the caller falls back to the
 * heuristic — same best-effort contract as the brand/enrich bricks.
 */
export async function judgeWithClaude(
  activity: LinkedInActivity,
): Promise<ActivityVerdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 256,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(activity) }],
    });

    const text = message.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("");

    return parseVerdict(text);
  } catch {
    return null;
  }
}

/**
 * Judge a lead's LinkedIn activity: Claude first (when a key is present),
 * heuristic otherwise. Always resolves with a verdict.
 */
export async function judgeLinkedInActivity(
  activity: LinkedInActivity,
): Promise<ActivityVerdict> {
  return (await judgeWithClaude(activity)) ?? heuristicVerdict(activity);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Decide the outbound channel for one lead. Pure orchestration over the rules
 * documented at the top of the file; providers are best-effort and never block
 * a decision. Always resolves — the worst case is `channel: "none"`.
 */
export async function routeLead(
  lead: RoutingLead,
  options: RouteOptions = {},
): Promise<ChannelDecision> {
  const known = options.crmProvider
    ? await safeCrm(options.crmProvider, lead)
    : hasPriorInteraction(lead);

  // Rule 1 — known contact with a phone → SMS (warmest channel).
  if (known && lead.phone) {
    return {
      channel: "sms",
      confidence: 0.9,
      reason:
        "Known contact with a prior CRM interaction — reach out on the warmest channel (SMS).",
    };
  }

  // Rule 2 — assess LinkedIn when we hold a profile URL.
  let activityVerdict: ActivityVerdict | undefined;
  if (lead.linkedinUrl) {
    const activity =
      lead.linkedInActivity ??
      (options.activityProvider
        ? (await safeActivity(options.activityProvider, lead)) ?? undefined
        : undefined);

    if (activity) {
      activityVerdict = await judgeLinkedInActivity(activity);
      if (activityVerdict.active) {
        return {
          channel: "linkedin",
          confidence: activityVerdict.score,
          reason: known
            ? `Prior interaction but no phone on file; active LinkedIn profile — engage on LinkedIn. ${activityVerdict.reason}`
            : `No prior interaction; active LinkedIn profile — engage on LinkedIn. ${activityVerdict.reason}`,
          activity: activityVerdict,
        };
      }
    }
  }

  // Rule 3 — fall back to email, then LinkedIn-as-last-resort, then nothing.
  if (lead.email) {
    return {
      channel: "email",
      confidence: 0.7,
      reason: activityVerdict
        ? `No prior interaction and LinkedIn looks dormant — reach out by email. ${activityVerdict.reason}`
        : "No prior interaction and no LinkedIn signal — reach out by email.",
      ...(activityVerdict ? { activity: activityVerdict } : {}),
    };
  }

  if (lead.linkedinUrl) {
    return {
      channel: "linkedin",
      confidence: 0.4,
      reason:
        "No email on file; LinkedIn is the only usable handle — engage on LinkedIn.",
      ...(activityVerdict ? { activity: activityVerdict } : {}),
    };
  }

  return {
    channel: "none",
    confidence: 0,
    reason: "No usable contact handle (no phone, email, or LinkedIn URL).",
  };
}

/** Run a CRM provider, treating any failure as "not a known contact". */
async function safeCrm(
  provider: CrmInteractionProvider,
  lead: RoutingLead,
): Promise<boolean> {
  try {
    return await provider(lead);
  } catch {
    return hasPriorInteraction(lead);
  }
}

/** Run an activity provider, treating any failure as "no signal". */
async function safeActivity(
  provider: LinkedInActivityProvider,
  lead: RoutingLead,
): Promise<LinkedInActivity | null> {
  try {
    return await provider(lead);
  } catch {
    return null;
  }
}
