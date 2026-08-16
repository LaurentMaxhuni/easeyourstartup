import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { ShareRoomClient } from "@/components/share/share-room-client";
import { requirePageAuthentication } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Support the EaseYourStartup launch",
  description: "Copy an approved launch message and download the matching visual.",
};

export default async function ShareRoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug !== "demo-launch") notFound();
  await requirePageAuthentication(`/share/${slug}`);

  return (
    <main className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <span className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            Supporter launch room
          </span>
        </div>
      </header>
      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
            Help us launch
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
            Pick a platform. Share the story.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            Choose an approved message, copy it, and download the matching
            visual.
          </p>
        </div>
        <ShareRoomClient />
      </section>
    </main>
  );
}
