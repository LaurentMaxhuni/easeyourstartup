import {
  Browser,
  CheckCircle,
  Export,
  Megaphone,
} from "@phosphor-icons/react/dist/ssr";
import { Reveal } from "@/components/reveal";

const STEPS = [
  {
    title: "Scan the source",
    body: "We inspect public pages, capture real screens, and map every factual claim back to its URL.",
    icon: Browser,
  },
  {
    title: "Filter the signal",
    body: "AI and rules remove duplicate, low-signal, and navigation-heavy claims before the brief is built.",
    icon: CheckCircle,
  },
  {
    title: "Build the campaign",
    body: "Generate platform-native copy and screenshot-led visuals for the channels that matter.",
    icon: Megaphone,
  },
  {
    title: "Review and export",
    body: "Check the source evidence, download one organized launch kit, and publish on your own schedule.",
    icon: Export,
  },
] as const;

export function WorkflowSection() {
  return (
    <section id="workflow" className="border-t border-line py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[.8fr_1.2fr]">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              A 15-minute launch kit
            </p>
            <h2 className="mt-5 max-w-xl text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.04em] sm:text-5xl">
              A launch kit built from your product, not a blank chat.
            </h2>
          </Reveal>
          <div className="border-t border-line">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <Reveal
                  key={step.title}
                  delay={index * 0.05}
                  className="grid gap-4 border-b border-line py-7 sm:grid-cols-[44px_1fr] lg:grid-cols-[44px_150px_1fr] lg:items-start"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl border border-accent/15 bg-accent/5 text-accent">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight sm:pt-1">
                    {step.title}
                  </h3>
                  <p className="max-w-xl text-sm leading-6 text-muted sm:col-start-2 lg:col-start-auto">
                    {step.body}
                  </p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
