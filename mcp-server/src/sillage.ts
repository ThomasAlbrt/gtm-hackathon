/**
 * Sillage API client — LinkedIn-native intent signals.
 *
 * Endpoints used:
 *   POST /v2/workspace/signals/query  (cursor-paginated, 100/page max)
 *   GET  /v2/workspace/signals/count
 *   GET  /v1/workspace/leads          (page-paginated, includes nested signals)
 */

const BASE = "https://api.getsillage.com/api";

function apiKey(): string {
  const key = process.env.SILLAGE_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing SILLAGE_API_KEY env.");
  }
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType =
  | "keywordDetection"
  | "newJob"
  | "recentlyPromoted"
  | "jobPostingKeywordDetection"
  | "competitorInboundComment"
  | "competitorOutboundComment"
  | "partnerInboundComment"
  | "partnerOutboundComment"
  | "customerInboundComment"
  | "customerOutboundComment"
  | "influencerInboundComment"
  | "influencerOutboundComment"
  | "championInboundComment"
  | "championOutboundComment";

export type Signal = {
  id: number;
  signal_type: SignalType;
  detected_at: string;
  signal_date: string;
  lead_id: number | null;
  company_id: number;
  agent_id: number;
  source_url: string | null;
  author: {
    full_name: string;
    headline: string;
    linkedin_url: string;
  } | null;
  excerpt: string | null;
  data: Record<string, unknown>;
};

export type Lead = {
  id: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string | null;
  position: string | null;
  linkedinUrl: string | null;
  company: {
    name: string;
    domain: string;
    linkedinUrl: string | null;
    numberOfEmployees: number | null;
  } | null;
  signals: LeadSignal[];
};

export type LeadSignal = {
  id: string;
  signalType: string;
  detectedAt: string;
  signalDate: string;
  agent: { id: string; name: string } | null;
  data: {
    post?: {
      url: string;
      extract: string;
      author: { full_name: string; headline: string; linkedin_url: string };
    };
    keywords_found?: string[];
    posting?: { title: string; job_url: string };
  };
};

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export type SignalQueryParams = {
  company_domain?: string[];
  type?: SignalType[];
  limit?: number;
  cursor?: string;
};

export async function querySignals(
  params: SignalQueryParams,
): Promise<{ signals: Signal[]; next_cursor: string | null; has_more: boolean }> {
  const body: Record<string, unknown> = {};
  if (params.company_domain?.length) body.company_domain = params.company_domain;
  if (params.type?.length) body.type = params.type;
  if (params.limit) body.limit = Math.min(params.limit, 100);
  if (params.cursor) body.cursor = params.cursor;

  const res = await fetch(`${BASE}/v2/workspace/signals/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Sillage signals/query ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    data: Signal[];
    meta: { next_cursor: string | null; has_more: boolean };
  };

  return {
    signals: json.data,
    next_cursor: json.meta.next_cursor,
    has_more: json.meta.has_more,
  };
}

export async function countSignals(
  companyDomain?: string,
): Promise<number> {
  const qs = companyDomain ? `?company_domain=${encodeURIComponent(companyDomain)}` : "";
  const res = await fetch(`${BASE}/v2/workspace/signals/count${qs}`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Sillage signals/count ${res.status}: ${await res.text()}`);
  }

  return ((await res.json()) as { total: number }).total;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function listLeads(
  page = 1,
  limit = 100,
): Promise<{ leads: Lead[]; totalPages: number }> {
  const res = await fetch(
    `${BASE}/v1/workspace/leads?page=${page}&limit=${Math.min(limit, 100)}`,
    { headers: headers() },
  );

  if (!res.ok) {
    throw new Error(`Sillage leads ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    data: Lead[];
    meta: { totalPages: number };
  };

  return { leads: json.data, totalPages: json.meta.totalPages };
}

export async function getAllLeads(): Promise<Lead[]> {
  const all: Lead[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { leads, totalPages } = await listLeads(page);
    all.push(...leads);
    if (page >= totalPages) break;
    page++;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Convenience: build a ranked account summary from leads
// ---------------------------------------------------------------------------

export type AccountSummary = {
  company: string;
  domain: string;
  leadCount: number;
  totalLeadSignals: number;
  topLeads: {
    name: string;
    position: string | null;
    email: string | null;
    linkedinUrl: string | null;
    signalCount: number;
    keywords: string[];
    topExcerpt: string | null;
  }[];
};

export function summarizeAccounts(leads: Lead[]): AccountSummary[] {
  const byCompany = new Map<string, Lead[]>();

  for (const lead of leads) {
    const key = lead.company?.domain ?? lead.company?.name ?? "unknown";
    const existing = byCompany.get(key) ?? [];
    existing.push(lead);
    byCompany.set(key, existing);
  }

  const accounts: AccountSummary[] = [];

  for (const [, companyLeads] of byCompany) {
    const first = companyLeads[0];
    const topLeads = companyLeads
      .map((l) => {
        const keywords = new Set<string>();
        let topExcerpt: string | null = null;

        for (const s of l.signals) {
          for (const kw of s.data.keywords_found ?? []) {
            keywords.add(kw.replace(/^"|"$/g, ""));
          }
          if (!topExcerpt && s.data.post?.extract) {
            topExcerpt = s.data.post.extract;
          }
        }

        return {
          name: `${l.firstName} ${l.lastName}`.trim(),
          position: l.position,
          email: l.email,
          linkedinUrl: l.linkedinUrl,
          signalCount: l.signals.length,
          keywords: [...keywords],
          topExcerpt,
        };
      })
      .sort((a, b) => b.signalCount - a.signalCount);

    accounts.push({
      company: first.company?.name ?? "Unknown",
      domain: first.company?.domain ?? "",
      leadCount: companyLeads.length,
      totalLeadSignals: topLeads.reduce((s, l) => s + l.signalCount, 0),
      topLeads,
    });
  }

  return accounts.sort((a, b) => b.totalLeadSignals - a.totalLeadSignals);
}
