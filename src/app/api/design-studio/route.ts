import { after, NextResponse } from "next/server";
import { z } from "zod";
import { designDocumentSchema, brandKitSchema, designAssetSchema } from "@/lib/design-studio/document";
import { designJobInputSchema } from "@/lib/design-studio/workflow";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { rateLimit } from "@/lib/server/rate-limit";
import { getDesignProviderSettings, hasDesignProviders } from "@/lib/server/design-studio/providers";
import { listDesigns, getDesign, saveDesign, listBrandKits, saveBrandKit, createDesignJob, changeDesignJob, getDesignJob } from "@/lib/server/design-studio/storage";
import { dispatchDesignJob } from "@/lib/server/design-studio/jobs";
import { fitDesignToRender } from "@/lib/server/design-studio/fit";
import { designHttpError, DesignHttpError } from "@/lib/server/design-studio/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { database, workspaceId, limits } = await requireWorkspaceContext();
    const designId = new URL(request.url).searchParams.get("designId");
    if (designId) {
      const result = await getDesign(database, workspaceId, z.uuid().parse(designId));
      if (!result) throw new DesignHttpError("Design not found.", 404);
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [designs, brands, usage] = await Promise.all([
      listDesigns(database, workspaceId), listBrandKits(database, workspaceId),
      database`select provider, model, count(*)::integer as requests,
        sum(input_tokens)::bigint as input_tokens, sum(output_tokens)::bigint as output_tokens,
        sum(latency_ms)::bigint as latency_ms from public.design_ai_events
        where workspace_id = ${workspaceId}::uuid and created_at > now() - interval '30 days' group by provider, model`,
    ]);
    const { providers, ...providerSettings } = getDesignProviderSettings();
    const activeJobs = await database`select id, status, stage, updated_at from public.design_jobs
      where workspace_id = ${workspaceId}::uuid and status in ('queued','running') order by created_at desc limit 8`;
    return NextResponse.json({ designs, brands, providers, providerSettings, usage, activeJobs, exportEntitlements: { highResolutionExports: limits.highResolutionExports, watermarked: limits.watermarked } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return designHttpError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { database, workspaceId } = await requireWorkspaceContext();
    const raw = await readJsonBody(request, 12_000_000);
    const { action } = z.object({ action: z.enum(["save", "brand", "generate", "edit", "cancel", "retry"]) }).parse(raw);
    if (action === "save" || action === "brand") {
      const limit = await rateLimit(`design-studio-write:${workspaceId}:${action}`, { limit: action === "save" ? 120 : 30, windowMs: 3600000 });
      if (!limit.allowed) throw new DesignHttpError("Design saving limit reached. Your local draft is preserved; try again later.", 429);
    }
    if (action === "save") {
      const input = z.object({ id: z.uuid().optional(), revision: z.number().int().positive().optional(), document: designDocumentSchema, fit: z.boolean().optional() })
        .refine((value) => !value.id || value.revision !== undefined, { path: ["revision"], message: "An existing design requires its saved revision." })
        .refine((value) => !value.fit || !value.id, { path: ["fit"], message: "Only new designs are fitted on save." }).parse(raw);
      // New campaign visuals are measured in the browser before their first save,
      // so they open and export without text overflow.
      const document = input.fit ? (await fitDesignToRender(input.document, { signal: request.signal })).document : input.document;
      return NextResponse.json({ design: await saveDesign(database, workspaceId, { id: input.id, revision: input.revision, document }) });
    }
    if (action === "brand") {
      const input = z.object({ id: z.uuid().optional(), kit: brandKitSchema, assets: z.array(designAssetSchema).max(12) }).parse(raw);
      return NextResponse.json({ brand: await saveBrandKit(database, workspaceId, input) });
    }
    const limit = await rateLimit(`design-studio:${workspaceId}`, { limit: action === "cancel" ? 60 : 12, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) throw new DesignHttpError("Design request limit reached. Try again later.", 429);
    if (action === "cancel" || action === "retry") {
      const { jobId } = z.object({ jobId: z.uuid() }).parse(raw);
      if (!await getDesignJob(database, workspaceId, jobId)) throw new DesignHttpError("Design job not found.", 404);
      if (action === "retry" && !process.env.INNGEST_EVENT_KEY) throw new DesignHttpError("Durable design jobs are not configured.", 503);
      const job = await changeDesignJob(database, workspaceId, jobId, action);
      if (action === "retry") after(() => dispatchDesignJob(String(job.id), workspaceId, Number(job.attempt)).catch(() => { console.error("[design-studio] Dispatch deferred to durable recovery."); }));
      return NextResponse.json({ job });
    }
    if (!hasDesignProviders()) throw new DesignHttpError("Configure a design AI provider and its model capabilities on the server before generating.", 503);
    if (!process.env.INNGEST_EVENT_KEY) throw new DesignHttpError("Durable design jobs are not configured.", 503);
    const input = designJobInputSchema.parse(raw);
    const job = await createDesignJob(database, workspaceId, input);
    after(() => dispatchDesignJob(String(job.id), workspaceId, Number(job.attempt)).catch(() => { console.error("[design-studio] Dispatch deferred to durable recovery."); }));
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) { return designHttpError(error); }
}
