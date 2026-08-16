import { CHANNELS } from "@/lib/channels";
import { Reveal } from "@/components/reveal";

export function ChannelsSection() {
  return (
    <section className="border-t border-line py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
              One update, nine native stories
            </p>
            <h2 className="mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
              Written for the room you are entering.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted">
            We change the structure and tone for each platform. We do not just
            trim the same caption nine times.
          </p>
        </Reveal>
        <div className="mt-16 border-y border-line">
          {CHANNELS.map((channel, index) => (
            <Reveal
              key={channel.id}
              delay={(index % 3) * 0.03}
              className="grid gap-2 border-b border-line py-5 last:border-b-0 sm:grid-cols-[80px_200px_1fr] sm:items-center"
            >
              <span className="font-sans text-[11px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-semibold">{channel.name}</span>
              <span className="text-sm text-muted">{channel.note}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
