import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type LinkedInActivity,
  type RoutingLead,
  hasPriorInteraction,
  heuristicActivityScore,
  heuristicVerdict,
  parseVerdict,
  routeLead,
} from "../src/routing.js";

/** An active-looking LinkedIn profile: clears the heuristic threshold on its own. */
function activeActivity(): LinkedInActivity {
  return {
    followers: 3000,
    postCount: 6,
    commentCount: 4,
    signalCount: 2,
    lastActivityAt: new Date().toISOString(),
  };
}

describe("routing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Force the deterministic heuristic path — no Claude call in tests.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  describe("hasPriorInteraction", () => {
    it("is true when flagged or when a last-interaction date is present", () => {
      expect(hasPriorInteraction({ firstName: "Ada", hasPriorInteraction: true })).toBe(true);
      expect(
        hasPriorInteraction({ firstName: "Ada", lastInteractionAt: "2026-01-01" }),
      ).toBe(true);
    });

    it("is false with no CRM signal", () => {
      expect(hasPriorInteraction({ firstName: "Ada" })).toBe(false);
    });
  });

  describe("heuristicActivityScore", () => {
    it("scores an empty profile at zero", () => {
      expect(heuristicActivityScore({})).toBe(0);
      expect(heuristicVerdict({}).active).toBe(false);
    });

    it("clears the threshold for an active profile and clamps at 1", () => {
      expect(heuristicActivityScore(activeActivity())).toBe(1);
      expect(heuristicVerdict(activeActivity()).active).toBe(true);
    });

    it("ignores stale activity dates for the recency bonus", () => {
      expect(heuristicActivityScore({ lastActivityAt: "2000-01-01" })).toBe(0);
    });
  });

  describe("parseVerdict", () => {
    it("extracts a JSON verdict embedded in prose and clamps the score", () => {
      const verdict = parseVerdict(
        'Here you go: {"active": true, "score": 1.4, "reason": "Very active."} thanks',
      );
      expect(verdict).toEqual({
        active: true,
        score: 1,
        reason: "Very active.",
        judgedBy: "claude",
      });
    });

    it("returns null when there is no usable JSON", () => {
      expect(parseVerdict("no json here")).toBeNull();
      expect(parseVerdict('{"reason": "missing score"}')).toBeNull();
    });
  });

  describe("routeLead", () => {
    it("routes a known contact with a phone to SMS", async () => {
      const lead: RoutingLead = {
        firstName: "Ada",
        phone: "+15550100",
        email: "ada@acme.com",
        hasPriorInteraction: true,
      };
      const decision = await routeLead(lead);
      expect(decision.channel).toBe("sms");
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it("treats a last-interaction date as a prior interaction", async () => {
      const decision = await routeLead({
        firstName: "Ada",
        phone: "+15550100",
        lastInteractionAt: "2026-02-01",
      });
      expect(decision.channel).toBe("sms");
    });

    it("routes to LinkedIn when there is no prior interaction but the profile is active", async () => {
      const decision = await routeLead({
        firstName: "Grace",
        linkedinUrl: "https://www.linkedin.com/in/grace",
        email: "grace@globex.com",
        linkedInActivity: activeActivity(),
      });
      expect(decision.channel).toBe("linkedin");
      expect(decision.activity?.judgedBy).toBe("heuristic");
    });

    it("falls through a known contact WITHOUT a phone to LinkedIn when active", async () => {
      const decision = await routeLead({
        firstName: "Alan",
        hasPriorInteraction: true,
        linkedinUrl: "https://www.linkedin.com/in/alan",
        linkedInActivity: activeActivity(),
      });
      expect(decision.channel).toBe("linkedin");
      expect(decision.reason).toMatch(/prior interaction but no phone/i);
    });

    it("routes to email when there is no interaction and LinkedIn is dormant", async () => {
      const decision = await routeLead({
        firstName: "Grace",
        email: "grace@globex.com",
        linkedinUrl: "https://www.linkedin.com/in/grace",
        linkedInActivity: {},
      });
      expect(decision.channel).toBe("email");
      expect(decision.activity?.active).toBe(false);
    });

    it("routes to email when there is no interaction and no LinkedIn signal at all", async () => {
      const decision = await routeLead({
        firstName: "Grace",
        email: "grace@globex.com",
      });
      expect(decision.channel).toBe("email");
      expect(decision.activity).toBeUndefined();
    });

    it("uses LinkedIn as a last resort when there is no email", async () => {
      const decision = await routeLead({
        firstName: "Grace",
        linkedinUrl: "https://www.linkedin.com/in/grace",
        linkedInActivity: {},
      });
      expect(decision.channel).toBe("linkedin");
      expect(decision.confidence).toBeLessThan(0.5);
    });

    it("returns none when no handle is usable", async () => {
      const decision = await routeLead({ firstName: "Nobody" });
      expect(decision.channel).toBe("none");
      expect(decision.confidence).toBe(0);
    });

    it("consults a wired activity provider when the lead carries no activity", async () => {
      const provider = vi.fn().mockResolvedValue(activeActivity());
      const decision = await routeLead(
        { firstName: "Grace", linkedinUrl: "https://www.linkedin.com/in/grace" },
        { activityProvider: provider },
      );
      expect(provider).toHaveBeenCalledOnce();
      expect(decision.channel).toBe("linkedin");
    });

    it("consults a wired CRM provider for the prior-interaction signal", async () => {
      const crmProvider = vi.fn().mockResolvedValue(true);
      const decision = await routeLead(
        { firstName: "Ada", phone: "+15550100" },
        { crmProvider },
      );
      expect(crmProvider).toHaveBeenCalledOnce();
      expect(decision.channel).toBe("sms");
    });

    it("survives a throwing activity provider (best-effort) and falls back to email", async () => {
      const provider = vi.fn().mockRejectedValue(new Error("sillage down"));
      const decision = await routeLead(
        {
          firstName: "Grace",
          email: "grace@globex.com",
          linkedinUrl: "https://www.linkedin.com/in/grace",
        },
        { activityProvider: provider },
      );
      expect(decision.channel).toBe("email");
    });
  });
});
