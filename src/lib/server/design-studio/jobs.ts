import "server-only";
import { inngest } from "@/inngest/client";
import { requireDatabase } from "@/lib/server/database";
import { designJobInputSchema } from "@/lib/design-studio/workflow";
import { resolveDesignTokenBudget, runDesignPipeline } from "./pipeline";
class DesignJobStoppedError extends Error {}

export async function dispatchDesignJob(jobId: string, workspaceId: string, attempt: number) {
  // A stable event ID deduplicates delivery after a network failure or process restart.
  await inngest.send({ id: `design:${jobId}:${attempt}`, name: "design-studio/generation.requested", data: { jobId, workspaceId, attempt } });
  await requireDatabase()`update public.design_jobs set dispatched_at = now()
    where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt} and status = 'queued'`;
}
export const generateStudioDesign = inngest.createFunction({
  id: "generate-studio-design", retries: 2, timeouts: { finish: "30m" },
  concurrency: { limit: 4 },
  onFailure: async ({ event }) => {
    const { jobId, workspaceId, attempt } = event.data.event.data;
    await requireDatabase()`update public.design_jobs set status = 'failed',
      error = coalesce(error, 'The design job failed after recovery attempts. Your saved designs are unchanged.'), updated_at = now()
      where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt} and status in ('queued','running')`;
  },
}, { event: "design-studio/generation.requested" }, async ({ event, step }) => {
  const { jobId, workspaceId, attempt } = event.data;
  const database = requireDatabase();
  const [job] = await database`select input, status, attempt from public.design_jobs
    where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid`;
  if (!job || Number(job.attempt) !== attempt || ["completed", "cancelled", "failed"].includes(String(job.status))) return { skipped: true };
  const input = designJobInputSchema.parse(job.input);
  await database`update public.design_jobs set status = 'running', updated_at = now()
    where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt} and status in ('queued','running')`;
  const controller = new AbortController();
  const checkActive = async () => {
    const [row] = await database`select status, attempt from public.design_jobs where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid`;
    if (!row || row.status !== "running" || Number(row.attempt) !== attempt) {
      controller.abort(new DesignJobStoppedError("Design job cancelled or superseded."));
      controller.signal.throwIfAborted();
    }
  };
  try {
    const result = await runDesignPipeline(input, {
      signal: controller.signal,
      getRemainingTokens: async () => {
        const [usage] = await database`select coalesce(sum(input_tokens + output_tokens), 0) as tokens from public.design_ai_events
          where job_id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt}`;
        return resolveDesignTokenBudget(input.tokenBudget) - Number(usage?.tokens ?? 0);
      },
      run: async <T>(name: string, operation: () => Promise<T>) => await step.run(name, async () => {
        await checkActive();
        let checking = false;
        // Inngest can suspend a handler at step.run and return before its
        // finally executes. Allocate timers only inside the executed operation.
        const poll = setInterval(() => {
          if (checking) return;
          checking = true;
          void checkActive().catch(() => {
            if (!controller.signal.aborted) controller.abort(new Error("The worker could not verify the design job state. Retry will recover completed stages."));
          }).finally(() => { checking = false; });
        }, 2000);
        try { return await operation(); }
        finally { clearInterval(poll); }
      }) as T,
      checkpoint: async (stage, state) => {
        await checkActive();
        const [updated] = await database`update public.design_jobs set stage = ${stage},
          result = coalesce(${state?.result ? JSON.stringify(state.result) : null}::jsonb, result),
          preview = coalesce(${state?.preview ? JSON.stringify(state.preview) : null}::jsonb, preview), updated_at = now()
          where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt} and status = 'running' returning id`;
        if (!updated) { controller.abort(new DesignJobStoppedError("Design job cancelled or superseded.")); controller.signal.throwIfAborted(); }
      },
      onUsage: async (usage) => {
        await database`insert into public.design_ai_events
          (workspace_id, job_id, attempt, provider, model, input_tokens, output_tokens, latency_ms, fallbacks)
          values (${workspaceId}::uuid, ${jobId}::uuid, ${attempt}, ${usage.provider}, ${usage.model},
            ${usage.inputTokens}, ${usage.outputTokens}, ${Math.round(usage.latencyMs)}, ${usage.fallbacks})`;
      },
    });
    await step.run("complete-design-job", async () => {
      await database`update public.design_jobs set status = 'completed', stage = 'Ready to edit/export',
        result = ${JSON.stringify(result)}::jsonb, error = null, updated_at = now()
        where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt} and status = 'running'`;
    });
    return { variants: result.variants.length };
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof DesignJobStoppedError) return { cancelled: true };
    // Retain previews and successful variants; only status/error changes on failure.
    // Keep its admission slot while Inngest owns automatic recovery. Only the
    // onFailure hook marks it terminally failed after those retries are spent.
    await database`update public.design_jobs set error = ${error instanceof Error ? error.message.slice(0, 800) : "Design generation failed."}, updated_at = now()
      where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid and attempt = ${attempt} and status = 'running'`;
    throw error;
  }
});

export const dispatchQueuedStudioDesigns = inngest.createFunction({ id: "dispatch-queued-studio-designs", retries: 2 }, { cron: "*/1 * * * *" }, async ({ step }) => {
  const rows = await step.run("load-undelivered-design-jobs", async () => requireDatabase()`
    select id, workspace_id, attempt from public.design_jobs
    where status = 'queued' and (dispatched_at is null or dispatched_at < now() - interval '2 minutes')
    order by created_at limit 25
  `);
  for (const row of rows) await step.run(`dispatch-${row.id}-${row.attempt}`, async () => dispatchDesignJob(String(row.id), String(row.workspace_id), Number(row.attempt)));
  return { dispatched: rows.length };
});
