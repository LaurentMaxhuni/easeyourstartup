import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { RenderComposition } from "@/components/render-composition";
import { RenderReadinessSignal } from "@/components/render-readiness-signal";
import { creativeCompositionSchema } from "@/lib/contracts";
import { createDatabase } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Campaign render",
  robots: { index: false, follow: false },
};

function renderCanvas(composition: ReturnType<typeof creativeCompositionSchema.parse>, watermarked: boolean) {
  return (
    <main
      id="campaign-render"
      style={{
        position: "fixed",
        inset: 0,
        width: composition.output.width,
        height: composition.output.height,
        overflow: "hidden",
        background: composition.tokens.background,
      }}
    >
      <style>{"html,body{margin:0!important;padding:0!important;overflow:hidden!important}*{animation-play-state:paused!important;transition:none!important}"}</style>
      <RenderComposition composition={composition} />
      {watermarked && <span style={{ position: "absolute", bottom: "3%", right: "3%", zIndex: 100, background: "rgba(255,255,255,.9)", color: "#111", padding: "8px 16px", fontSize: Math.max(14, composition.output.width * 0.014), fontFamily: "sans-serif" }}>Made with EaseYourStartup</span>}
      <RenderReadinessSignal />
    </main>
  );
}

export default async function InternalRenderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) notFound();
  const database = createDatabase();
  if (!database) notFound();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await database`
    select composition
    from public.render_requests
    where token_hash = ${tokenHash}
      and expires_at > pg_catalog.now()
    limit 1
  `;
  if (!row) notFound();
  const compositionValue = typeof row.composition === "string"
    ? JSON.parse(row.composition) as unknown
    : row.composition;
  const parsed = creativeCompositionSchema.safeParse(compositionValue);
  if (!parsed.success) notFound();
  const watermarked = !(compositionValue && typeof compositionValue === "object" && "watermarked" in compositionValue && compositionValue.watermarked === false);
  return renderCanvas(parsed.data, watermarked);
}
