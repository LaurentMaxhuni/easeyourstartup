import Image from "next/image";
import {
  CreativeGraphic,
  CreativeIconGlyph,
} from "@/components/studio/creative-icons";
import type {
  CreativeComposition,
  CreativeElement,
  CreativeMockupDevice,
} from "@/lib/contracts";
import { getEditorElements } from "@/lib/studio/editor-state";
import {
  creativeLayerEffectClass,
  creativeLayerShadow,
} from "@/lib/studio/creative-effects";
import { cn } from "@/lib/utils";

function RenderDeviceFrame({
  composition,
  device,
  src,
  height,
}: {
  composition: CreativeComposition;
  device: CreativeMockupDevice;
  src: string;
  height: string;
}) {
  const aspectRatio =
    device === "desktop" ? "16 / 10" : device === "tablet" ? "3 / 4" : "9 / 19";
  const sourceRadius = composition.tokens.radius ?? 8;
  const borderRadius =
    device === "desktop"
      ? sourceRadius
      : Math.max(24, Math.min(48, sourceRadius * 3));
  const borderWidth = device === "desktop" ? 8 : device === "tablet" ? 8 : 10;
  const label =
    device === "desktop"
      ? "PC product screenshot"
      : device === "tablet"
        ? "Tablet product screenshot"
        : "Phone product screenshot";

  return (
    <div
      style={{
        position: "relative",
        width: "auto",
        maxWidth: "100%",
        maxHeight: "100%",
        height,
        aspectRatio,
        overflow: "visible",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          border: borderWidth + "px solid " + composition.tokens.foreground,
          borderRadius,
          background: composition.tokens.foreground,
          boxShadow: "0 16px 34px rgba(23,25,23,.28)",
        }}
      >
        {device === "phone" && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "1.5%",
              zIndex: 2,
              width: "32%",
              height: "2.5%",
              transform: "translateX(-50%)",
              borderRadius: "50%",
              background: composition.tokens.foreground,
            }}
          />
        )}
        <Image
          src={src}
          alt={label}
          fill
          unoptimized
          style={{
            objectFit: "cover",
            objectPosition:
              String(composition.screenshotCrop.x) +
              "% " +
              String(composition.screenshotCrop.y) +
              "%",
          }}
        />
      </div>
      {device === "desktop" && (
        <>
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "-10%",
              width: "18%",
              height: "11%",
              transform: "translateX(-50%)",
              background: composition.tokens.foreground,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "-14%",
              width: "34%",
              height: "5%",
              transform: "translateX(-50%)",
              borderRadius: "50%",
              background: composition.tokens.foreground,
            }}
          />
        </>
      )}
    </div>
  );
}

function RenderDeviceGallery({
  composition,
}: {
  composition: CreativeComposition;
}) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        display: "grid",
        gridTemplateColumns: "1.38fr .62fr",
        gridTemplateRows: "1.08fr .92fr",
        gap: "3%",
        flex: "0.85 1 0",
        minHeight: 0,
        width: "100%",
      }}
    >
      <div
        style={{
          gridColumn: "1 / span 2",
          display: "flex",
          minHeight: 0,
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        <RenderDeviceFrame
          composition={composition}
          device="desktop"
          src={composition.mockups.desktop}
          height="94%"
        />
      </div>
      <div
        style={{
          display: "flex",
          minHeight: 0,
          alignItems: "flex-end",
          justifyContent: "flex-end",
        }}
      >
        <RenderDeviceFrame
          composition={composition}
          device="tablet"
          src={composition.mockups.tablet}
          height="92%"
        />
      </div>
      <div
        style={{
          display: "flex",
          minHeight: 0,
          alignItems: "flex-end",
          justifyContent: "flex-start",
        }}
      >
        <RenderDeviceFrame
          composition={composition}
          device="phone"
          src={composition.mockups.phone}
          height="92%"
        />
      </div>
    </div>
  );
}

function RenderLayeredElement({
  composition,
  element,
}: {
  composition: CreativeComposition;
  element: CreativeElement;
}) {
  if (element.hidden) return null;
  const effectClass = creativeLayerEffectClass(element);
  const shadow = creativeLayerShadow(element, composition.tokens.accent);
  const sourceRadius = composition.tokens.radius ?? 8;
  const fontSize = Math.max(
    8,
    ((element.fontSize ?? 1.5) / 100) * composition.output.width,
  );

  return (
    <div
      style={{
        position: "absolute",
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "center",
      }}
    >
      <div
        className={cn("h-full w-full", effectClass)}
        style={{
          opacity: element.opacity,
          filter: element.blur ? `blur(${element.blur}px)` : undefined,
          boxShadow: shadow,
        }}
      >
        {element.kind === "text" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              overflow: "hidden",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              color:
                element.color ??
                (element.textRole === "cta"
                  ? composition.tokens.background
                  : composition.tokens.foreground),
              background:
                element.textRole === "cta"
                  ? element.fill ?? composition.tokens.foreground
                  : "transparent",
              fontSize,
              fontWeight: element.fontWeight ?? 450,
              lineHeight:
                element.lineHeight ??
                (element.textRole === "headline" ? 0.96 : 1.2),
              textAlign: element.align ?? "left",
              borderRadius:
                element.textRole === "cta"
                  ? `${element.radius ?? sourceRadius}px`
                  : undefined,
              textTransform:
                element.textTransform ??
                (element.textRole === "eyebrow" ? "uppercase" : undefined),
              display: element.textRole === "cta" ? "flex" : undefined,
              alignItems: element.textRole === "cta" ? "center" : undefined,
              justifyContent:
                element.textRole === "cta"
                  ? element.align === "right"
                    ? "flex-end"
                    : element.align === "center"
                      ? "center"
                      : "flex-start"
                  : undefined,
              padding: element.textRole === "cta" ? "0 5%" : undefined,
            }}
          >
            {element.text}
          </div>
        )}
        {element.kind === "image" && element.src && (
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "hidden",
              borderRadius: `${element.radius ?? sourceRadius}px`,
            }}
          >
            <Image
              src={element.src}
              alt={element.alt ?? ""}
              fill
              unoptimized
              style={{
                objectFit: element.imageFit ?? "cover",
                objectPosition: `${element.imagePositionX ?? composition.screenshotCrop.x}% ${element.imagePositionY ?? composition.screenshotCrop.y}%`,
              }}
            />
          </div>
        )}
        {element.kind === "shape" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: element.fill ?? composition.tokens.foreground,
              borderRadius:
                element.shape === "circle"
                  ? "50%"
                  : `${element.radius ?? sourceRadius}px`,
            }}
          />
        )}
        {element.kind === "gradient" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(${element.gradientAngle ?? 135}deg, ${element.gradientFrom ?? composition.tokens.background}, ${element.gradientTo ?? composition.tokens.accent})`,
              borderRadius: `${element.radius ?? 0}px`,
            }}
          />
        )}
        {element.kind === "icon" && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: element.color ?? composition.tokens.accent,
              background: element.fill ?? "transparent",
              borderRadius: "50%",
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

function RenderLayeredComposition({
  composition,
}: {
  composition: CreativeComposition;
}) {
  const elements = getEditorElements(composition);
  const hasRichBackdrop = elements.some(
    (element) => element.kind === "gradient" || element.kind === "icon",
  );

  return (
    <div
      style={{
        position: "relative",
        width: composition.output.width,
        height: composition.output.height,
        overflow: "hidden",
        background: composition.tokens.background,
        color: composition.tokens.foreground,
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
          style={{
            position: "absolute",
            right: "5%",
            top: "5%",
            width: "7%",
            height: "7%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: composition.tokens.foreground,
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
      {elements.map((element) => (
        <RenderLayeredElement
          key={element.id}
          composition={composition}
          element={element}
        />
      ))}
    </div>
  );
}

export function RenderComposition({
  composition,
}: {
  composition: CreativeComposition;
}) {
  if (composition.designSource === "ai" || composition.elements?.length) {
    return <RenderLayeredComposition composition={composition} />;
  }

  const split =
    composition.templateId === "split" || composition.templateId === "feature";
  const quote = composition.templateId === "quote";
  const phone = composition.templateId === "phone";
  const devices = composition.imageMode === "devices";
  const borderWidth = Math.max(5, composition.output.width * 0.006);
  const sourceRadius = composition.tokens.radius ?? 8;
  const sourceSpacing = composition.tokens.spacing ?? 16;
  const deviceContentWidth = composition.output.width * 0.86;
  const deviceTypography = {
    eyebrow: Math.max(8, deviceContentWidth * 0.02),
    headline: Math.max(20, deviceContentWidth * 0.074),
    subheadline: Math.max(10, deviceContentWidth * 0.027),
    body: Math.max(8, deviceContentWidth * 0.02),
    cta: Math.max(8, deviceContentWidth * 0.02),
    footer: Math.max(6, deviceContentWidth * 0.015),
    icon: Math.max(20, deviceContentWidth * 0.069),
    iconGlyph: Math.max(12, deviceContentWidth * 0.032),
    headerGap: Math.max(4, deviceContentWidth * 0.012),
    ctaVerticalPadding: Math.max(6, deviceContentWidth * 0.014),
    ctaHorizontalPadding: Math.max(8, deviceContentWidth * 0.02),
  };

  return (
    <div
      style={{
        width: composition.output.width,
        height: composition.output.height,
        background: composition.tokens.background,
        color: composition.tokens.foreground,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: devices ? "column" : split ? "row" : "column",
        gap: devices ? `${Math.max(2, sourceSpacing / 8)}%` : undefined,
        padding: `${Math.max(5, Math.min(10, sourceSpacing / 2))}%`,
        textAlign: quote ? "center" : "left",
      }}
    >
      <CreativeGraphic
        name={composition.graphic}
        color={composition.tokens.foreground}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: devices ? "100%" : split ? "44%" : "100%",
          height: devices ? undefined : "auto",
          flex: devices ? "1.15 1 0" : undefined,
          display: "flex",
          flexDirection: "column",
          alignItems: quote ? "center" : "flex-start",
          justifyContent: "space-between",
          minHeight: 0,
          minWidth: 0,
          overflow: devices ? "hidden" : undefined,
          paddingBottom: devices || split ? 0 : "5%",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: quote ? "center" : "flex-start",
              gap: devices ? deviceTypography.headerGap : 10,
            }}
          >
            <span
              style={{
                width: devices ? deviceTypography.icon : 34,
                height: devices ? deviceTypography.icon : 34,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: composition.tokens.foreground,
                color: composition.tokens.accent,
              }}
            >
              <CreativeIconGlyph
                name={composition.icon}
                size={devices ? deviceTypography.iconGlyph : 18}
                color="currentColor"
                weight="bold"
              />
            </span>
            <p
              style={{
                margin: 0,
                fontSize: devices
                  ? deviceTypography.eyebrow
                  : Math.max(13, composition.output.width * 0.012),
                textTransform: "uppercase",
                opacity: 0.75,
              }}
            >
              {composition.text.eyebrow}
            </p>
          </div>
          <h1
            style={{
              margin: devices ? "4% 0 0" : "7% 0 0",
              maxWidth: devices || quote ? "14ch" : "90%",
              fontSize: devices
                ? deviceTypography.headline
                : Math.max(42, composition.output.width * 0.065),
              lineHeight: 0.95,
            }}
          >
            {composition.text.headline}
          </h1>
          <p
            style={{
              margin: devices ? "5% 0 0" : "6% 0 0",
              maxWidth: "38ch",
              fontSize: devices
                ? deviceTypography.subheadline
                : Math.max(18, composition.output.width * 0.018),
              lineHeight: 1.16,
              fontWeight: 600,
            }}
          >
            {composition.text.subheadline}
          </p>
          <p
            style={{
              margin: devices ? "3% 0 0" : "4% 0 0",
              maxWidth: "48ch",
              fontSize: devices
                ? deviceTypography.body
                : Math.max(14, composition.output.width * 0.012),
              lineHeight: devices ? 1.32 : 1.35,
              opacity: 0.75,
            }}
          >
            {composition.text.body}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: quote ? "center" : "space-between",
            gap: sourceSpacing,
            width: "100%",
            marginTop: devices ? "5%" : "7%",
          }}
        >
          <span
            style={{
            borderRadius: sourceRadius,
              padding: devices
                ? deviceTypography.ctaVerticalPadding +
                  "px " +
                  deviceTypography.ctaHorizontalPadding +
                  "px"
                : "12px 16px",
              background: composition.tokens.foreground,
              color: composition.tokens.accent,
              fontWeight: 700,
              fontSize: devices
                ? deviceTypography.cta
                : Math.max(13, composition.output.width * 0.012),
            }}
          >
            {composition.text.cta}
          </span>
          <span
            style={{
              maxWidth: "18ch",
              fontSize: devices
                ? deviceTypography.footer
                : Math.max(10, composition.output.width * 0.009),
              textTransform: "uppercase",
              opacity: 0.6,
            }}
          >
            {composition.text.footer}
          </span>
        </div>
      </div>
      {devices ? (
        <RenderDeviceGallery composition={composition} />
      ) : (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            margin: split ? "4% 0 0 4%" : 0,
            border:
              composition.templateId === "launch-card" ||
              composition.templateId === "quote"
                ? `1px solid color-mix(in srgb, ${composition.tokens.foreground} 35%, transparent)`
                : borderWidth + "px solid " + composition.tokens.foreground,
            borderRadius: phone ? Math.max(24, sourceRadius * 3) : sourceRadius,
            width: split ? "56%" : phone ? "44%" : "100%",
            alignSelf: phone ? "center" : "stretch",
          }}
        >
          {composition.templateId === "browser" && (
            <div
              style={{
                position: "absolute",
                inset: "0 0 auto",
                zIndex: 2,
                height: "5%",
                minHeight: 18,
                background: composition.tokens.foreground,
              }}
            />
          )}
          <Image
            src={composition.screenshotUrl}
            alt=""
            fill
            unoptimized
            style={{
              objectFit: "cover",
              objectPosition:
                String(composition.screenshotCrop.x) +
                "% " +
                String(composition.screenshotCrop.y) +
                "%",
            }}
          />
        </div>
      )}
      <span
        style={{
          position: "absolute",
          right: "7%",
          bottom: "4%",
          zIndex: 3,
          borderRadius: Math.max(4, sourceRadius / 2),
          padding: "6px 8px",
          background: composition.tokens.foreground,
          color: composition.tokens.background,
          fontSize: 10,
          textTransform: "uppercase",
        }}
      >
        Free preview
      </span>
    </div>
  );
}
