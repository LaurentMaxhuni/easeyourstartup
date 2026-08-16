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

export const jobStatusSchema = z.enum([
  "queued",
  "scanning",
  "analyzing",
  "generating",
  "rendering",
  "completed",
  "failed",
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const brandClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(400),
  sourceUrl: z.url(),
  sourceExcerpt: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1),
  approvalState: z.enum(["pending", "approved", "rejected"]),
});

export type BrandClaim = z.infer<typeof brandClaimSchema>;

export const brandProfileSchema = z.object({
  projectName: z.string().min(1).max(120),
  tagline: z.string().max(240),
  audience: z.string().max(400),
  voice: z.array(z.string().min(1).max(48)).max(6),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
  fonts: z.array(z.string().min(1).max(80)).max(6),
  cta: z.string().max(120),
  claims: z.array(brandClaimSchema).max(30),
  logoUrl: z.url().nullable(),
  faviconUrl: z.url().nullable(),
  imageUrl: z.url().nullable().optional(),
});

export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const sourcePageSchema = z.object({
  url: z.url(),
  title: z.string().max(240),
  excerpt: z.string().max(1200),
});

export type SourcePage = z.infer<typeof sourcePageSchema>;

export const readinessFindingSchema = z.object({
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
});

export type ScanResult = z.infer<typeof scanResultSchema>;

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

export const creativeElementKindSchema = z.enum([
  "text",
  "image",
  "shape",
  "gradient",
  "icon",
]);
export type CreativeElementKind = z.infer<typeof creativeElementKindSchema>;

export const creativeElementEffectSchema = z.enum([
  "none",
  "float",
  "pulse",
  "glow",
  "drift",
  "rise",
]);
export type CreativeElementEffect = z.infer<typeof creativeElementEffectSchema>;

export const creativeElementEffectTriggerSchema = z.enum([
  "always",
  "hover",
  "click",
]);
export type CreativeElementEffectTrigger = z.infer<
  typeof creativeElementEffectTriggerSchema
>;

export const creativeElementShadowSchema = z.enum([
  "none",
  "soft",
  "lift",
  "glow",
]);
export type CreativeElementShadow = z.infer<
  typeof creativeElementShadowSchema
>;

export const creativeTextRoleSchema = z.enum([
  "eyebrow",
  "headline",
  "subheadline",
  "body",
  "cta",
  "footer",
]);
export type CreativeTextRole = z.infer<typeof creativeTextRoleSchema>;

export const creativeElementSchema = z.object({
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
  align: z.enum(["left", "center", "right"]).optional(),
  radius: z.number().min(0).max(50).optional(),
});
export type CreativeElement = z.infer<typeof creativeElementSchema>;

export const creativeRewriteSchema = z.object({
  text: z.string().min(1).max(1000),
  role: creativeTextRoleSchema,
  instruction: z.string().max(240).optional(),
  projectName: z.string().min(1).max(120),
  context: z.string().max(2000),
  approvedFacts: z.array(z.string().min(1).max(400)).max(12),
});
export type CreativeRewriteInput = z.infer<typeof creativeRewriteSchema>;

export const creativeRewriteResultSchema = z.object({
  text: z.string().min(1).max(1000),
});
export type CreativeRewriteResult = z.infer<typeof creativeRewriteResultSchema>;

export const creativeImageModeSchema = z.enum(["single", "devices"]);
export type CreativeImageMode = z.infer<typeof creativeImageModeSchema>;

export const creativeMockupDeviceSchema = z.enum([
  "desktop",
  "tablet",
  "phone",
]);
export type CreativeMockupDevice = z.infer<
  typeof creativeMockupDeviceSchema
>;

export const creativeMockupsSchema = z.object({
  desktop: z.string().min(1),
  tablet: z.string().min(1),
  phone: z.string().min(1),
});
export type CreativeMockups = z.infer<typeof creativeMockupsSchema>;

export const creativeCodeBundleSchema = z.object({
  html: z.string().min(1).max(50_000),
  css: z.string().min(1).max(50_000),
  javascript: z.string().min(1).max(30_000),
});
export type CreativeCodeBundle = z.infer<typeof creativeCodeBundleSchema>;

export const creativeLayoutSchema = z.enum([
  "browser",
  "phone",
  "launch-card",
  "split",
  "editorial",
  "quote",
  "feature",
]);

export type CreativeLayout = z.infer<typeof creativeLayoutSchema>;

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

export const generationResultSchema = z.object({
  angles: z.array(narrativeAngleSchema).min(1).max(3),
  outputs: z.array(channelOutputSchema).min(1).max(9),
  creativeDirections: z.array(creativeDirectionSchema).min(1).max(3),
  mode: z.literal("ai"),
  provider: z.enum(["groq", "openrouter", "openai", "compatible"]).optional(),
});

export type GenerationResult = z.infer<typeof generationResultSchema>;

export const screenshotCropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
});

export const creativeCompositionSchema = z.object({
  id: z.string().min(1),
  templateVersion: z.literal("1.0"),
  templateId: creativeLayoutSchema,
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
  codeBundle: creativeCodeBundleSchema.optional(),
  codeSource: z.literal("ai").optional(),
});

export type CreativeComposition = z.infer<typeof creativeCompositionSchema>;

export const creativeDesignAssetSchema = z.enum([
  "primary",
  "desktop",
  "tablet",
  "phone",
]);

export type CreativeDesignAsset = z.infer<typeof creativeDesignAssetSchema>;

export const creativeDesignElementSchema = creativeElementSchema
  .omit({ src: true })
  .extend({
    asset: creativeDesignAssetSchema.optional(),
  });

export type CreativeDesignElement = z.infer<
  typeof creativeDesignElementSchema
>;

export const creativeDesignResultSchema = z.object({
  templateId: creativeLayoutSchema,
  imageMode: creativeImageModeSchema,
  screenshotCrop: screenshotCropSchema,
  tokens: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.string().max(100),
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
  elements: z.array(creativeDesignElementSchema).min(1).max(16),
});

export type CreativeDesignResult = z.infer<typeof creativeDesignResultSchema>;

export const creativeDesignGenerationSchema = z.object({
  design: creativeDesignResultSchema,
  code: creativeCodeBundleSchema,
  provider: z.enum(["groq", "openrouter", "openai", "compatible"]),
});
export type CreativeDesignGeneration = z.infer<
  typeof creativeDesignGenerationSchema
>;

export const creativeDesignRequestSchema = z.object({
  projectName: z.string().min(1).max(120),
  context: z.string().max(2200),
  approvedFacts: z.array(z.string().min(1).max(400)).max(12),
  instruction: z.string().max(500).optional(),
  composition: creativeCompositionSchema,
});

export type CreativeDesignInput = z.infer<typeof creativeDesignRequestSchema>;

export const studioStepSchema = z.enum([
  "scan",
  "brand",
  "campaign",
  "creative",
]);

export type StudioStep = z.infer<typeof studioStepSchema>;

export const studioDraftSchema = z.object({
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

export const studioStateSchema = z.object({
  step: studioStepSchema,
  scan: scanResultSchema.nullable(),
  brand: brandProfileSchema.nullable(),
  draft: studioDraftSchema,
  generation: generationResultSchema.nullable(),
  selectedCreativeId: z.string().max(64),
  outputs: z.array(channelOutputSchema).max(9),
  composition: creativeCompositionSchema,
});

export type StudioState = z.infer<typeof studioStateSchema>;
