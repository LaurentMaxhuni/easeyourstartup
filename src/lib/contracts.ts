import { z } from "zod";

export const channelSchema = z.enum([
  "x",
  "linkedin",
  "product_hunt",
  "reddit",
  "hacker_news",
  "instagram",
  "threads",
  "facebook",
  "email",
]);

export type Channel = z.infer<typeof channelSchema>;

export const campaignKindSchema = z.enum([
  "launch",
  "feature_update",
  "milestone",
  "waitlist",
  "promotion",
  "custom",
]);

export type CampaignKind = z.infer<typeof campaignKindSchema>;

const brandClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(400),
  sourceUrl: z.url(),
  sourceExcerpt: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1),
  approvalState: z.enum(["pending", "approved", "rejected"]),
});

export type BrandClaim = z.infer<typeof brandClaimSchema>;

const brandVisualSystemSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foregroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  radius: z.number().min(0).max(32),
  spacing: z.number().min(4).max(40),
  headingFont: z.string().min(1).max(100),
  bodyFont: z.string().min(1).max(100),
  density: z.enum(["compact", "comfortable", "airy"]),
  usesGradient: z.boolean(),
});

export type BrandVisualSystem = z.infer<typeof brandVisualSystemSchema>;

const brandEvidenceItemSchema = z.object({
  text: z.string().min(1).max(400),
  sourceUrl: z.url(),
  sourceExcerpt: z.string().min(1).max(1200),
});

export type BrandEvidenceItem = z.infer<typeof brandEvidenceItemSchema>;

const productScreenshotCandidateSchema = z.object({
  url: z.url(),
  sourceUrl: z.url(),
  alt: z.string().max(240),
});

export type ProductScreenshotCandidate = z.infer<
  typeof productScreenshotCandidateSchema
>;

const brandFontAssetSchema = z.object({
  family: z.string().min(1).max(80),
  url: z.url(),
  weight: z.string().regex(/^(?:normal|bold|[1-9]00|[1-9]00\s+[1-9]00)$/),
  style: z.enum(["normal", "italic", "oblique"]),
  unicodeRange: z
    .string()
    .max(400)
    .regex(/^[uU0-9a-fA-F?+,\s-]+$/)
    .optional(),
});

export type BrandFontAsset = z.infer<typeof brandFontAssetSchema>;

export const brandIntelligenceSchema = z.object({
  productPurpose: z.string().min(1).max(400),
  audience: z.string().min(1).max(400),
  painPoints: z.array(z.string().min(1).max(240)).max(6),
  benefits: z.array(z.string().min(1).max(240)).max(6),
  differentiators: z.array(z.string().min(1).max(240)).max(6),
  tone: z.array(z.string().min(1).max(48)).max(6),
  visualStyle: z.array(z.string().min(1).max(100)).max(6),
  unsupportedClaimsToAvoid: z.array(z.string().min(1).max(240)).max(8),
});

export type BrandIntelligence = z.infer<typeof brandIntelligenceSchema>;

export const brandProfileSchema = z.object({
  projectName: z.string().min(1).max(120),
  tagline: z.string().max(240),
  audience: z.string().max(400),
  voice: z.array(z.string().min(1).max(48)).max(6),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
  fonts: z.array(z.string().min(1).max(80)).max(6),
  fontAssets: z.array(brandFontAssetSchema).max(24).optional(),
  cta: z.string().max(120),
  claims: z.array(brandClaimSchema).max(30),
  logoUrl: z.url().nullable(),
  faviconUrl: z.url().nullable(),
  imageUrl: z.url().nullable().optional(),
  visualSystem: brandVisualSystemSchema.optional(),
  brandEvidence: z
    .object({
      pricing: z.array(brandEvidenceItemSchema).max(12),
      testimonials: z.array(brandEvidenceItemSchema).max(12),
    })
    .optional(),
  productScreenshotCandidates: z
    .array(productScreenshotCandidateSchema)
    .max(16)
    .optional(),
  brandIntelligence: brandIntelligenceSchema.optional(),
});

export type BrandProfile = z.infer<typeof brandProfileSchema>;

const sourcePageSchema = z.object({
  url: z.url(),
  title: z.string().max(240),
  excerpt: z.string().max(1200),
});

export type SourcePage = z.infer<typeof sourcePageSchema>;

const readinessFindingSchema = z.object({
  category: z.enum([
    "missing_proof",
    "unclear_cta",
    "weak_positioning",
    "screenshot_quality",
  ]),
  severity: z.enum(["good", "watch", "action"]),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(300),
});

export const scanResultSchema = z.object({
  profile: brandProfileSchema,
  pages: z.array(sourcePageSchema).max(6),
  readiness: z.array(readinessFindingSchema).max(4),
  desktopCaptureUrl: z.string().nullable(),
  mobileCaptureUrl: z.string().nullable(),
  warnings: z.array(z.string().max(280)),
  mode: z.enum(["live", "demo"]),
  curation: z
    .object({
      mode: z.enum(["ai", "rules"]),
      candidateCount: z.number().int().nonnegative(),
      keptCount: z.number().int().nonnegative(),
    })
    .optional(),
});

export type ScanResult = z.infer<typeof scanResultSchema>;

export const claimCurationResultSchema = z.object({
  keptClaimIds: z.array(z.string().min(1).max(80)).max(30),
});

export const narrativeAngleSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
});

export type NarrativeAngle = z.infer<typeof narrativeAngleSchema>;

export const channelOutputSchema = z.object({
  channel: channelSchema,
  primaryCopy: z.string().min(1).max(8000),
  alternateHooks: z.array(z.string().min(1).max(300)).max(3),
  cta: z.string().max(240),
  hashtags: z.array(z.string().max(80)).max(8),
  linkedClaimIds: z.array(z.string().min(1)).max(30),
  warnings: z.array(z.string().max(280)),
  associatedCreativeIds: z.array(z.string()).max(10),
});

export type ChannelOutput = z.infer<typeof channelOutputSchema>;

export const generateCampaignSchema = z.object({
  brand: brandProfileSchema,
  kind: campaignKindSchema,
  goal: z.string().min(8).max(500),
  updateDetails: z.string().min(8).max(2000),
  audience: z.string().min(2).max(400),
  launchDate: z.string().max(64),
  cta: z.string().min(1).max(240),
  angle: narrativeAngleSchema,
  channels: z.array(channelSchema).min(1).max(9),
});

export type GenerateCampaignInput = z.infer<typeof generateCampaignSchema>;

export const creativeIconSchema = z.enum([
  "sparkle",
  "rocket-launch",
  "chart-line-up",
  "users-three",
  "check-circle",
  "lightning",
  "shield-check",
  "arrow-up-right",
  "target",
  "cursor-click",
]);

export type CreativeIcon = z.infer<typeof creativeIconSchema>;

export const creativeGraphicSchema = z.enum([
  "none",
  "orbit",
  "grid",
  "spark-field",
  "signal",
]);

export type CreativeGraphic = z.infer<typeof creativeGraphicSchema>;

const creativeElementKindSchema = z.enum([
  "text",
  "image",
  "shape",
  "gradient",
  "icon",
]);
export const creativeElementEffectSchema = z.enum([
  "none",
  "float",
  "pulse",
  "glow",
  "drift",
  "rise",
]);
const creativeElementEffectTriggerSchema = z.enum([
  "always",
  "hover",
  "click",
]);
export const creativeElementShadowSchema = z.enum([
  "none",
  "soft",
  "lift",
  "glow",
]);
const creativeTextRoleSchema = z.enum([
  "eyebrow",
  "headline",
  "subheadline",
  "body",
  "cta",
  "footer",
]);
export type CreativeTextRole = z.infer<typeof creativeTextRoleSchema>;

const creativeElementSchema = z.object({
  id: z.string().min(1).max(80),
  kind: creativeElementKindSchema,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
  rotation: z.number().min(-180).max(180),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
  textRole: creativeTextRoleSchema.optional(),
  text: z.string().max(1000).optional(),
  src: z.string().min(1).max(1_000_000).optional(),
  alt: z.string().max(240).optional(),
  shape: z.enum(["rectangle", "circle", "line"]).optional(),
  icon: creativeIconSchema.optional(),
  fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  gradientFrom: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  gradientTo: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  gradientAngle: z.number().min(-360).max(360).optional(),
  effect: creativeElementEffectSchema.optional(),
  effectTrigger: creativeElementEffectTriggerSchema.optional(),
  shadow: creativeElementShadowSchema.optional(),
  blur: z.number().min(0).max(24).optional(),
  fontSize: z.number().min(0.4).max(20).optional(),
  fontWeight: z.number().int().min(300).max(800).optional(),
  fontFamily: z.string().min(1).max(100).optional(),
  lineHeight: z.number().min(0.6).max(2).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  radius: z.number().min(0).max(50).optional(),
  imageFit: z.enum(["cover", "contain"]).optional(),
  imagePositionX: z.number().min(0).max(100).optional(),
  imagePositionY: z.number().min(0).max(100).optional(),
});
export type CreativeElement = z.infer<typeof creativeElementSchema>;

export const creativeImageModeSchema = z.enum(["single", "devices"]);
export type CreativeMockupDevice = "desktop" | "tablet" | "phone";

const creativeMockupsSchema = z.object({
  desktop: z.string().min(1),
  tablet: z.string().min(1),
  phone: z.string().min(1),
});
export const creativeLayoutSchema = z.enum([
  "browser",
  "phone",
  "launch-card",
  "split",
  "editorial",
  "quote",
  "feature",
]);

export const creativeDirectionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  layout: creativeLayoutSchema,
  icon: creativeIconSchema,
  graphic: creativeGraphicSchema,
  imageMode: creativeImageModeSchema,
  eyebrow: z.string().max(80),
  headline: z.string().min(1).max(180),
  subheadline: z.string().max(320),
  body: z.string().max(520),
  cta: z.string().max(80),
  footer: z.string().max(120),
});

export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;

const screenshotCropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
});

export const creativeCompositionSchema = z.object({
  id: z.string().min(1),
  templateVersion: z.literal("1.0"),
  templateId: z.union([creativeLayoutSchema, z.literal("custom")]),
  output: z.object({
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(320).max(4096),
  }),
  screenshotUrl: z.string().min(1),
  imageMode: creativeImageModeSchema,
  mockups: creativeMockupsSchema,
  screenshotCrop: screenshotCropSchema,
  tokens: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.string().max(100),
    radius: z.number().min(0).max(32).optional(),
    spacing: z.number().min(4).max(40).optional(),
    headingFontFamily: z.string().max(100).optional(),
    bodyFontFamily: z.string().max(100).optional(),
    usesGradient: z.boolean().optional(),
  }),
  text: z.object({
    eyebrow: z.string().max(80),
    headline: z.string().min(1).max(180),
    subheadline: z.string().max(320),
    body: z.string().max(520),
    cta: z.string().max(80),
    footer: z.string().max(120),
  }),
  icon: creativeIconSchema,
  graphic: creativeGraphicSchema,
  elements: z.array(creativeElementSchema).max(40).optional(),
  designSource: z.literal("ai").optional(),
});

export type CreativeComposition = z.infer<typeof creativeCompositionSchema>;

const creativeDesignAssetSchema = z.enum([
  "primary",
  "desktop",
  "tablet",
  "phone",
  "brand-logo",
  "brand-favicon",
  "brand-image",
]);

const creativeDesignAssetRefSchema = z.union([
  creativeDesignAssetSchema,
  z.string().regex(/^product-screenshot-(?:[1-9]|1[0-6])$/),
  z.string().regex(/^existing-image-(?:[1-9]|[1-3][0-9]|40)$/),
]);

const creativeDesignElementBaseSchema = creativeElementSchema.omit({ src: true });

const creativeDesignElementSchema = z.discriminatedUnion("kind", [
  creativeDesignElementBaseSchema.extend({
    kind: z.literal("text"),
    textRole: creativeTextRoleSchema,
    text: z.string().min(1).max(1000),
  }),
  creativeDesignElementBaseSchema.extend({
    kind: z.literal("image"),
    asset: creativeDesignAssetRefSchema,
    alt: z.string().max(240).default(""),
  }),
  creativeDesignElementBaseSchema.extend({
    kind: z.literal("shape"),
    shape: z.enum(["rectangle", "circle", "line"]),
  }),
  creativeDesignElementBaseSchema.extend({
    kind: z.literal("icon"),
    icon: creativeIconSchema,
  }),
  creativeDesignElementBaseSchema.extend({
    kind: z.literal("gradient"),
    gradientFrom: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    gradientTo: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
]);

const creativeDesignThemeSchema = z.object({
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headingFontFamily: z.string().min(1).max(100),
  bodyFontFamily: z.string().min(1).max(100),
});

export const creativeDesignPlanSchema = z.object({
  theme: creativeDesignThemeSchema,
  elements: z.array(creativeDesignElementSchema).min(1).max(32),
});

export const creativeDesignResultSchema = z.object({
  theme: creativeDesignThemeSchema,
  elements: z.array(creativeElementSchema).min(1).max(32),
}).superRefine((design, context) => {
  const ids = new Set<string>();
  design.elements.forEach((element, index) => {
    if (ids.has(element.id)) {
      context.addIssue({ code: "custom", path: ["elements", index, "id"], message: "Design layer IDs must be unique." });
    }
    ids.add(element.id);
    if (element.kind === "image" && !element.src) {
      context.addIssue({ code: "custom", path: ["elements", index, "src"], message: "Design image layers must reference a verified asset." });
    }
    if (element.kind === "text" && (!element.textRole || !element.text?.trim())) {
      context.addIssue({ code: "custom", path: ["elements", index, "text"], message: "Design text layers need a role and non-empty text." });
    }
  });
});

export type CreativeDesignResult = z.infer<typeof creativeDesignResultSchema>;

const generationV2ArtifactSchema = z
  .record(z.string().max(80), z.json())
  .refine((artifact) => JSON.stringify(artifact).length <= 100_000);

const generationV2ResultSchema = z.object({
  strategy: generationV2ArtifactSchema,
  designPlan: generationV2ArtifactSchema,
  review: generationV2ArtifactSchema,
});

export const generationResultSchema = z.object({
  angles: z.array(narrativeAngleSchema).min(1).max(3),
  outputs: z.array(channelOutputSchema).min(1).max(9),
  creativeDirections: z.array(creativeDirectionSchema).min(1).max(9),
  creativeDesign: creativeDesignResultSchema.optional(),
  mode: z.enum(["ai", "deterministic"]),
  provider: z.enum(["groq", "nvidia-nim", "openrouter", "openai", "gemini", "cerebras", "mistral", "compatible"]).optional(),
  generationVersion: z.enum(["v1", "v2"]).optional(),
  generationV2: generationV2ResultSchema.optional(),
}).superRefine((generation, context) => {
  if (
    generation.generationVersion === "v2" &&
    !generation.generationV2
  ) {
    context.addIssue({
      code: "custom",
      path: ["generationV2"],
      message: "Generation V2 results must retain their validated planning artifacts.",
    });
  }
  if (generation.generationV2 && generation.generationVersion !== "v2") {
    context.addIssue({
      code: "custom",
      path: ["generationVersion"],
      message: "Generation V2 artifacts require the V2 generator version.",
    });
  }
});

export type GenerationResult = z.infer<typeof generationResultSchema>;

export const scanJobResultSchema = z.object({
  scan: scanResultSchema,
});

export const generateJobResultSchema = z.object({
  generation: generationResultSchema,
});

const studioStepSchema = z.enum([
  "scan",
  "brand",
  "campaign",
  "concepts",
  "creative",
]);

const studioDraftSchema = z.object({
  kind: campaignKindSchema,
  goal: z.string().max(500),
  updateDetails: z.string().max(2000),
  audience: z.string().max(400),
  launchDate: z.string().max(64),
  cta: z.string().max(240),
  angle: narrativeAngleSchema,
  channels: z.array(channelSchema).max(9),
});

export type StudioDraft = z.infer<typeof studioDraftSchema>;

export const studioConceptSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  message: z.string().min(1).max(2000),
  description: z.string().max(500).optional(),
  designId: z.uuid(),
  designRevision: z.number().int().positive(),
});

export type StudioConcept = z.infer<typeof studioConceptSchema>;

export const studioStateSchema = z.object({
  step: studioStepSchema,
  projectId: z.uuid().nullable().default(null),
  campaignId: z.uuid().nullable().default(null),
  jobId: z.uuid().nullable().default(null),
  jobType: z.enum(["scan", "generate", "regenerate", "export"]).nullable().default(null),
  scan: scanResultSchema.nullable(),
  brand: brandProfileSchema.nullable(),
  draft: studioDraftSchema,
  generation: generationResultSchema.nullable(),
  selectedCreativeId: z.string().max(64),
  outputs: z.array(channelOutputSchema).max(9),
  // Holds the scan's saved screenshot; the visual itself is the design below.
  composition: creativeCompositionSchema,
  // The campaign's visual: a design studio document at a saved revision.
  // Exports render exactly this revision.
  design: z.object({ id: z.uuid(), revision: z.number().int().positive() }).nullable().default(null),
  // Pre-campaign concept work stays in this project-scoped snapshot. Documents
  // are loaded by ID; keep full documents and previews out of the state payload.
  designJobId: z.uuid().nullable().default(null),
  concepts: z.array(studioConceptSchema).max(3).default([]),
  selectedConceptId: z.string().max(64).nullable().default(null),
  conceptsSourceFingerprint: z.string().max(64).nullable().default(null),
});

export type StudioState = z.infer<typeof studioStateSchema>;
