"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Copy,
  CaretDown,
  CaretUp,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileZip,
  FloppyDisk,
  ImageSquare,
  LockKey,
  LockKeyOpen,
  Minus,
  Plus,
  Shapes,
  Sparkle,
  Stack,
  Target,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextT,
  Trash,
  UploadSimple,
  type Icon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChannelOutputs } from "@/components/studio/channel-outputs";
import { CreativeGraphic } from "@/components/studio/creative-icons";
import { CreativeIconGlyph } from "@/components/studio/creative-icons";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Select } from "@/components/ui/select";
import {
  creativeElementEffectSchema,
  creativeElementShadowSchema,
  creativeGraphicSchema,
  creativeIconSchema,
  creativeImageModeSchema,
  type ChannelOutput,
  type BrandClaim,
  type CreativeComposition,
  type CreativeDirection,
  type CreativeDesignInput,
  type CreativeDesignResult,
  type CreativeElement,
  type CreativeTextRole,
  type CreativeRewriteInput,
  type CreativeMockupDevice,
} from "@/lib/contracts";
import type { LaunchKitReadiness } from "@/lib/launch-kit";
import {
  addEditorElement,
  applyCreativeDesign,
  duplicateEditorElement,
  getEditorElements,
  moveEditorElement,
  removeEditorElement,
  reorderEditorElement,
  resizeEditorElement,
  syncCompositionText,
  updateEditorElement,
} from "@/lib/studio/editor-state";
import {
  creativeLayerEffectClass,
  creativeLayerShadow,
} from "@/lib/studio/creative-effects";
import { cn } from "@/lib/utils";

const TEMPLATES: Array<{
  id: CreativeComposition["templateId"];
  name: string;
  note: string;
}> = [
  { id: "browser", name: "Browser", note: "Product proof" },
  { id: "phone", name: "Phone", note: "Vertical story" },
  { id: "launch-card", name: "Launch card", note: "Direct CTA" },
  { id: "split", name: "Split", note: "Text + visual" },
  { id: "editorial", name: "Editorial", note: "Big statement" },
  { id: "quote", name: "Quote", note: "Proof first" },
  { id: "feature", name: "Feature", note: "Device story" },
];

const RATIOS = [
  { name: "4:5", width: 1200, height: 1500 },
  { name: "1:1", width: 1200, height: 1200 },
  { name: "16:9", width: 1600, height: 900 },
  { name: "1.91:1", width: 1200, height: 628 },
] as const;

function JsonSyntax({ source }: { source: string }) {
  const tokens = [
    ...source.matchAll(
      /"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g,
    ),
  ];
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const start = token.index ?? cursor;
    if (start > cursor) nodes.push(source.slice(cursor, start));

    const value = token[0];
    const isString = value.startsWith('"');
    const isKey = isString && source.slice(start + value.length).trimStart().startsWith(":");
    const color = isKey
      ? "text-[#9cdcfe]"
      : isString
        ? "text-[#ce9178]"
        : /^(?:true|false|null)$/.test(value)
          ? "text-[#dcdcaa]"
          : /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
            ? "text-[#b5cea8]"
            : "text-[#d4d4d4]";

    nodes.push(
      <span key={start} className={color}>
        {value}
      </span>,
    );
    cursor = start + value.length;
  }

  if (cursor < source.length) nodes.push(source.slice(cursor));
  return <>{nodes}</>;
}

const TEXT_ROLES: Array<{ role: CreativeTextRole; label: string; sample: string }> = [
  { role: "headline", label: "Heading", sample: "A clear launch headline" },
  { role: "subheadline", label: "Subheading", sample: "A supporting line" },
  { role: "body", label: "Body text", sample: "Add a useful product detail." },
  { role: "cta", label: "Button", sample: "Try it now" },
  { role: "eyebrow", label: "Eyebrow", sample: "A short label" },
];

const TOOL_ITEMS: Array<{
  id: EditorTool;
  label: string;
  icon: Icon;
}> = [
  { id: "templates", label: "Templates", icon: Stack },
  { id: "text", label: "Text", icon: TextT },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "uploads", label: "Uploads", icon: UploadSimple },
  { id: "ai", label: "AI design", icon: Sparkle },
  { id: "copy", label: "Copy", icon: Copy },
  { id: "directions", label: "Directions", icon: Target },
  { id: "export", label: "Export", icon: DownloadSimple },
];

type EditorTool =
  | "templates"
  | "text"
  | "elements"
  | "uploads"
  | "ai"
  | "copy"
  | "directions"
  | "export";
type GestureMode = "move" | "resize";
type EditorView = "canvas" | "spec" | "preview";

type Gesture = {
  mode: GestureMode;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  element: CreativeElement;
};

type AiRewriteResponse = {
  text: string;
  mode: "ai";
};

type AiDesignResponse = {
  design: CreativeDesignResult;
  mode: "ai";
  provider?: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible";
};

export type CreativeAiContext = {
  projectName: string;
  context: string;
  approvedFacts: string[];
  approvedClaims: BrandClaim[];
};

function elementLabel(element: CreativeElement) {
  if (element.kind === "text") {
    return element.textRole
      ? element.textRole.charAt(0).toUpperCase() + element.textRole.slice(1)
      : "Text";
  }
  if (element.kind === "image") return "Image";
  if (element.kind === "icon") return "Icon";
  if (element.kind === "gradient") return "Gradient";
  return element.shape === "circle" ? "Circle" : element.shape === "line" ? "Line" : "Rectangle";
}

function elementPreview(element: CreativeElement) {
  if (element.kind === "text") return element.text?.trim() || "Empty text";
  if (element.kind === "image") return "Product image";
  if (element.kind === "icon") return element.icon ?? "Accent icon";
  if (element.kind === "gradient") return "Color wash";
  return "Shape element";
}

function aiProviderLabel(
  provider: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible" | undefined,
) {
  if (provider === "groq") return "Groq AI";
  if (provider === "nvidia-nim") return "NVIDIA NIM";
  if (provider === "openrouter") return "OpenRouter AI";
  if (provider === "openai") return "OpenAI";
  if (provider === "compatible") return "AI provider";
  return "AI provider";
}

function canvasSourceLabel(
  status: "idle" | "loading" | "ai" | "error",
  provider: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible" | undefined,
) {
  if (status === "loading") {
    return `${aiProviderLabel(provider)} designing…`;
  }
  if (status === "ai") return `${aiProviderLabel(provider)} canvas`;
  if (status === "error") return "Canvas AI unavailable";
  return "AI canvas required";
}

function sameElements(first: CreativeElement[], second: CreativeElement[]) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function prepareDesignComposition(composition: CreativeComposition) {
  const safeAssets = {
    primary: "/__studio-assets__/primary",
    desktop: "/__studio-assets__/desktop",
    tablet: "/__studio-assets__/tablet",
    phone: "/__studio-assets__/phone",
  } as const;

  function safeAsset(source: string | undefined) {
    if (!source) return safeAssets.primary;
    if (source === composition.mockups.desktop) return safeAssets.desktop;
    if (source === composition.mockups.tablet) return safeAssets.tablet;
    if (source === composition.mockups.phone) return safeAssets.phone;
    return /^data:/i.test(source) || source.length > 3_500
      ? safeAssets.primary
      : source;
  }

  return {
    ...composition,
    screenshotUrl: safeAsset(composition.screenshotUrl),
    mockups: {
      desktop: safeAssets.desktop,
      tablet: safeAssets.tablet,
      phone: safeAssets.phone,
    },
    elements: composition.elements?.map((element) =>
      element.kind === "image"
        ? { ...element, src: safeAsset(element.src) }
        : element,
    ),
  };
}

function makeTextElement(
  role: CreativeTextRole,
  text: string,
  composition: CreativeComposition,
  id: string,
): CreativeElement {
  const centered = composition.templateId === "quote";
  const positions: Record<CreativeTextRole, Pick<CreativeElement, "x" | "y" | "width" | "height" | "fontSize">> = {
    eyebrow: { x: 9, y: 8, width: 55, height: 6, fontSize: 1.5 },
    headline: { x: 9, y: 21, width: 72, height: 18, fontSize: 4.4 },
    subheadline: { x: 9, y: 43, width: 64, height: 10, fontSize: 2 },
    body: { x: 9, y: 57, width: 58, height: 13, fontSize: 1.35 },
    cta: { x: 9, y: 78, width: 26, height: 7, fontSize: 1.4 },
    footer: { x: 68, y: 89, width: 24, height: 5, fontSize: 0.9 },
  };
  const position = positions[role];
  return {
    id,
    kind: "text",
    ...position,
    x: centered ? 12 : position.x,
    width: centered ? 76 : position.width,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    textRole: role,
    text,
    color:
      role === "cta"
        ? composition.tokens.accent
        : composition.tokens.foreground,
    fontWeight: role === "headline" || role === "cta" ? 650 : 450,
    align: centered ? "center" : "left",
    radius: role === "cta" ? composition.tokens.radius ?? 8 : 0,
  };
}

function makeShapeElement(
  shape: "rectangle" | "circle" | "line",
  id: string,
  fill: string,
  composition: CreativeComposition,
): CreativeElement {
  return {
    id,
    kind: "shape",
    x: shape === "line" ? 10 : 18,
    y: shape === "line" ? 74 : 25,
    width: shape === "line" ? 80 : 24,
    height: shape === "line" ? 1.2 : 24,
    rotation: 0,
    opacity: 0.85,
    locked: false,
    hidden: false,
    shape,
    fill,
    radius: shape === "circle" ? 50 : composition.tokens.radius ?? 8,
  };
}

function makeGradientElement(
  id: string,
  from: string,
  to: string,
): CreativeElement {
  return {
    id,
    kind: "gradient",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 0.9,
    locked: false,
    hidden: false,
    gradientFrom: from,
    gradientTo: to,
    gradientAngle: 135,
    effect: "drift",
    effectTrigger: "always",
  };
}

function makeIconElement(
  id: string,
  icon: CreativeElement["icon"],
  color: string,
): CreativeElement {
  return {
    id,
    kind: "icon",
    x: 78,
    y: 10,
    width: 12,
    height: 12,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    icon: icon ?? "sparkle",
    color,
    effect: "pulse",
    effectTrigger: "hover",
    shadow: "glow",
  };
}

function makeImageElement(
  src: string,
  id: string,
  x = 56,
  y = 11,
  width = 37,
  height = 67,
): CreativeElement {
  return {
    id,
    kind: "image",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    src,
    radius: 7,
  };
}

function renderTextElement(
  element: CreativeElement,
  composition: CreativeComposition,
) {
  const isCta = element.textRole === "cta";
  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden whitespace-pre-wrap break-words",
        isCta && "flex items-center px-[5%]",
      )}
      style={{
        color:
          element.color ??
          (isCta ? composition.tokens.background : composition.tokens.foreground),
        backgroundColor: isCta
          ? element.fill ?? composition.tokens.foreground
          : "transparent",
        // Scale the export's 8px floor with the canvas, not the screen viewport.
        fontSize: `${Math.max(800 / composition.output.width, element.fontSize ?? 1.5)}cqw`,
        justifyContent: isCta
          ? element.align === "right" ? "flex-end" : element.align === "center" ? "center" : "flex-start"
          : undefined,
        fontWeight: element.fontWeight ?? 450,
        lineHeight:
          element.lineHeight ??
          (element.textRole === "headline" ? 0.96 : 1.2),
        textAlign: element.align ?? "left",
        borderRadius: isCta
          ? `${element.radius ?? composition.tokens.radius ?? 8}px`
          : undefined,
        textTransform:
          element.textTransform ??
          (element.textRole === "eyebrow" ? "uppercase" : undefined),
      }}
    >
      {element.text}
    </div>
  );
}

function LayerVisual({
  element,
  composition,
}: {
  element: CreativeElement;
  composition: CreativeComposition;
}) {
  if (element.hidden) return null;
  const sourceRadius = composition.tokens.radius ?? 8;
  const style = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    transformOrigin: "center",
  };
  const effectClass = creativeLayerEffectClass(element);
  const shadow = creativeLayerShadow(element, composition.tokens.accent);
  const visualStyle = {
    opacity: element.opacity,
    filter: element.blur ? `blur(${element.blur}px)` : undefined,
    boxShadow: shadow,
  };

  return (
    <div className="absolute" style={style}>
      <div className={cn("h-full w-full", effectClass)} style={visualStyle}>
        {element.kind === "text" && renderTextElement(element, composition)}
        {element.kind === "image" && element.src && (
          <div
            className={cn(
              "relative h-full w-full overflow-hidden",
              composition.designSource !== "ai" && "bg-white/10",
            )}
            style={{
              borderRadius: `${element.radius ?? sourceRadius}px`,
              border:
                composition.designSource === "ai"
                  ? undefined
                  : `1px solid color-mix(in srgb, ${composition.tokens.foreground} 30%, transparent)`,
              boxShadow:
                composition.designSource === "ai"
                  ? undefined
                  : `inset 0 1px 0 color-mix(in srgb, ${composition.tokens.foreground} 24%, transparent)`,
            }}
          >
            <Image
              src={element.src}
              alt={element.alt ?? ""}
              fill
              unoptimized
              draggable={false}
              className="select-none"
              style={{
                objectFit: element.imageFit ?? "cover",
                objectPosition: `${element.imagePositionX ?? composition.screenshotCrop.x}% ${element.imagePositionY ?? composition.screenshotCrop.y}%`,
              }}
              sizes="720px"
            />
          </div>
        )}
        {element.kind === "shape" && (
          <div
            className="h-full w-full"
            style={{
              backgroundColor: element.fill ?? composition.tokens.foreground,
              borderRadius:
                element.shape === "circle"
                  ? "999px"
                  : `${element.radius ?? sourceRadius}px`,
            }}
          />
        )}
        {element.kind === "gradient" && (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(${element.gradientAngle ?? 135}deg, ${element.gradientFrom ?? composition.tokens.background}, ${element.gradientTo ?? composition.tokens.accent})`,
              borderRadius: `${element.radius ?? 0}px`,
            }}
          />
        )}
        {element.kind === "icon" && (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              color: element.color ?? composition.tokens.accent,
              backgroundColor: element.fill ?? "transparent",
              borderRadius: "999px",
            }}
          >
            <CreativeIconGlyph
              name={element.icon ?? composition.icon}
              size={48}
              color="currentColor"
              weight="duotone"
              className="size-[68%]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CreativeScene({
  composition,
  elements,
  watermarked,
  captureRef,
}: {
  composition: CreativeComposition;
  elements: CreativeElement[];
  watermarked: boolean;
  captureRef?: RefObject<HTMLDivElement | null>;
}) {
  const visibleElements = elements.filter((element) => !element.hidden);
  const hasRichBackdrop = visibleElements.some(
    (element) => element.kind === "gradient" || element.kind === "icon",
  );

  return (
    <div
      ref={captureRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: composition.tokens.background,
        containerType: "inline-size",
      }}
    >
      {composition.designSource !== "ai" && (
        <CreativeGraphic
          name={composition.graphic}
          color={composition.tokens.foreground}
        />
      )}
      {composition.designSource !== "ai" && !hasRichBackdrop && (
        <div
          aria-hidden="true"
          className="absolute right-[5%] top-[5%] flex size-[7%] items-center justify-center rounded-full"
          style={{
            backgroundColor: composition.tokens.foreground,
            color: composition.tokens.accent,
          }}
        >
          <CreativeIconGlyph
            name={composition.icon}
            size={22}
            color="currentColor"
            weight="bold"
          />
        </div>
      )}
      {visibleElements.map((element) => (
        <LayerVisual key={element.id} element={element} composition={composition} />
      ))}
      {watermarked && (
        <div
          className="pointer-events-none absolute bottom-[3%] right-[3%] z-30 rounded px-[2%] py-[1%] font-sans text-[clamp(7px,1.4cqw,11px)] uppercase "
          style={{
            backgroundColor: `color-mix(in srgb, ${composition.tokens.foreground} 85%, transparent)`,
            color: composition.tokens.background,
          }}
        >
          Made with EaseYourStartup
        </div>
      )}
    </div>
  );
}

export function MiniCanvaEditor({
  composition,
  outputs,
  onRegenerateChannel,
  regenerationRemaining,
  regenerationBusyChannel,
  generationProvider,
  autoDesignStatus,
  autoDesignWarning,
  creativeDirections,
  selectedCreativeId,
  captureRef,
  uploadStatus,
  uploadError,
  exportStatus,
  exportError,
  exportDownloadUrl,
  plan,
  canExportLaunchKit,
  campaignsRemaining,
  usagePeriodEndsAt,
  launchKitReadiness,
  onChange,
  onOutputsChange,
  onSelectCreativeDirection,
  onUpload,
  onAiRewrite,
  onAiDesign,
  saveStatus,
  saveError,
  onSave,
  aiContext,
  onExportPng,
  onExportZip,
}: {
  composition: CreativeComposition;
  outputs: ChannelOutput[];
  onRegenerateChannel?: (channel: ChannelOutput["channel"]) => Promise<void>;
  regenerationRemaining?: Partial<Record<ChannelOutput["channel"], number>>;
  regenerationBusyChannel?: ChannelOutput["channel"] | null;
  generationProvider?: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible";
  autoDesignStatus: "idle" | "loading" | "ai" | "error";
  autoDesignWarning?: string;
  creativeDirections: CreativeDirection[];
  selectedCreativeId: string;
  captureRef: RefObject<HTMLDivElement | null>;
  uploadStatus: "idle" | "loading" | "error";
  uploadError: string;
  exportStatus: "idle" | "loading";
  exportError: string;
  exportDownloadUrl: string | null;
  plan: "free" | "pro_lite" | "pro";
  canExportLaunchKit: boolean;
  campaignsRemaining: number | null;
  usagePeriodEndsAt: string | null;
  launchKitReadiness: LaunchKitReadiness;
  onChange: (composition: CreativeComposition) => void;
  onOutputsChange: (outputs: ChannelOutput[]) => void;
  onSelectCreativeDirection: (id: string) => void;
  onUpload: (
    file: File,
    target?: CreativeMockupDevice | "single",
  ) => Promise<string | null>;
  onAiRewrite: (input: CreativeRewriteInput) => Promise<AiRewriteResponse>;
  onAiDesign: (input: CreativeDesignInput) => Promise<AiDesignResponse>;
  saveStatus: "idle" | "saving" | "saved" | "local" | "error";
  saveError: string;
  onSave: () => Promise<void>;
  aiContext: CreativeAiContext;
  onExportPng: () => Promise<void>;
  onExportZip: () => Promise<void>;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const compositionRef = useRef(composition);
  const elements = getEditorElements(composition);
  const elementsRef = useRef(elements);
  const gestureRef = useRef<Gesture | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    elements.find((element) => element.kind === "text")?.id ?? elements[0]?.id ?? null,
  );
  const [activeTool, setActiveTool] = useState<EditorTool>("templates");
  const [past, setPast] = useState<CreativeComposition[]>([]);
  const [future, setFuture] = useState<CreativeComposition[]>([]);
  const [zoom, setZoom] = useState(78);
  const [editorView, setEditorView] = useState<EditorView>("canvas");
  const [aiInstruction, setAiInstruction] = useState(
    "Make this clearer, more direct, and easier to scan.",
  );
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [designInstruction, setDesignInstruction] = useState(
    "Design the whole canvas as a spacious, high-contrast visual scene with one product image, useful icons, restrained graphic accents, and subtle motion around a clear CTA. Respect the source visual system.",
  );
  const [designStatus, setDesignStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [designError, setDesignError] = useState("");
  const [designNotice, setDesignNotice] = useState("");
  const reduceMotion = useReducedMotion();
  const effectiveAutoDesignStatus =
    autoDesignStatus === "idle" && composition.designSource
      ? composition.designSource
      : autoDesignStatus;

  useEffect(() => {
    compositionRef.current = composition;
    elementsRef.current = elements;
  }, [composition, elements]);

  const activeSelectedId =
    selectedId && elements.some((element) => element.id === selectedId)
      ? selectedId
      : elements[0]?.id ?? null;
  const selectedElement =
    elements.find((element) => element.id === activeSelectedId) ?? null;

  const commit = useCallback(
    (
      nextElements: CreativeElement[],
      options?: { recordHistory?: boolean; base?: CreativeComposition },
    ) => {
      const currentElements = elementsRef.current;
      const base = options?.base ?? compositionRef.current;
      const nextComposition = syncCompositionText(base, nextElements);
      if (
        sameElements(currentElements, nextElements) &&
        JSON.stringify(nextComposition) === JSON.stringify(compositionRef.current)
      ) {
        return;
      }
      if (options?.recordHistory !== false) {
        setPast((current) => [
          ...current.slice(-39),
          syncCompositionText(compositionRef.current, currentElements),
        ]);
        setFuture([]);
      }
      elementsRef.current = nextElements;
      compositionRef.current = nextComposition;
      onChange(nextComposition);
    },
    [onChange],
  );

  const resetLayout = useCallback(
    (patch: Partial<CreativeComposition>) => {
      const base = {
        ...compositionRef.current,
        ...patch,
        elements: undefined,
        designSource: undefined,
      };
      commit(getEditorElements(base), { base });
    },
    [commit],
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<CreativeElement>) => {
      commit(updateEditorElement(elementsRef.current, id, patch));
    },
    [commit],
  );

  const addElement = useCallback(
    (element: CreativeElement) => {
      commit(addEditorElement(elementsRef.current, element));
      setSelectedId(element.id);
    },
    [commit],
  );

  const duplicateSelected = useCallback(() => {
    const element = elementsRef.current.find((item) => item.id === activeSelectedId);
    if (!element) return;
    const id = `${element.kind}-${Date.now().toString(36)}`;
    const duplicate = duplicateEditorElement(element, id);
    addElement(duplicate);
  }, [activeSelectedId, addElement]);

  const deleteSelected = useCallback(() => {
    if (!activeSelectedId) return;
    const element = elementsRef.current.find((item) => item.id === activeSelectedId);
    if (!element || element.locked) return;
    commit(removeEditorElement(elementsRef.current, activeSelectedId));
    setSelectedId(null);
  }, [activeSelectedId, commit]);

  const moveLayer = useCallback(
    (id: string, direction: "forward" | "backward") => {
      commit(reorderEditorElement(elementsRef.current, id, direction));
      setSelectedId(id);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const previous = past[past.length - 1];
    if (!previous) return;
    const current = syncCompositionText(
      compositionRef.current,
      elementsRef.current,
    );
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, 40));
    const previousElements = getEditorElements(previous);
    elementsRef.current = previousElements;
    compositionRef.current = previous;
    onChange(previous);
  }, [onChange, past]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    const current = syncCompositionText(
      compositionRef.current,
      elementsRef.current,
    );
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-39), current]);
    const nextElements = getEditorElements(next);
    elementsRef.current = nextElements;
    compositionRef.current = next;
    onChange(next);
  }, [future, onChange]);

  function beginGesture(
    event: ReactPointerEvent<HTMLElement>,
    element: CreativeElement,
    mode: GestureMode,
  ) {
    if (element.locked) {
      setSelectedId(element.id);
      return;
    }
    event.stopPropagation();
    canvasRef.current?.focus({ preventScroll: true });
    setSelectedId(element.id);
    setPast((current) => [
      ...current.slice(-39),
      syncCompositionText(compositionRef.current, elementsRef.current),
    ]);
    setFuture([]);
    gestureRef.current = {
      mode,
      id: element.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    const canvas = canvasRef.current;
    if (!gesture || !canvas || event.pointerId !== gesture.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    const deltaX = ((event.clientX - gesture.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - gesture.startY) / bounds.height) * 100;
    const nextElement =
      gesture.mode === "move"
        ? moveEditorElement(gesture.element, deltaX, deltaY)
        : resizeEditorElement(gesture.element, deltaX, deltaY);
    commit(
      updateEditorElement(elementsRef.current, gesture.id, {
        x: nextElement.x,
        y: nextElement.y,
        width: nextElement.width,
        height: nextElement.height,
      }),
      { recordHistory: false },
    );
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The browser may release capture when the pointer leaves the window.
      }
    }
  }

  function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && activeSelectedId) {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (!selectedElement || selectedElement.locked) return;
    const nudge = event.shiftKey ? 5 : 1;
    const move = {
      ArrowLeft: [-nudge, 0],
      ArrowRight: [nudge, 0],
      ArrowUp: [0, -nudge],
      ArrowDown: [0, nudge],
    }[event.key];
    if (move) {
      event.preventDefault();
      const moved = moveEditorElement(selectedElement, move[0], move[1]);
      updateElement(selectedElement.id, { x: moved.x, y: moved.y });
    }
  }

  async function fileSelected(
    event: ChangeEvent<HTMLInputElement>,
    target: CreativeMockupDevice | "single" = "single",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = await onUpload(file, target);
    if (!url) return;
    const current = compositionRef.current;
    const nextComposition = {
      ...current,
      screenshotUrl: target === "single" ? url : current.screenshotUrl,
      mockups:
        target === "single"
          ? { desktop: url, tablet: url, phone: url }
          : { ...current.mockups, [target]: url },
    };
    const imageId = target === "single" ? "image-main" : `image-${target}`;
    const nextElements = elementsRef.current.some((element) => element.id === imageId)
      ? elementsRef.current.map((element) =>
          element.id === imageId ? { ...element, src: url } : element,
        )
      : addEditorElement(elementsRef.current, makeImageElement(url, imageId));
    commit(nextElements, { base: nextComposition });
  }

  async function rewriteSelectedText() {
    if (!selectedElement || selectedElement.kind !== "text" || !selectedElement.text) {
      setAiError("Select a text layer first.");
      setAiStatus("error");
      return;
    }
    setAiStatus("loading");
    setAiError("");
    try {
      const result = await onAiRewrite({
        text: selectedElement.text,
        role: selectedElement.textRole ?? "body",
        instruction: aiInstruction,
        projectName: aiContext.projectName,
        context: aiContext.context,
        approvedFacts: aiContext.approvedFacts,
      });
      updateElement(selectedElement.id, { text: result.text });
      setAiStatus("idle");
    } catch (error) {
      setAiStatus("error");
      setAiError(error instanceof Error ? error.message : "AI rewrite failed.");
    }
  }

  async function designEntireCanvas() {
    setDesignStatus("loading");
    setDesignError("");
    setDesignNotice("");
    try {
      const result = await onAiDesign({
        projectName: aiContext.projectName,
        context: aiContext.context,
        approvedFacts: aiContext.approvedFacts,
        instruction: designInstruction,
        composition: prepareDesignComposition(compositionRef.current),
      });
      const nextComposition = applyCreativeDesign(
        compositionRef.current,
        result.design,
      );
      const compositionWithAiDesign = {
        ...nextComposition,
        designSource: "ai" as const,
      };
      commit(compositionWithAiDesign.elements ?? [], {
        base: compositionWithAiDesign,
      });
      setSelectedId(
        nextComposition.elements?.find(
          (element) => element.textRole === "headline",
        )?.id ?? nextComposition.elements?.[0]?.id ?? null,
      );
      setDesignNotice(
        `${aiProviderLabel(result.provider)} designed the full editable scene.`,
      );
      setDesignStatus("idle");
      setEditorView("preview");
    } catch (error) {
      setDesignStatus("error");
      setDesignError(error instanceof Error ? error.message : "AI design failed.");
    }
  }

  const visibleElements = elements.filter((element) => !element.hidden);
  const overlayElements = [...visibleElements].reverse();
  const designSpec = JSON.stringify(
    {
      templateId: composition.templateId,
      output: composition.output,
      imageMode: composition.imageMode,
      screenshotCrop: composition.screenshotCrop,
      tokens: composition.tokens,
      text: composition.text,
      icon: composition.icon,
      graphic: composition.graphic,
      elements: visibleElements.map((element) => {
        if (element.kind !== "image") return element;
        const { src, ...layer } = element;
        const asset =
          src === composition.mockups.desktop
            ? "desktop"
            : src === composition.mockups.tablet
              ? "tablet"
              : src === composition.mockups.phone
                ? "phone"
                : "primary";
        return { ...layer, asset };
      }),
    },
    null,
    2,
  );

  function updateComposition(patch: Partial<CreativeComposition>) {
    const next = { ...compositionRef.current, ...patch };
    compositionRef.current = next;
    onChange(next);
  }

  function panelContent() {
    if (activeTool === "templates") {
      return (
        <div className="space-y-4">
          <PanelHeading title="Templates" note="Start with a layout, then make it yours." />
          <div className="grid gap-2">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => resetLayout({ templateId: template.id })}
                className={cn(
                  "rounded-control border p-3 text-left transition-colors",
                  composition.templateId === template.id
                    ? "border-accent bg-accent/10"
                    : "border-line bg-canvas hover:border-muted",
                )}
              >
                <span className="block text-xs font-semibold">{template.name}</span>
                <span className="mt-1 block text-[10px] text-muted">{template.note}</span>
              </button>
            ))}
          </div>
          <PanelHeading title="Canvas size" note="Choose the export format." />
          <div className="grid grid-cols-2 gap-2">
            {RATIOS.map((ratio) => (
              <button
                key={ratio.name}
                type="button"
                onClick={() => updateComposition({ output: { width: ratio.width, height: ratio.height } })}
                className={cn(
                  "rounded-control border px-3 py-2 text-left font-sans text-[10px]",
                  composition.output.width === ratio.width && composition.output.height === ratio.height
                    ? "border-accent bg-accent/10"
                    : "border-line bg-canvas",
                )}
              >
                {ratio.name}
              </button>
            ))}
          </div>
          <PanelHeading title="Style" note="Set the base treatment." />
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              label="Background"
              value={composition.tokens.background}
              onChange={(background) => updateComposition({ tokens: { ...composition.tokens, background } })}
            />
            <ColorField
              label="Type"
              value={composition.tokens.foreground}
              onChange={(foreground) => {
                const base = {
                  ...composition,
                  tokens: { ...composition.tokens, foreground },
                };
                const nextElements = elements.map((element) =>
                  element.kind === "text" && element.textRole !== "cta"
                    ? { ...element, color: foreground }
                    : element,
                );
                commit(nextElements, { base });
              }}
            />
          </div>
          <label className="block text-[11px] text-muted">
            Graphic motif
            <Select
              value={composition.graphic}
              onValueChange={(value) => updateComposition({ graphic: creativeGraphicSchema.parse(value) })}
              className="mt-1 min-h-9 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
              aria-label="Graphic motif" options={creativeGraphicSchema.options.map((value) => ({ value, label: value }))}
            />
          </label>
          <label className="block text-[11px] text-muted">
            Accent icon
            <Select
              value={composition.icon}
              onValueChange={(value) => updateComposition({ icon: creativeIconSchema.parse(value) })}
              className="mt-1 min-h-9 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
              aria-label="Accent icon" options={creativeIconSchema.options.map((value) => ({ value, label: value }))}
            />
          </label>
          <div className="border-t border-line pt-3">
            <p className="text-[10px] font-semibold text-muted">Screenshot crop</p>
            <label className="mt-2 block text-[10px] text-muted">
              Horizontal
              <input
                type="range"
                min="0"
                max="100"
                value={composition.screenshotCrop.x}
                onChange={(event) => updateComposition({ screenshotCrop: { ...composition.screenshotCrop, x: Number(event.target.value) } })}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
            <label className="mt-2 block text-[10px] text-muted">
              Vertical
              <input
                type="range"
                min="0"
                max="100"
                value={composition.screenshotCrop.y}
                onChange={(event) => updateComposition({ screenshotCrop: { ...composition.screenshotCrop, y: Number(event.target.value) } })}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
          </div>
        </div>
      );
    }

    if (activeTool === "text") {
      return (
        <div className="space-y-4">
          <PanelHeading title="Text" note="Add a layer and style it in the inspector." />
          <div className="space-y-2">
            {TEXT_ROLES.map((item) => (
              <button
                key={item.role}
                type="button"
                onClick={() => addElement(makeTextElement(item.role, item.sample, composition, `text-${item.role}-${Date.now().toString(36)}`))}
                className="flex w-full items-start gap-3 rounded-control border border-line bg-canvas p-3 text-left transition-colors hover:border-accent"
              >
                <TextT size={16} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="block text-xs font-semibold">{item.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-muted">{item.sample}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeTool === "elements") {
      return (
        <div className="space-y-4">
          <PanelHeading title="Elements" note="Build a richer visual DOM with color, icons, and motion." />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => addElement(makeGradientElement(`gradient-${Date.now().toString(36)}`, composition.tokens.background, composition.tokens.accent))}
              className="rounded-control border border-line bg-canvas p-3 text-center text-[10px] font-semibold hover:border-accent"
            >
              <span className="mx-auto mb-2 block size-7 rounded-full bg-[linear-gradient(135deg,var(--accent),transparent)]" />
              Gradient
            </button>
            <button
              type="button"
              onClick={() => addElement(makeIconElement(`icon-${Date.now().toString(36)}`, composition.icon, composition.tokens.accent))}
              className="rounded-control border border-line bg-canvas p-3 text-center text-[10px] font-semibold hover:border-accent"
            >
              <CreativeIconGlyph name={composition.icon} size={28} className="mx-auto mb-2 text-accent" />
              Icon
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["rectangle", "Rectangle"],
              ["circle", "Circle"],
              ["line", "Line"],
            ] as const).map(([shape, label]) => (
              <button
                key={shape}
                type="button"
                onClick={() => addElement(makeShapeElement(shape, `shape-${Date.now().toString(36)}`, composition.tokens.foreground, composition))}
                className="rounded-control border border-line bg-canvas p-3 text-center text-[10px] font-semibold hover:border-accent"
              >
                <span className={cn(
                  "mx-auto mb-2 block size-7 border-2 border-accent",
                  shape === "circle" && "rounded-full",
                  shape === "line" && "mt-3 h-0 w-8 border-x-0 border-b-0",
                )} />
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeTool === "uploads") {
      return (
        <div className="space-y-4">
          <PanelHeading title="Uploads" note="Keep real product screenshots at the center." />
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-accent bg-accent/10 px-3 py-4 text-xs font-semibold text-accent">
            {uploadStatus === "loading" ? <LoadingIndicator size="sm" /> : <UploadSimple size={16} />}
            {uploadStatus === "loading" ? "Uploading" : "Upload image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={fileSelected}
              className="sr-only"
              disabled={uploadStatus === "loading"}
            />
          </label>
          <p className="text-[10px] leading-4 text-muted">PNG, JPEG, or WebP. Uploaded images can be moved and resized on the canvas.</p>
          <button
            type="button"
            onClick={() => addElement(makeImageElement(composition.screenshotUrl, `image-${Date.now().toString(36)}`, 12, 16, 38, 42))}
            className="flex w-full items-center gap-3 rounded-control border border-line bg-canvas p-3 text-left text-xs font-semibold hover:border-accent"
          >
            <ImageSquare size={18} className="text-accent" />
            Add current screenshot
          </button>
          {composition.imageMode === "devices" && (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-[10px] font-semibold uppercase  text-muted">Device images</p>
              {(["desktop", "tablet", "phone"] as const).map((device) => (
                <label key={device} className="flex cursor-pointer items-center justify-between rounded-control border border-line bg-canvas px-3 py-2 text-xs">
                  <span className="capitalize">{device}</span>
                  <span className="text-muted">Replace</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => fileSelected(event, device)}
                    className="sr-only"
                    disabled={uploadStatus === "loading"}
                  />
                </label>
              ))}
            </div>
          )}
          {uploadError && <p role="alert" className="text-xs leading-5 text-danger">{uploadError}</p>}
        </div>
      );
    }

    if (activeTool === "copy") {
      return (
        <ChannelOutputs
          outputs={outputs}
          claims={aiContext.approvedClaims}
          onChange={onOutputsChange}
          onRegenerate={onRegenerateChannel}
          regenerationRemaining={regenerationRemaining}
          regenerationBusyChannel={regenerationBusyChannel}
          plan={plan}
          compact
        />
      );
    }

    if (activeTool === "directions") {
      return (
        <div className="space-y-4">
          <PanelHeading
            title="Directions"
            note="Switch the story while keeping the canvas editable."
          />
          <div
            role="radiogroup"
            aria-label="Creative directions"
            className="space-y-2"
          >
            {creativeDirections.map((direction) => {
              const selected = selectedCreativeId === direction.id;
              return (
                <button
                  key={direction.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelectCreativeDirection(direction.id)}
                  className={cn(
                    "w-full rounded-control border p-3 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-line bg-canvas text-muted hover:border-muted hover:text-ink",
                  )}
                >
                  <span className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
                      <CreativeIconGlyph
                        name={direction.icon}
                        size={18}
                        weight="duotone"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">
                        {direction.label}
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-muted">
                        {direction.imageMode === "devices"
                          ? "Device story"
                          : "Single product visual"}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeTool === "export") {
      return (
        <div className="space-y-4">
          <PanelHeading
            title="Launch kit review"
            note="Review the campaign package before you publish."
          />
          <div className="rounded-control border border-line bg-canvas p-3 text-[11px] leading-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">
                {launchKitReadiness.ready ? "Ready to publish" : "Founder review needed"}
              </p>
              <Badge>{plan === "pro" ? "Pro" : plan === "pro_lite" ? "Pro Lite" : "Free preview"}</Badge>
            </div>
            <p className="mt-2 text-muted">
              {launchKitReadiness.outputCount} channel draft{launchKitReadiness.outputCount === 1 ? "" : "s"} · {launchKitReadiness.approvedClaimCount} source fact{launchKitReadiness.approvedClaimCount === 1 ? "" : "s"} kept
            </p>
            <p className="mt-1 text-muted">
              {campaignsRemaining === null
                ? "Checking campaign allowance…"
                : `${campaignsRemaining} campaign slot${campaignsRemaining === 1 ? "" : "s"} left this period${usagePeriodEndsAt ? ` · resets ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(usagePeriodEndsAt))}` : ""}`}
            </p>
            {launchKitReadiness.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-muted">
                {launchKitReadiness.warnings.slice(0, 3).map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            )}
          </div>
          {canExportLaunchKit ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => void onExportPng()}
              disabled={exportStatus === "loading"}
            >
              {exportStatus === "loading" ? <LoadingIndicator size="sm" /> : <DownloadSimple size={16} />}
              Download PNG
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => void onExportZip()}
              disabled={exportStatus === "loading"}
            >
              {exportStatus === "loading" ? <LoadingIndicator size="sm" /> : <FileZip size={16} />}
              Download ZIP
            </Button>
          </div>
          ) : (
            <div className="rounded-control border border-accent/30 bg-accent/10 p-3 text-xs leading-5 text-muted">
              Full-resolution visuals and the organized launch kit are available on Pro Lite and Pro.
              <Link href="/pricing" className="mt-2 block font-semibold text-accent underline underline-offset-4">
                Upgrade to export the launch kit
              </Link>
            </div>
          )}
          {exportStatus === "loading" && (
            <p role="status" className="text-xs text-muted">Preparing your export… This can take a minute. Your saved campaign is safe if you leave the page.</p>
          )}
          {exportDownloadUrl && (
            <a href={exportDownloadUrl} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-accent/40 bg-accent/10 px-3 text-sm font-semibold text-accent underline-offset-4 hover:underline">
              <DownloadSimple size={16} />Download completed export
            </a>
          )}
          {exportError && (
            <p role="alert" className="text-xs leading-5 text-danger">
              {exportError}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div>
          <PanelHeading
            title="AI design"
            note="Describe a direction and AI will design the whole canvas."
          />
          <div className="mt-3 rounded-control border border-accent/30 bg-accent/10 p-3 text-[11px] leading-5 text-muted">
            AI returns a validated visual plan. The editor renders its layers with
            fixed React components; generated HTML, CSS, and JavaScript never run.
          </div>
          {effectiveAutoDesignStatus !== "idle" && (
            <div
              role={effectiveAutoDesignStatus === "error" ? "alert" : "status"}
              className={cn(
                "mt-3 rounded-control border p-3 text-[11px] leading-5",
                effectiveAutoDesignStatus === "ai"
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : effectiveAutoDesignStatus === "error"
                    ? "border-danger/30 bg-danger/10 text-danger"
                    : "border-line bg-canvas text-muted",
              )}
            >
              <p className="font-semibold">
                <span className="flex items-center gap-2">
                  {effectiveAutoDesignStatus === "loading" && (
                    <LoadingIndicator size="sm" />
                  )}
                  {canvasSourceLabel(effectiveAutoDesignStatus, generationProvider)}
                </span>
              </p>
              {autoDesignWarning && (
                <p className="mt-1">{autoDesignWarning}</p>
              )}
            </div>
          )}
          <label className="mt-3 block text-[11px] font-semibold">
            Design brief
            <textarea
              value={designInstruction}
              maxLength={500}
              onChange={(event) => setDesignInstruction(event.target.value)}
              className="mt-2 min-h-24 w-full resize-y rounded-control border border-line bg-canvas p-3 text-xs leading-5"
            />
          </label>
          <Button
            type="button"
            className="mt-3 w-full"
            onClick={() => void designEntireCanvas()}
            disabled={designStatus === "loading"}
          >
            {designStatus === "loading" ? <LoadingIndicator size="sm" /> : <Sparkle size={16} />}
            {designStatus === "loading" ? "Designing canvas" : "Design entire canvas"}
          </Button>
          {designError && (
            <p role="alert" className="mt-2 text-xs leading-5 text-danger">
              {designError}
            </p>
          )}
          {designNotice && !designError && (
            <p
              role="status"
              className={cn(
                "mt-2 text-xs leading-5",
                designNotice.includes("designed")
                  ? "text-accent"
                  : "text-muted",
              )}
            >
              {designNotice}
            </p>
          )}
        </div>

        <div className="border-t border-line pt-5">
          <PanelHeading
            title="Rewrite one layer"
            note="Refine a selected text layer without leaving the canvas."
          />
          {selectedElement?.kind === "text" ? (
            <>
              <div className="mt-3 rounded-control border border-line bg-canvas p-3">
                <p className="text-[10px] font-semibold uppercase  text-muted">
                  Selected layer
                </p>
                <p className="mt-2 text-xs font-semibold">
                  {elementLabel(selectedElement)}
                </p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-muted">
                  {selectedElement.text}
                </p>
              </div>
              <label className="mt-3 block text-[11px] font-semibold">
                Direction
                <textarea
                  value={aiInstruction}
                  maxLength={240}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  className="mt-2 min-h-24 w-full resize-y rounded-control border border-line bg-canvas p-3 text-xs leading-5"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full"
                onClick={() => void rewriteSelectedText()}
                disabled={aiStatus === "loading"}
              >
                {aiStatus === "loading" ? <LoadingIndicator size="sm" /> : <Sparkle size={16} />}
                {aiStatus === "loading" ? "Rewriting" : "Rewrite with AI"}
              </Button>
              {aiError && (
                <p role="alert" className="mt-2 text-xs leading-5 text-danger">
                  {aiError}
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted">
              Select a text layer on the canvas, then choose how you want it rewritten.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface-raised">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-line bg-surface px-3">
        <div className="flex shrink-0 items-center gap-3">
          <Logo href="/dashboard" ariaLabel="EaseYourStartup dashboard" />
          <div>
            <p className="text-xs font-semibold">Creative studio</p>
            <p className="text-[10px] text-muted">Drag, resize, layer, and rewrite</p>
          </div>
          <Badge
            className={cn(
              "max-w-44 normal-case ",
              effectiveAutoDesignStatus === "ai" ||
                effectiveAutoDesignStatus === "loading"
                ? "border-accent/40 bg-accent/10 text-accent"
                : effectiveAutoDesignStatus === "error"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-line bg-canvas text-muted",
            )}
            title={autoDesignWarning || undefined}
          >
            {canvasSourceLabel(
              effectiveAutoDesignStatus,
              generationProvider,
            )}
          </Badge>
        </div>
        <div className="flex min-w-max items-center gap-1">
          <ToolbarButton label="Undo" icon={ArrowCounterClockwise} onClick={undo} disabled={past.length === 0} />
          <ToolbarButton label="Redo" icon={ArrowClockwise} onClick={redo} disabled={future.length === 0} />
          <ToolbarButton
            label={saveStatus === "saving" ? "Saving" : "Save"}
            icon={FloppyDisk}
            onClick={() => void onSave()}
            disabled={saveStatus === "saving"}
          />
          <span
            role={saveStatus === "error" ? "alert" : "status"}
            className={cn(
              "hidden max-w-44 truncate text-[10px] sm:inline",
              saveStatus === "error" || saveStatus === "local"
                ? "text-danger"
                : "text-muted",
            )}
            title={saveError || undefined}
          >
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "local"
                  ? "Saved locally"
                  : saveStatus === "error"
                    ? "Not saved"
                    : ""}
          </span>
          <div
            role="group"
            aria-label="Editor views"
            className="flex rounded-control border border-line bg-canvas p-0.5"
          >
            {([
              { id: "canvas", label: "Canvas" },
              { id: "spec", label: "Spec" },
              { id: "preview", label: "Preview" },
            ] as const).map((view) => (
              <button
                key={view.id}
                type="button"
                aria-pressed={editorView === view.id}
                onClick={() => setEditorView(view.id)}
                className={cn(
                  "rounded-[5px] px-2 py-1 text-[10px] font-semibold capitalize transition-colors",
                  editorView === view.id
                    ? "bg-accent text-accent-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                {view.label}
              </button>
            ))}
          </div>
          <span className="mx-1 h-5 w-px bg-line" />
          <ToolbarButton label="Zoom out" icon={Minus} onClick={() => setZoom((value) => Math.max(40, value - 10))} />
          <ToolbarButton label="Fit canvas" icon={Target} onClick={() => setZoom(78)} />
          <span className="min-w-10 text-center font-sans text-[10px] text-muted">{zoom}%</span>
          <ToolbarButton label="Zoom in" icon={Plus} onClick={() => setZoom((value) => Math.min(130, value + 10))} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,0.8fr)_minmax(0,1.2fr)] overflow-hidden md:grid-cols-[72px_236px_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[72px_220px_minmax(0,1fr)_240px] xl:grid-cols-[76px_260px_minmax(0,1fr)_292px]">
        <nav aria-label="Editor tools" className="flex overflow-x-auto border-b border-line bg-surface p-2 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r">
          {TOOL_ITEMS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={activeTool === tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={cn(
                "flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-control px-1 text-center text-[9px] font-semibold leading-3 transition-colors md:w-full md:min-w-0 md:flex-none md:px-0",
                activeTool === tool.id ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-raised hover:text-ink",
              )}
            >
              <tool.icon size={18} weight={activeTool === tool.id ? "fill" : "regular"} />
              {tool.label}
            </button>
          ))}
        </nav>

        <aside className="min-h-0 overflow-y-auto overscroll-contain border-b border-line bg-surface p-3 pb-6 [scrollbar-gutter:stable] md:border-b-0 md:border-r">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTool}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {panelContent()}
            </motion.div>
          </AnimatePresence>
          <div className="mt-5 border-t border-line pt-4 lg:hidden">
            <p className="text-[10px] font-semibold uppercase  text-muted">
              Selected layer
            </p>
            <div className="mt-3">
              <Inspector
                composition={composition}
                element={selectedElement}
                onUpdate={updateElement}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
              />
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-canvas/70 p-3 sm:p-4">
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-sans text-[10px] uppercase  text-muted">{composition.output.width} x {composition.output.height}</p>
              <p className="mt-1 text-xs text-muted">
                {editorView === "canvas"
                  ? "Select a layer to edit its position and style."
                  : editorView === "spec"
                    ? "Inspect the validated design plan that drives the React canvas."
                    : "Live preview rendered with the same React components as the canvas."}
              </p>
            </div>
            {editorView === "canvas" && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[10px] text-muted">
                Image treatment
                <Select
                  value={composition.imageMode}
                  onValueChange={(value) => resetLayout({ imageMode: creativeImageModeSchema.parse(value) })}
                  className="min-h-8 w-auto rounded-control border border-line bg-surface px-2 text-xs text-ink"
                  aria-label="Image treatment" options={[{ value: "single", label: "Single image" }, { value: "devices", label: "Device story" }]}
                />
              </label>
            </div>
            )}
          </div>

          {editorView === "canvas" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-control border border-line bg-surface p-3 sm:p-5">
            <div
              className="relative max-h-full max-w-full shrink-0"
              style={{
                width: `${zoom}%`,
                maxWidth: `min(640px, calc(62dvh * ${composition.output.width / composition.output.height}))`,
              }}
            >
              <div
                ref={canvasRef}
                tabIndex={0}
                role="application"
                aria-label="Creative canvas. Use arrow keys to move the selected layer."
                onKeyDown={handleCanvasKeyDown}
                onPointerMove={moveGesture}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                className="relative w-full overflow-hidden outline-none [container-type:inline-size]"
                style={{
                  aspectRatio: `${composition.output.width} / ${composition.output.height}`,
                  backgroundColor: composition.tokens.background,
                  color: composition.tokens.foreground,
                  touchAction: "none",
                }}
                onPointerDown={() => {
                  setSelectedId(null);
                  canvasRef.current?.focus({ preventScroll: true });
                }}
              >
                <CreativeScene
                  composition={composition}
                  elements={elements}
                  watermarked={plan !== "pro"}
                  captureRef={captureRef}
                />
                <div className="absolute inset-0">
                  {overlayElements.map((element) => (
                    <div
                      key={element.id}
                      role="button"
                      tabIndex={-1}
                      aria-label={`${elementLabel(element)} layer: ${elementPreview(element)}`}
                      onPointerDown={(event) => beginGesture(event, element, "move")}
                      className={cn(
                        "absolute cursor-move touch-none rounded-[2px]",
                        activeSelectedId === element.id && "ring-2 ring-accent ring-offset-1 ring-offset-transparent",
                        element.locked && "cursor-not-allowed",
                      )}
                      style={{
                        left: `${element.x}%`,
                        top: `${element.y}%`,
                        width: `${element.width}%`,
                        height: `${element.height}%`,
                        transform: `rotate(${element.rotation}deg)`,
                      }}
                    >
                      {activeSelectedId === element.id && !element.locked && (
                        <button
                          type="button"
                          aria-label={`Resize ${elementLabel(element)}`}
                          onPointerDown={(event) => beginGesture(event, element, "resize")}
                          className="absolute -bottom-1.5 -right-1.5 size-3 cursor-se-resize rounded-[2px] border border-accent bg-accent"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          ) : editorView === "spec" ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-control border border-line bg-[#101216] p-3 sm:p-5">
              <pre
                aria-label="Structured design specification"
                className="min-h-full whitespace-pre-wrap break-words text-[12px] leading-5 text-[#e8edf2]"
              >
                <code className="font-mono">
                  <JsonSyntax source={designSpec} />
                </code>
              </pre>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-control border border-line bg-surface p-3 sm:p-5">
              <div
                className="relative w-full shrink-0"
                style={{
                  maxWidth: `min(640px, calc(62dvh * ${composition.output.width / composition.output.height}))`,
                  aspectRatio: `${composition.output.width} / ${composition.output.height}`,
                }}
              >
                <CreativeScene
                  composition={composition}
                  elements={elements}
                  watermarked={plan !== "pro"}
                />
              </div>
            </div>
          )}
          {editorView === "canvas" ? (
          <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
            <span>Drag to move. Shift + arrow nudges faster. Delete removes a layer.</span>
            <span className="font-sans">{elements.length} layers</span>
          </div>
          ) : editorView === "spec" ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              Screenshot URLs stay private; image layers reference the selected asset keys.
            </p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted">
              This preview uses the editor&apos;s React renderer and the same selected images as the canvas.
            </p>
          )}
        </main>

        <aside className="max-lg:hidden min-h-0 overflow-y-auto overscroll-contain border-t border-line bg-surface p-3 pb-6 [scrollbar-gutter:stable] lg:border-l lg:border-t-0">
          <Inspector
            composition={composition}
            element={selectedElement}
            onUpdate={updateElement}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
          />
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Layers</p>
              <span className="font-sans text-[10px] text-muted">{elements.length}</span>
            </div>
            <div className="mt-2 space-y-1">
              {[...elements].reverse().map((element) => (
                <div
                  key={element.id}
                  className={cn(
                    "flex items-center gap-1 rounded-control border px-2 py-1.5",
                    activeSelectedId === element.id ? "border-accent bg-accent/10" : "border-transparent hover:border-line",
                  )}
                >
                  <button type="button" onClick={() => setSelectedId(element.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[11px] font-semibold">{elementLabel(element)}</span>
                    <span className="block truncate text-[9px] text-muted">{elementPreview(element)}</span>
                  </button>
                  <button type="button" aria-label={element.hidden ? `Show ${elementLabel(element)}` : `Hide ${elementLabel(element)}`} onClick={() => updateElement(element.id, { hidden: !element.hidden })} className="rounded p-1 text-muted hover:bg-surface-raised hover:text-ink">
                    {element.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                  <button type="button" aria-label={element.locked ? `Unlock ${elementLabel(element)}` : `Lock ${elementLabel(element)}`} onClick={() => updateElement(element.id, { locked: !element.locked })} className="rounded p-1 text-muted hover:bg-surface-raised hover:text-ink">
                    {element.locked ? <LockKey size={14} /> : <LockKeyOpen size={14} />}
                  </button>
                  <button type="button" aria-label={`Bring ${elementLabel(element)} forward`} onClick={() => moveLayer(element.id, "forward")} className="rounded p-1 text-muted hover:bg-surface-raised hover:text-ink">
                    <CaretUp size={14} />
                  </button>
                  <button type="button" aria-label={`Send ${elementLabel(element)} backward`} onClick={() => moveLayer(element.id, "backward")} className="rounded p-1 text-muted hover:bg-surface-raised hover:text-ink">
                    <CaretDown size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelHeading({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-[10px] leading-4 text-muted">{note}</p>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: IconComponent,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: Icon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-control p-2 text-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
    >
      <IconComponent size={16} />
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[10px] text-muted">
      {label}
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full cursor-pointer rounded-control border border-line bg-canvas p-1"
      />
    </label>
  );
}

function Inspector({
  composition,
  element,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  composition: CreativeComposition;
  element: CreativeElement | null;
  onUpdate: (id: string, patch: Partial<CreativeElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  if (!element) {
    return (
      <div className="rounded-control border border-dashed border-line p-4 text-xs leading-5 text-muted">
        Select a layer to edit its position, size, color, and text.
      </div>
    );
  }

  const numberField = (
    label: string,
    key: "x" | "y" | "width" | "height" | "rotation",
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="block text-[10px] text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={element[key]}
        onChange={(event) => onUpdate(element.id, { [key]: Number(event.target.value) })}
        className="mt-1 min-h-8 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">{elementLabel(element)}</p>
          <p className="mt-1 truncate text-[10px] text-muted">{elementPreview(element)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Duplicate layer" onClick={onDuplicate} className="rounded p-1.5 text-muted hover:bg-surface-raised hover:text-ink"><Copy size={15} /></button>
          <button type="button" aria-label="Delete layer" onClick={onDelete} className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"><Trash size={15} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {numberField("X", "x", 0, 100, 0.5)}
        {numberField("Y", "y", 0, 100, 0.5)}
        {numberField("Width", "width", 2, 100, 0.5)}
        {numberField("Height", "height", 2, 100, 0.5)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {numberField("Rotate", "rotation", -180, 180, 1)}
        <label className="block text-[10px] text-muted">
          Opacity
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={element.opacity}
            onChange={(event) => onUpdate(element.id, { opacity: Number(event.target.value) })}
            className="mt-3 w-full accent-[var(--accent)]"
          />
        </label>
      </div>
      {element.kind === "text" && (
        <>
          <label className="block text-[10px] font-semibold text-muted">
            Text
            <textarea
              value={element.text ?? ""}
              maxLength={1000}
              onChange={(event) => onUpdate(element.id, { text: event.target.value })}
              className="mt-1 min-h-24 w-full resize-y rounded-control border border-line bg-canvas p-2 text-xs leading-5 text-ink"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Text color" value={element.color ?? composition.tokens.foreground} onChange={(color) => onUpdate(element.id, { color })} />
            <label className="block text-[10px] text-muted">
              Font size
              <input
                type="number"
                min="0.4"
                max="20"
                step="0.1"
                value={element.fontSize ?? 1.5}
                onChange={(event) => onUpdate(element.id, { fontSize: Number(event.target.value) })}
                className="mt-1 min-h-9 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
              />
            </label>
          </div>
          <div className="flex items-center gap-1 rounded-control border border-line bg-canvas p-1">
            <AlignButton label="Align left" icon={TextAlignLeft} active={element.align === "left"} onClick={() => onUpdate(element.id, { align: "left" })} />
            <AlignButton label="Align center" icon={TextAlignCenter} active={element.align === "center"} onClick={() => onUpdate(element.id, { align: "center" })} />
            <AlignButton label="Align right" icon={TextAlignRight} active={element.align === "right"} onClick={() => onUpdate(element.id, { align: "right" })} />
          </div>
        </>
      )}
      {element.kind === "shape" && (
        <ColorField label="Fill" value={element.fill ?? composition.tokens.foreground} onChange={(fill) => onUpdate(element.id, { fill })} />
      )}
      {element.kind === "gradient" && (
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="From" value={element.gradientFrom ?? composition.tokens.background} onChange={(gradientFrom) => onUpdate(element.id, { gradientFrom })} />
          <ColorField label="To" value={element.gradientTo ?? composition.tokens.accent} onChange={(gradientTo) => onUpdate(element.id, { gradientTo })} />
          <label className="col-span-2 block text-[10px] text-muted">
            Angle
            <input
              type="number"
              min="-360"
              max="360"
              step="1"
              value={element.gradientAngle ?? 135}
              onChange={(event) => onUpdate(element.id, { gradientAngle: Number(event.target.value) })}
              className="mt-1 min-h-8 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
            />
          </label>
        </div>
      )}
      {element.kind === "icon" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 block text-[10px] text-muted">
            Icon
            <Select
              value={element.icon ?? composition.icon}
              onValueChange={(value) => onUpdate(element.id, { icon: creativeIconSchema.parse(value) })}
              className="mt-1 min-h-8 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
              aria-label="Icon" options={creativeIconSchema.options.map((value) => ({ value, label: value }))}
            />
          </label>
          <ColorField label="Icon color" value={element.color ?? composition.tokens.accent} onChange={(color) => onUpdate(element.id, { color })} />
          <ColorField label="Icon fill" value={element.fill ?? composition.tokens.background} onChange={(fill) => onUpdate(element.id, { fill })} />
        </div>
      )}
      {element.kind === "image" && (
        <div className="rounded-control border border-line bg-canvas p-3 text-[10px] leading-4 text-muted">
          Use the crop sliders in the image settings or replace the source from Uploads.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[10px] text-muted">
          Motion
          <Select
            value={element.effect ?? "none"}
            onValueChange={(value) => onUpdate(element.id, { effect: creativeElementEffectSchema.parse(value) })}
            className="mt-1 min-h-8 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
            aria-label="Motion" options={creativeElementEffectSchema.options.map((value) => ({ value, label: value }))}
          />
        </label>
        <label className="block text-[10px] text-muted">
          Trigger
          <Select
            value={element.effectTrigger ?? "always"}
            onValueChange={(value) => onUpdate(element.id, { effectTrigger: value as CreativeElement["effectTrigger"] })}
            className="mt-1 min-h-8 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
            aria-label="Trigger" options={[{ value: "always", label: "Always" }, { value: "hover", label: "Hover" }, { value: "click", label: "Click" }]}
          />
        </label>
        <label className="col-span-2 block text-[10px] text-muted">
          Shadow
          <Select
            value={element.shadow ?? "none"}
            onValueChange={(value) => onUpdate(element.id, { shadow: creativeElementShadowSchema.parse(value) })}
            className="mt-1 min-h-8 w-full rounded-control border border-line bg-canvas px-2 text-xs text-ink"
            aria-label="Shadow" options={creativeElementShadowSchema.options.map((value) => ({ value, label: value }))}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onUpdate(element.id, { locked: !element.locked })}>
          {element.locked ? <LockKey size={15} /> : <LockKeyOpen size={15} />}
          {element.locked ? "Unlock" : "Lock"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onUpdate(element.id, { hidden: !element.hidden })}>
          {element.hidden ? <Eye size={15} /> : <EyeSlash size={15} />}
          {element.hidden ? "Show" : "Hide"}
        </Button>
      </div>
    </div>
  );
}

function AlignButton({
  label,
  icon: IconComponent,
  active,
  onClick,
}: {
  label: string;
  icon: Icon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("flex-1 rounded p-1.5 text-muted hover:text-ink", active && "bg-accent/10 text-accent")}
    >
      <IconComponent size={15} className="mx-auto" />
    </button>
  );
}
