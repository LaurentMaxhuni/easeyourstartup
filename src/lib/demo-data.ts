import type {
  BrandProfile,
  ChannelOutput,
  CreativeComposition,
  NarrativeAngle,
  ScanResult,
} from "@/lib/contracts";
import { OUTFIT_FONT_FAMILY } from "@/lib/typography";

export const DEMO_BRAND: BrandProfile = {
  projectName: "EaseYourStartup",
  tagline: "Turn every ship into a campaign.",
  audience: "Solo SaaS founders who ship often but struggle to launch consistently.",
  voice: ["direct", "practical", "optimistic"],
  colors: ["#245cf0", "#171917", "#f4f3ef"],
  fonts: [OUTFIT_FONT_FAMILY],
  cta: "Build your launch campaign",
  logoUrl: null,
  faviconUrl: null,
  claims: [
    {
      id: "claim-campaign",
      text: "Turns a website and product update into channel-specific launch copy.",
      sourceUrl: "https://demo.easeyourstartup.com/product",
      sourceExcerpt:
        "Create tailored copy for X, LinkedIn, Product Hunt, Reddit, Hacker News, Instagram, Threads, Facebook, and email.",
      confidence: 0.99,
      approvalState: "approved",
    },
    {
      id: "claim-screens",
      text: "Keeps real product screenshots at the center of launch visuals.",
      sourceUrl: "https://demo.easeyourstartup.com/visuals",
      sourceExcerpt:
        "Captured pages and uploaded screenshots stay visually faithful in every exported creative.",
      confidence: 0.98,
      approvalState: "approved",
    },
    {
      id: "claim-room",
      text: "Creates a supporter room with source-backed copy and downloadable visuals.",
      sourceUrl: "https://demo.easeyourstartup.com/share",
      sourceExcerpt:
        "Supporters can copy a prepared message and download the matching launch image.",
      confidence: 0.97,
      approvalState: "approved",
    },
  ],
  visualSystem: {
    backgroundColor: "#245cf0",
    foregroundColor: "#f4f3ef",
    accentColor: "#171917",
    radius: 8,
    spacing: 16,
    headingFont: OUTFIT_FONT_FAMILY,
    bodyFont: OUTFIT_FONT_FAMILY,
    density: "comfortable",
    usesGradient: false,
  },
};

export const DEMO_SCAN: ScanResult = {
  profile: DEMO_BRAND,
  pages: [
    {
      url: "https://demo.easeyourstartup.com/product",
      title: "Product",
      excerpt: DEMO_BRAND.claims[0].sourceExcerpt,
    },
    {
      url: "https://demo.easeyourstartup.com/visuals",
      title: "Visual studio",
      excerpt: DEMO_BRAND.claims[1].sourceExcerpt,
    },
    {
      url: "https://demo.easeyourstartup.com/share",
      title: "Supporter room",
      excerpt: DEMO_BRAND.claims[2].sourceExcerpt,
    },
  ],
  readiness: [
    {
      category: "missing_proof",
      severity: "watch",
      title: "Add customer proof",
      detail:
        "The product story is clear, but a customer quote or concrete example would make the launch more credible.",
    },
    {
      category: "unclear_cta",
      severity: "good",
      title: "CTA is specific",
      detail: "Build your launch campaign tells visitors what happens next.",
    },
    {
      category: "weak_positioning",
      severity: "good",
      title: "Positioning is concise",
      detail: "The homepage makes the shipping and launching gap easy to grasp.",
    },
    {
      category: "screenshot_quality",
      severity: "good",
      title: "Screens are launch-ready",
      detail: "A clear desktop capture is available for visual templates.",
    },
  ],
  desktopCaptureUrl: "/images/studio-capture.png",
  mobileCaptureUrl: "/images/studio-capture-mobile.png",
  warnings: [],
  mode: "demo",
};

export const DEMO_ANGLES: NarrativeAngle[] = [
  {
    id: "ship-to-campaign",
    title: "From ship to campaign",
    summary:
      "Lead with the gap between building a feature and giving it a real launch.",
  },
  {
    id: "proof-first",
    title: "Proof before polish",
    summary:
      "Show how source-backed copy and real screenshots keep launch assets credible.",
  },
  {
    id: "founder-rhythm",
    title: "A repeatable launch rhythm",
    summary:
      "Frame each product update as a new reason for customers to pay attention.",
  },
];

export const DEMO_OUTPUTS: ChannelOutput[] = [
  {
    channel: "x",
    primaryCopy:
      "Shipping the feature is only half the job.\n\nEaseYourStartup turns your site and update notes into channel-specific launch copy, then builds visuals around your real product screenshots.\n\nTurn every ship into a campaign.",
    alternateHooks: [
      "Your changelog is not a launch.",
      "You built the feature. Now give it a campaign.",
    ],
    cta: "Build your launch campaign",
    hashtags: [],
    linkedClaimIds: ["claim-campaign", "claim-screens"],
    warnings: [],
    associatedCreativeIds: ["demo-creative"],
  },
  {
    channel: "linkedin",
    primaryCopy:
      "A product update can take weeks to build and ten quiet minutes to announce.\n\nThat gap is why we built EaseYourStartup.\n\nIt turns a website and update notes into platform-specific campaign copy, then uses real product screenshots to create faithful launch visuals. Every factual claim stays linked to its source.\n\nThe goal is simple: make a proper launch part of every shipping cycle.",
    alternateHooks: [
      "Most product updates disappear because their launch is an afterthought.",
      "The feature shipped. The story still needs to.",
    ],
    cta: "Build your launch campaign",
    hashtags: ["#buildinpublic", "#saas"],
    linkedClaimIds: ["claim-campaign", "claim-screens"],
    warnings: [],
    associatedCreativeIds: ["demo-creative"],
  },
  {
    channel: "product_hunt",
    primaryCopy:
      "Hey Product Hunt, EaseYourStartup is for founders who keep shipping but struggle to turn each update into a real campaign.\n\nPaste your public site, let the scan filter the source-backed Brand DNA, add your update, and get channel-specific copy plus visuals made from your actual product screenshots.\n\nNo invented interfaces. No unsupported claims. Just a practical path from shipped to launched.",
    alternateHooks: [
      "Turn every ship into a campaign.",
      "Launch copy and visuals grounded in your real product.",
    ],
    cta: "Try the free launch scan",
    hashtags: [],
    linkedClaimIds: ["claim-campaign", "claim-screens"],
    warnings: [],
    associatedCreativeIds: ["demo-creative"],
  },
];

export const DEMO_COMPOSITION: CreativeComposition = {
  id: "demo-creative",
  templateVersion: "1.0",
  templateId: "browser",
  output: { width: 1200, height: 1500 },
  screenshotUrl: "/images/studio-capture.png",
  imageMode: "single",
  mockups: {
    desktop: "/images/studio-capture.png",
    tablet: "/images/studio-capture.png",
    phone: "/images/studio-capture.png",
  },
  screenshotCrop: { x: 0, y: 0, width: 100, height: 100 },
  tokens: {
    background: "#245cf0",
    foreground: "#f4f3ef",
    accent: "#171917",
    fontFamily: OUTFIT_FONT_FAMILY,
    headingFontFamily: OUTFIT_FONT_FAMILY,
    bodyFontFamily: OUTFIT_FONT_FAMILY,
    radius: 8,
    spacing: 16,
    usesGradient: false,
  },
  text: {
    eyebrow: "EaseYourStartup",
    headline: "Turn every ship into a campaign.",
    subheadline:
      "Build a launch story from the product you already shipped.",
    body:
      "Source-backed copy, real product visuals, and channel-ready exports for the next release.",
    cta: "Build your launch",
    footer: "Source-backed launch studio",
  },
  icon: "rocket-launch",
  graphic: "orbit",
};
