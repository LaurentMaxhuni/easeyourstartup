import Image from "next/image";
import { LinkSimple } from "@phosphor-icons/react/dist/ssr";
import { Reveal } from "@/components/reveal";

export function ProofSection() {
  return (
    <section id="examples" className="border-t border-line bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_.8fr]">
          <Reveal className="relative min-h-[520px] overflow-hidden rounded-container border border-line">
            <Image
              src="/images/founder-launch-studio.png"
              alt="A founder arranging launch assets at a practical studio desk"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 94vw, 58vw"
            />
          </Reveal>
          <Reveal delay={0.08} className="lg:pb-8">
            <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
              Proof before polish
            </p>
            <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              Every publishable claim keeps its receipt.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted">
              Scanned copy is untrusted evidence, never an instruction. You
              get the useful source facts after automatic curation, before they
              reach a caption.
            </p>
            <div className="mt-10 rounded-container border border-line bg-surface-raised p-5">
              <div className="flex items-center gap-2 font-sans text-[11px] uppercase tracking-[0.14em] text-muted">
                <LinkSimple size={16} />
                Kept source fact
              </div>
              <p className="mt-4 text-lg font-semibold leading-7">
                Creates platform-specific copy from your website and update
                details.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
