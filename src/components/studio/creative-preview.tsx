"use client";

import Image from "next/image";
import type { RefObject } from "react";
import {
  CreativeGraphic,
  CreativeIconGlyph,
} from "@/components/studio/creative-icons";
import type {
  CreativeComposition,
  CreativeMockupDevice,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

function PostCopy({
  composition,
  centered,
  deviceMode = false,
  className,
}: {
  composition: CreativeComposition;
  centered: boolean;
  deviceMode?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative z-10 flex min-w-0 flex-1 flex-col justify-between p-[7%]",
        centered && "items-center text-center",
        deviceMode && "overflow-hidden p-0",
        className,
      )}
    >
      <div className={cn("w-full", centered && "flex flex-col items-center")}>
        <div className={cn("flex items-center gap-2", deviceMode && "gap-1.5")}>
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              deviceMode && "size-[clamp(20px,7cqw,28px)]",
            )}
            style={{
              backgroundColor: composition.tokens.foreground,
              color: composition.tokens.accent,
            }}
          >
            <CreativeIconGlyph
              name={composition.icon}
              size={16}
              color="currentColor"
              weight="bold"
            />
          </span>
          <p
            className={cn(
              "font-sans text-[clamp(8px,1.2vw,13px)] uppercase tracking-[0.16em] opacity-75",
              deviceMode && "text-[clamp(8px,2cqw,11px)]",
            )}
          >
            {composition.text.eyebrow}
          </p>
        </div>
        <h2
          className={cn(
            "mt-[8%] max-w-[13ch] text-balance text-[clamp(26px,5.4vw,62px)] font-semibold leading-[.94] tracking-[-0.06em]",
            deviceMode &&
              "mt-[4%] max-w-[14ch] text-[clamp(20px,7.4cqw,42px)] leading-[.95]",
          )}
        >
          {composition.text.headline}
        </h2>
        <p
          className={cn(
            "mt-[6%] max-w-[38ch] text-[clamp(11px,1.55vw,18px)] font-medium leading-[1.16]",
            deviceMode && "mt-[5%] text-[clamp(10px,2.7cqw,15px)]",
          )}
        >
          {composition.text.subheadline}
        </p>
        <p
          className={cn(
            "mt-[4%] max-w-[48ch] text-[clamp(9px,1.12vw,14px)] leading-[1.35] opacity-75",
            deviceMode && "mt-[3%] text-[clamp(8px,2cqw,11px)] leading-[1.32]",
          )}
        >
          {composition.text.body}
        </p>
      </div>
      <div
        className={cn(
          "mt-[7%] flex w-full items-end justify-between gap-3",
          deviceMode && "mt-[5%] gap-2",
        )}
      >
        <span
          className={cn(
            "rounded-[8px] px-3 py-2 text-[clamp(9px,1.2vw,13px)] font-semibold",
            deviceMode && "rounded-[6px] px-2 py-1.5 text-[clamp(8px,2cqw,11px)]",
          )}
          style={{
            backgroundColor: composition.tokens.foreground,
            color: composition.tokens.accent,
          }}
        >
          {composition.text.cta}
        </span>
        <span
          className={cn(
              "max-w-[18ch] text-right font-sans text-[clamp(7px,.9vw,10px)] uppercase tracking-[0.08em] opacity-60",
            deviceMode && "text-[clamp(6px,1.5cqw,8px)]",
          )}
        >
          {composition.text.footer}
        </span>
      </div>
    </div>
  );
}

function DeviceFrame({
  composition,
  device,
  src,
  className,
}: {
  composition: CreativeComposition;
  device: CreativeMockupDevice;
  src: string;
  className?: string;
}) {
  const aspectClass =
    device === "desktop"
      ? "aspect-[16/10]"
      : device === "tablet"
        ? "aspect-[3/4]"
        : "aspect-[9/19]";
  const radiusClass =
    device === "desktop"
      ? "rounded-[6px] border-[5px]"
      : device === "tablet"
        ? "rounded-[16px] border-[5px]"
        : "rounded-[26px] border-[6px]";
  const label =
    device === "desktop"
      ? "PC product screenshot"
      : device === "tablet"
        ? "Tablet product screenshot"
        : "Phone product screenshot";

  return (
    <div className={cn("relative max-h-full max-w-full overflow-visible", aspectClass, className)}>
      <div
        className={cn(
          "relative h-full w-full overflow-hidden border-[#171917] bg-[#171917] shadow-[0_12px_30px_rgba(23,25,23,0.28)]",
          radiusClass,
        )}
      >
        {device === "phone" && (
          <div className="absolute left-1/2 top-[1.5%] z-20 h-[2.5%] w-[32%] -translate-x-1/2 rounded-full bg-[#171917]" />
        )}
        <Image
          src={src}
          alt={label}
          fill
          unoptimized
          className="object-cover"
          style={{
            objectPosition:
              String(composition.screenshotCrop.x) +
              "% " +
              String(composition.screenshotCrop.y) +
              "%",
          }}
          sizes="560px"
        />
      </div>
      {device === "desktop" && (
        <>
          <div className="absolute -bottom-[10%] left-1/2 h-[11%] w-[18%] -translate-x-1/2 bg-[#171917]" />
          <div className="absolute -bottom-[14%] left-1/2 h-[5%] w-[34%] -translate-x-1/2 rounded-full bg-[#171917]" />
        </>
      )}
    </div>
  );
}

function DeviceGallery({ composition }: { composition: CreativeComposition }) {
  return (
    <div className="relative z-10 grid min-h-0 grid-cols-[1.38fr_.62fr] grid-rows-[1.08fr_.92fr] gap-[3%]">
      <div className="col-span-2 flex min-h-0 min-w-0 items-end justify-center">
        <DeviceFrame
          composition={composition}
          device="desktop"
          src={composition.mockups.desktop}
          className="h-[94%] w-auto"
        />
      </div>
      <div className="flex min-h-0 min-w-0 items-end justify-end">
        <DeviceFrame
          composition={composition}
          device="tablet"
          src={composition.mockups.tablet}
          className="h-[92%] w-auto"
        />
      </div>
      <div className="flex min-h-0 min-w-0 items-end justify-start">
        <DeviceFrame
          composition={composition}
          device="phone"
          src={composition.mockups.phone}
          className="h-[92%] w-auto"
        />
      </div>
    </div>
  );
}

function DeviceComposition({ composition }: { composition: CreativeComposition }) {
  return (
    <div className="relative z-10 grid h-full min-h-0 grid-rows-[minmax(0,1.15fr)_minmax(0,.85fr)] gap-[3%] p-[7%] [container-type:inline-size]">
      <PostCopy
        composition={composition}
        centered={false}
        deviceMode
        className="min-h-0 p-0"
      />
      <DeviceGallery composition={composition} />
    </div>
  );
}

export function CreativePreview({
  composition,
  captureRef,
  watermarked = true,
}: {
  composition: CreativeComposition;
  captureRef: RefObject<HTMLDivElement | null>;
  watermarked?: boolean;
}) {
  const ratio = composition.output.width / composition.output.height;
  const phone = composition.templateId === "phone";
  const asymmetrical =
    composition.templateId === "split" || composition.templateId === "feature";
  const centered = composition.templateId === "quote";
  const devices = composition.imageMode === "devices";

  return (
    <div className="flex min-h-[560px] items-center justify-center overflow-auto rounded-container border border-line bg-surface p-5 sm:p-8">
      <div
        ref={captureRef}
        className="relative w-full max-w-[560px] overflow-hidden text-[#f4f3ef] shadow-[0_24px_80px_rgba(23,25,23,0.22)]"
        style={{
          aspectRatio: ratio,
          backgroundColor: composition.tokens.background,
          color: composition.tokens.foreground,
          fontFamily: "var(--font-outfit)",
        }}
      >
        <CreativeGraphic
          name={composition.graphic}
          color={composition.tokens.foreground}
        />
        {devices ? (
          <DeviceComposition composition={composition} />
        ) : (
          <div
            className={cn(
              "relative flex h-full",
              asymmetrical ? "grid grid-cols-[.88fr_1.12fr]" : "flex-col",
            )}
          >
            <div
              className={cn(
                "relative flex min-w-0",
                asymmetrical ? "min-h-full" : "min-h-[54%]",
                centered && "min-h-[58%]",
                phone && "min-h-[48%]",
              )}
            >
              <PostCopy composition={composition} centered={centered} />
            </div>
            <div
              className={cn(
                "relative z-10 min-h-0 overflow-hidden",
                asymmetrical
                  ? "m-[4%] ml-0 rounded-[9px]"
                  : "mx-[6%] mb-[6%] flex-1",
                centered &&
                  "mx-[9%] mb-[7%] min-h-[27%] flex-none rounded-[9px]",
                phone &&
                  "mx-auto mb-[6%] h-auto min-h-0 w-[48%] flex-1 rounded-[10%] border-[6px] border-[#171917]",
                composition.templateId === "browser" &&
                  "rounded-[9px] border-[5px] border-[#171917]",
                composition.templateId === "launch-card" &&
                  "rounded-[9px] border border-white/30",
              )}
            >
              {composition.templateId === "browser" && (
                <div className="absolute inset-x-0 top-0 z-20 h-[5%] min-h-4 bg-[#171917]" />
              )}
              <Image
                src={composition.screenshotUrl}
                alt="Selected real product screenshot"
                fill
                unoptimized
                className="object-cover"
                style={{
                  objectPosition:
                    String(composition.screenshotCrop.x) +
                    "% " +
                    String(composition.screenshotCrop.y) +
                    "%",
                }}
                sizes="560px"
              />
            </div>
          </div>
        )}
        {watermarked && (
          <div className="absolute bottom-3 right-3 z-30 rounded bg-[#171917]/85 px-2 py-1 font-sans text-[8px] uppercase tracking-[0.12em] text-[#f4f3ef]">
            Free preview
          </div>
        )}
      </div>
    </div>
  );
}
