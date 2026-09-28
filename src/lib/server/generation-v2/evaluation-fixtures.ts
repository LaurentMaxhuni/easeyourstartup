import type { BrandProfile, GenerateCampaignInput } from "@/lib/contracts";

export type GenerationV2EvaluationFixture = {
  id: string;
  profile: BrandProfile;
  sourceUrl: string;
  sourceExcerpt: string;
  updateDetails: string;
  cta: string;
};

// Stable product descriptions from first-party sources. These avoid pricing,
// customer outcomes, testimonials, and time-sensitive metrics.
export const GENERATION_V2_EVALUATION_FIXTURES = [
  {
    id: "stripe",
    profile: {
      projectName: "Stripe",
      tagline: "Economic infrastructure for the internet",
      audience: "Businesses that accept payments and manage operations online",
      voice: ["clear", "precise"],
      colors: ["#635BFF"],
      fonts: ["Inter"],
      cta: "Explore Stripe",
      claims: [
        {
          id: "stripe-economic-infrastructure",
          text: "Stripe is a technology company that builds economic infrastructure for the internet.",
          sourceUrl: "https://stripe.com/newsroom/information",
          sourceExcerpt:
            "Stripe is a technology company that builds economic infrastructure for the internet.",
          confidence: 1,
          approvalState: "approved",
        },
      ],
      logoUrl: null,
      faviconUrl: null,
    },
    sourceUrl: "https://stripe.com/newsroom/information",
    sourceExcerpt:
      "Stripe is a technology company that builds economic infrastructure for the internet.",
    updateDetails:
      "Stripe is a technology company that builds economic infrastructure for the internet.",
    cta: "Explore Stripe",
  },
  {
    id: "figma",
    profile: {
      projectName: "Figma",
      tagline: "Create, share, and test digital product designs",
      audience: "People designing websites, mobile apps, and other digital products",
      voice: ["collaborative", "practical"],
      colors: ["#0ACF83"],
      fonts: ["Inter"],
      cta: "Explore Figma Design",
      claims: [
        {
          id: "figma-design-create-share-test",
          text: "Figma Design is for people to create, share, and test designs for websites, mobile apps, and other digital products and experiences.",
          sourceUrl:
            "https://help.figma.com/hc/en-us/articles/14563969806359-What-is-Figma-",
          sourceExcerpt:
            "Figma Design is for people to create, share, and test designs for websites, mobile apps, and other digital products and experiences.",
          confidence: 1,
          approvalState: "approved",
        },
      ],
      logoUrl: null,
      faviconUrl: null,
    },
    sourceUrl:
      "https://help.figma.com/hc/en-us/articles/14563969806359-What-is-Figma-",
    sourceExcerpt:
      "Figma Design is for people to create, share, and test designs for websites, mobile apps, and other digital products and experiences.",
    updateDetails:
      "Figma Design is for people to create, share, and test designs for websites, mobile apps, and other digital products and experiences.",
    cta: "Explore Figma Design",
  },
  {
    id: "linear",
    profile: {
      projectName: "Linear",
      tagline: "Plan, track, and ship product work",
      audience: "Product and engineering teams tracking work",
      voice: ["direct", "focused"],
      colors: ["#5E6AD2"],
      fonts: ["Inter"],
      cta: "Explore Linear",
      claims: [
        {
          id: "linear-issues-unit-of-work",
          text: "Issues are the fundamental unit of work in Linear. They represent anything a team needs to track, such as bugs, feature work, follow-up tasks, or internal requests.",
          sourceUrl: "https://linear.app/docs/conceptual-model",
          sourceExcerpt:
            "Issues are the fundamental unit of work in Linear. They represent anything a team needs to track, such as bugs, feature work, follow-up tasks, or internal requests.",
          confidence: 1,
          approvalState: "approved",
        },
      ],
      logoUrl: null,
      faviconUrl: null,
    },
    sourceUrl: "https://linear.app/docs/conceptual-model",
    sourceExcerpt:
      "Issues are the fundamental unit of work in Linear. They represent anything a team needs to track, such as bugs, feature work, follow-up tasks, or internal requests.",
    updateDetails:
      "Issues are the fundamental unit of work in Linear. They represent anything a team needs to track, such as bugs, feature work, follow-up tasks, or internal requests.",
    cta: "Explore Linear",
  },
] satisfies GenerationV2EvaluationFixture[];

export function campaignInputForEvaluationFixture(
  fixture: GenerationV2EvaluationFixture,
): GenerateCampaignInput {
  return {
    brand: fixture.profile,
    kind: "launch",
    goal: `Introduce ${fixture.profile.projectName} using source-backed product details`,
    updateDetails: fixture.updateDetails,
    audience: fixture.profile.audience,
    launchDate: "",
    cta: fixture.cta,
    angle: {
      id: `${fixture.id}-source-first`,
      title: "Lead with the product",
      summary: "State the documented product capability before the next step.",
    },
    channels: ["linkedin", "email"],
  };
}
