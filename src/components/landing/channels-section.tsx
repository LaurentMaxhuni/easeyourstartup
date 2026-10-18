import { CHANNELS } from "@/lib/channels";
import { Reveal } from "@/components/reveal";

export function ChannelsSection() {
  return (
    <section className="border-t border-line py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              Start where founders publish
            </p>
            <h2 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.04em] sm:text-5xl">
              Start with the channels that move a launch.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted">
            Begin with X, LinkedIn, Product Hunt, and email. Add other channels
            when the launch needs them.
          </p>
        </Reveal>
        <div className="mt-12 grid overflow-hidden rounded-container border border-line bg-surface-raised md:grid-cols-3">
          {CHANNELS.map((channel, index) => (
            <Reveal
              key={channel.id}
              delay={(index % 3) * 0.03}
              className="grid content-start gap-2 border-b border-line p-6 last:border-b-0 md:border-r md:[&:nth-child(3n)]:border-r-0 md:[&:nth-last-child(-n+3)]:border-b-0"
            >
              <span className="mb-2 text-[11px] font-semibold text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-lg font-semibold tracking-tight">{channel.name}</span>
              <span className="text-sm leading-6 text-muted">{channel.note}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
