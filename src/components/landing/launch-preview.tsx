import Image from "next/image";
import { Check, ImageSquare, LinkedinLogo } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";

export function LaunchPreview() {
  return (
    <div id="campaign-preview" className="campaign-window relative scroll-mt-24 rounded-[20px] border border-line bg-surface-raised p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-3 pt-1.5 sm:px-3">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="size-2 rounded-full bg-muted/40" />
            <span className="size-2 rounded-full bg-muted/25" />
            <span className="size-2 rounded-full bg-muted/15" />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Campaign preview
          </span>
        </div>
        <Badge className="border-accent/20 bg-accent/5 text-accent">
          <Check aria-hidden="true" size={12} weight="bold" /> Source checked
        </Badge>
      </div>
      <div className="relative aspect-[16/11] overflow-hidden rounded-xl border border-line bg-surface sm:aspect-[16/10]">
        <Image
          src="/images/studio-capture.png"
          alt="The real EaseYourStartup campaign studio"
          fill
          loading="eager"
          className="object-cover object-left-top"
          sizes="(max-width: 1024px) 92vw, 50vw"
        />
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/20 bg-[#111a30]/90 px-4 py-3 text-white backdrop-blur-md sm:inset-x-4 sm:bottom-4 sm:px-5 sm:py-4">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#c8d5ee]">
            Real product screen
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight sm:text-2xl">
            Turn every ship into a campaign.
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-line bg-canvas p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-accent/10 text-accent">
            <LinkedinLogo aria-hidden="true" size={17} weight="fill" />
          </span>
          <span className="text-xs font-semibold">LinkedIn</span>
          <span aria-hidden="true" className="ml-auto h-px w-12 bg-line" />
        </div>
        <p className="mt-3 text-sm font-medium leading-6">
          A product update can take weeks to build and ten quiet minutes to announce.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          We built a source-backed launch workflow around real product screenshots.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 pt-4 text-[11px] text-muted sm:px-3">
        <span className="inline-flex items-center gap-1.5">
          <Check aria-hidden="true" className="text-accent" size={15} weight="bold" />
          3 source facts kept
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ImageSquare aria-hidden="true" className="text-accent" size={15} />
          4 export sizes
        </span>
      </div>
    </div>
  );
}
