import Image from "next/image";
import { Check, Copy, ImageSquare } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";

export function LaunchPreview() {
  return (
    <div className="relative overflow-hidden rounded-container border border-line bg-surface-raised p-3 shadow-[0_24px_80px_rgba(23,25,23,0.12)]">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-4 rounded-sm bg-accent" />
          <span className="font-sans text-[10px] uppercase tracking-[0.16em] text-muted">
            Campaign preview
          </span>
        </div>
        <Badge className="border-accent/25 bg-accent/10 text-accent">
          Source checked
        </Badge>
      </div>
      <div className="grid min-h-[440px] gap-3 md:grid-cols-[1.15fr_.85fr]">
        <div className="relative min-h-[280px] overflow-hidden rounded-[10px] border border-line bg-ink">
          <Image
            src="/images/studio-capture.png"
            alt="The real EaseYourStartup campaign studio"
            fill
            className="object-cover object-left-top"
            sizes="(max-width: 768px) 92vw, 34vw"
          />
          <div className="absolute inset-x-3 bottom-3 rounded-[10px] border border-white/20 bg-[#171917]/90 p-4 text-[#f4f3ef] backdrop-blur-sm">
            <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-[#c8ccc5]">
              Real product screen
            </p>
            <p className="mt-1.5 text-xl font-semibold tracking-[-0.04em]">
              Turn every ship into a campaign.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex-1 rounded-[10px] border border-line bg-canvas p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">LinkedIn</span>
              <Copy size={15} className="text-muted" />
            </div>
            <p className="mt-5 text-sm leading-6">
              A product update can take weeks to build and ten quiet minutes to
              announce.
            </p>
            <p className="mt-4 text-xs leading-5 text-muted">
              We built a source-backed launch workflow around real product
              screenshots.
            </p>
          </div>
          <div className="rounded-[10px] border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Check className="text-accent" size={16} weight="bold" />
              3 approved claims
            </div>
          </div>
          <div className="rounded-[10px] border border-line bg-accent p-4 text-accent-ink">
            <div className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.14em]">
              <ImageSquare size={15} />
              4 export sizes
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
