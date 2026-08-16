"use client";

import {
  ArrowUpRight,
  Broadcast,
  ChartLineUp,
  CheckCircle,
  CircleDashed,
  CursorClick,
  GridFour,
  Lightning,
  RocketLaunch,
  ShieldCheck,
  Sparkle,
  Target,
  UsersThree,
  WaveSine,
  type Icon,
} from "@phosphor-icons/react";
import type {
  CreativeGraphic,
  CreativeIcon as CreativeIconName,
} from "@/lib/contracts";

const ICONS: Record<CreativeIconName, Icon> = {
  sparkle: Sparkle,
  "rocket-launch": RocketLaunch,
  "chart-line-up": ChartLineUp,
  "users-three": UsersThree,
  "check-circle": CheckCircle,
  lightning: Lightning,
  "shield-check": ShieldCheck,
  "arrow-up-right": ArrowUpRight,
  target: Target,
  "cursor-click": CursorClick,
};

export function CreativeIconGlyph({
  name,
  size = 28,
  color = "currentColor",
  weight = "duotone",
  className,
}: {
  name: CreativeIconName;
  size?: number;
  color?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
}) {
  const IconComponent = ICONS[name] ?? Sparkle;
  return (
    <IconComponent
      aria-hidden="true"
      className={className}
      color={color}
      size={size}
      weight={weight}
    />
  );
}

export function CreativeGraphic({
  name,
  color,
}: {
  name: CreativeGraphic;
  color: string;
}) {
  if (name === "none") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {name === "orbit" && (
        <>
          <CircleDashed
            className="absolute -right-[8%] -top-[12%] opacity-35"
            color={color}
            size="78%"
            weight="thin"
          />
          <CircleDashed
            className="absolute -right-[1%] top-[4%] opacity-25"
            color={color}
            size="48%"
            weight="thin"
          />
          <Sparkle
            className="absolute right-[18%] top-[24%] opacity-70"
            color={color}
            size={38}
            weight="duotone"
          />
        </>
      )}
      {name === "grid" && (
        <GridFour
          className="absolute -bottom-[18%] -right-[14%] opacity-25"
          color={color}
          size="72%"
          weight="thin"
        />
      )}
      {name === "spark-field" && (
        <>
          <Sparkle
            className="absolute right-[12%] top-[16%] opacity-75"
            color={color}
            size={52}
            weight="fill"
          />
          <Sparkle
            className="absolute bottom-[18%] right-[26%] opacity-45"
            color={color}
            size={24}
            weight="fill"
          />
          <Sparkle
            className="absolute bottom-[30%] left-[18%] opacity-35"
            color={color}
            size={18}
            weight="fill"
          />
        </>
      )}
      {name === "signal" && (
        <>
          <WaveSine
            className="absolute -right-[4%] bottom-[2%] opacity-30"
            color={color}
            size="82%"
            weight="thin"
          />
          <Broadcast
            className="absolute right-[14%] top-[15%] opacity-60"
            color={color}
            size={54}
            weight="duotone"
          />
          <ArrowUpRight
            className="absolute right-[7%] top-[8%] opacity-45"
            color={color}
            size={24}
            weight="bold"
          />
        </>
      )}
    </div>
  );
}
