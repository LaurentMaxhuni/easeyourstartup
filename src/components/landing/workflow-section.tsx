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
    title: "Approve the story",
    body: "Edit your Brand DNA, choose a narrative angle, and keep only the claims you are ready to publish.",
    icon: CheckCircle,
  },
  {
    title: "Build the campaign",
    body: "Generate platform-native copy and screenshot-led visuals for the channels that matter.",
    icon: Megaphone,
  },
  {
    title: "Export or rally support",
    body: "Download the campaign or publish a supporter room with approved assets.",
    icon: Export,
  },
] as const;

export function WorkflowSection() {
  return (
    <section id="workflow" className="border-t border-line py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[.8fr_1.2fr]">
          <Reveal>
            <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
              A five minute first campaign
            </p>
            <h2 className="mt-5 max-w-xl text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
              A launch workflow, not another blank chat.
            </h2>
          </Reveal>
          <div className="border-t border-line">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <Reveal
                  key={step.title}
                  delay={index * 0.05}
                  className="grid gap-5 border-b border-line py-7 sm:grid-cols-[44px_180px_1fr] sm:items-start"
                >
                  <span className="flex size-10 items-center justify-center rounded-control border border-line bg-surface-raised text-accent">
                    <Icon size={20} />
                  </span>
                  <h3 className="text-lg font-semibold tracking-[-0.025em]">
                    {step.title}
                  </h3>
                  <p className="max-w-xl text-sm leading-6 text-muted">
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
