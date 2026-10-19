import { inngest } from "@/inngest/client";
import { NonRetriableError } from "inngest";
import { createHash, randomBytes } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod";
import { channelSchema, generateCampaignSchema, studioStateSchema } from "@/lib/contracts";
import {
  generateCampaign,
  publicProviderError,
} from "@/lib/server/campaign-generator";
import { generateCampaignV2 } from "@/lib/server/generation-v2";
import { createDatabase, requireDatabase } from "@/lib/server/database";
import { scanWebsite } from "@/lib/server/scanner";
import { enrichScannedWebsite } from "@/lib/server/brand-intelligence";
import {
  createPrivateObjectReadUrl,
  deletePrivateObject,
  putPrivateObject,
} from "@/lib/server/object-storage";
import { captureCompositionPng } from "@/lib/server/browserless";
import { buildLaunchKitFiles } from "@/lib/launch-kit";
import { compositionImageUrls } from "@/lib/studio-export";
import { absoluteUrl } from "@/lib/utils";
import {
  serializeGenerateJobResult,
  serializeScanJobResult,
} from "@/lib/job-results";
import { failStaleGenerationJobs } from "@/lib/server/stale-generation-jobs";

function database() {
  return requireDatabase();
}

export function parseStoredGenerationInput(value: unknown) {
  const stored = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (
    typeof stored === "object" &&
    stored !== null &&
    "generatorVersion" in stored &&
    stored.generatorVersion === "v2"
  ) {
    const record = stored as Record<string, unknown>;
    return {
      generatorVersion: "v2" as const,
      brief: generateCampaignSchema.parse(record.brief),
    };
  }
  return {
    generatorVersion: "v1" as const,
    brief: generateCampaignSchema.parse(stored),
  };
}

export const scanProject = inngest.createFunction(
  {
    id: "scan-project",
    retries: 3,
    onFailure: async ({ event }) => {
      const database = createDatabase();
      if (!database) return;
      await database`
        update public.jobs
        set
          status = 'failed',
          error_message = 'The scan failed after retries.',
          updated_at = now()
        where id = ${event.data.event.data.jobId}
          and workspace_id = ${event.data.event.data.workspaceId}
          and status <> 'completed'
      `;
    },
  },
  { event: "campaign/scan.requested" },
  async ({ event, step }) => {
    const { jobId, workspaceId, projectId, url } = event.data;
    await step.run("mark-scanning", async () => {
      await database()`
        update public.jobs
        set status = 'scanning', progress = 10, updated_at = now()
        where id = ${jobId} and workspace_id = ${workspaceId}
          and status in ('queued', 'scanning')
      `;
    });

    const result = await step.run("scan-public-pages", async () => {
      return enrichScannedWebsite(await scanWebsite(url));
    });

    await step.run("persist-brand-dna", async () => {
      const database = requireDatabase();
      const [saved] = await database`
        select public.persist_project_scan(
          ${workspaceId}::uuid,
          ${projectId}::uuid,
          ${jobId}::uuid,
          ${JSON.stringify(result.profile)}::jsonb,
          ${result.mode},
          ${JSON.stringify(result.pages)}::jsonb,
          ${JSON.stringify(serializeScanJobResult(result))}::jsonb
        ) as persisted
      `;
      return saved?.persisted === true;
    });

    return { projectId, pageCount: result.pages.length };
  },
);

export const generateCampaignAssets = inngest.createFunction(
  {
    id: "generate-campaign-assets",
    retries: 0,
    timeouts: { finish: "15m" },
    onFailure: async ({ event, error }) => {
      const database = createDatabase();
      if (!database) return;
      const reason = error instanceof Error && error.message.trim()
        ? publicProviderError(error)
        : "";
      const errorMessage = reason
        ? `Campaign generation failed: ${reason}`
        : "Campaign generation failed.";
      await database`
        select public.release_campaign_usage_reservation(
          ${event.data.event.data.workspaceId}::uuid,
          ${event.data.event.data.campaignId}::uuid
        )
      `;
      await database`
        update public.jobs
        set
          status = 'failed',
          error_message = ${errorMessage},
          updated_at = now()
        where id = ${event.data.event.data.jobId}
          and workspace_id = ${event.data.event.data.workspaceId}
          and status in ('queued', 'generating')
      `;
    },
  },
  { event: "campaign/generation.requested" },
  async ({ event, step }) => {
    const { jobId, workspaceId, campaignId } = event.data;
    const campaign = await step.run("load-approved-brief", async () => {
      const [data] = await database()`
        select generation_input
        from public.campaigns
        where id = ${campaignId} and workspace_id = ${workspaceId}
        limit 1
      `;
      if (!data) throw new Error("Campaign not found.");
      return parseStoredGenerationInput(data.generation_input);
    });

    await step.run("mark-generating", async () => {
      const [activeJob] = await database()`
        update public.jobs
        set status = 'generating', progress = 35, updated_at = now()
        where id = ${jobId} and workspace_id = ${workspaceId}
          and status in ('queued', 'generating')
        returning id
      `;
      if (!activeJob) {
        throw new NonRetriableError("Campaign generation is no longer active.");
      }
    });

    const generated = await step.run("generate-source-backed-copy", async () => {
      const onDesignStart = async () => {
        await database()`
          update public.jobs
          set progress = 75, updated_at = now()
          where id = ${jobId} and workspace_id = ${workspaceId}
            and status = 'generating'
        `;
      };
      try {
        return await (campaign.generatorVersion === "v2"
          ? generateCampaignV2(campaign.brief, {
              onDesignStart,
              includeCreativeDesign: false,
            })
          : generateCampaign(campaign.brief, {
              onDesignStart,
              includeCreativeDesign: false,
            }));
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "OpenRouterFreeModelQuotaError"
        ) {
          throw new NonRetriableError(error.message);
        }
        throw error;
      }
    });

    await step.run("persist-success-and-consume-usage", async () => {
      const database = requireDatabase();
      const serializedResult = serializeGenerateJobResult(generated);
      const serializedOutputs = JSON.stringify(generated.outputs);
      const [savedRows] = await database.transaction([
        database`
          with active_job as materialized (
            update public.jobs
            set status = 'completed',
              progress = 100,
              result = ${serializedResult}::jsonb,
              updated_at = pg_catalog.now()
            where id = ${jobId} and workspace_id = ${workspaceId}
              and status = 'generating'
            returning id
          ),
          saved_outputs as (
            insert into public.channel_outputs (
              workspace_id,
              campaign_id,
              channel,
              output
            )
            select
              ${workspaceId},
              ${campaignId},
              generated_output.output ->> 'channel',
              generated_output.output
            from active_job
            cross join pg_catalog.jsonb_array_elements(${serializedOutputs}::jsonb)
              as generated_output(output)
            on conflict (campaign_id, channel) do update set
              workspace_id = excluded.workspace_id,
              output = excluded.output,
              updated_at = pg_catalog.now()
            returning id
          )
          select
            (select pg_catalog.count(*) from active_job) as active_job_count,
            (select pg_catalog.count(*) from saved_outputs) as output_count
        `,
        database`
          select public.consume_campaign_usage(
            ${workspaceId}::uuid,
            ${campaignId}::uuid
          )
          from public.jobs
          where id = ${jobId} and workspace_id = ${workspaceId}
            and status = 'completed'
            and result = ${serializedResult}::jsonb
            and updated_at = pg_catalog.now()
        `,
      ]);
      const saved = savedRows?.[0];
      if (Number(saved?.active_job_count ?? 0) !== 1) {
        throw new NonRetriableError("Campaign generation is no longer active.");
      }
    });

    return { campaignId, channelCount: generated.outputs.length };
  },
);

export const regenerateCampaignChannel = inngest.createFunction(
  {
    id: "regenerate-campaign-channel",
    retries: 2,
    onFailure: async ({ event }) => {
      const database = createDatabase();
      if (!database) return;
      const { jobId, workspaceId, campaignId, channel } = event.data.event.data;
      await database`
        with failed_job as (
          update public.jobs
          set status = 'failed',
            error_message = 'Channel regeneration failed after retries.',
            updated_at = pg_catalog.now()
          where id = ${jobId} and workspace_id = ${workspaceId}
            and campaign_id = ${campaignId} and regeneration_channel = ${channel}
            and status in ('queued', 'generating')
          returning workspace_id, campaign_id, regeneration_channel
        )
        update public.channel_outputs o
        set regeneration_reserved = greatest(o.regeneration_reserved - 1, 0),
          updated_at = pg_catalog.now()
        from failed_job j
        where o.workspace_id = j.workspace_id and o.campaign_id = j.campaign_id
          and o.channel = j.regeneration_channel
      `;
    },
  },
  { event: "campaign/channel-regeneration.requested" },
  async ({ event, step }) => {
    const { jobId, workspaceId, campaignId, channel } = event.data;
    const campaign = await step.run("load-campaign-brief", async () => {
      const [campaign] = await database()`
        select generation_input
        from public.campaigns
        where id = ${campaignId} and workspace_id = ${workspaceId}
          and status = 'completed'
        limit 1
      `;
      if (!campaign) throw new Error("Campaign not found or is not ready.");
      return parseStoredGenerationInput(campaign.generation_input);
    });

    await step.run("mark-regenerating", async () => {
      await database()`
        update public.jobs
        set status = 'generating', progress = 35, updated_at = now()
        where id = ${jobId} and workspace_id = ${workspaceId}
          and status in ('queued', 'generating')
      `;
    });

    const input = { ...campaign.brief, channels: [channel] };
    const generated = await step.run("generate-replacement-channel-copy", () =>
      campaign.generatorVersion === "v2"
        ? generateCampaignV2(input, { includeCreativeDesign: false })
        : generateCampaign(input, { includeCreativeDesign: false }),
    );
    const replacement = generated.outputs.find((output) => output.channel === channel);
    if (!replacement) throw new Error("The provider returned no replacement for this channel.");

    await step.run("save-regeneration-and-release-reservation", async () => {
      const database = requireDatabase();
      const [updated] = await database`
        with active_job as materialized (
          select id from public.jobs
          where id = ${jobId} and workspace_id = ${workspaceId}
            and campaign_id = ${campaignId} and regeneration_channel = ${channel}
            and status in ('queued', 'generating')
          for update
        ), updated_output as (
          update public.channel_outputs
          set output = ${JSON.stringify(replacement)}::jsonb,
            regeneration_count = regeneration_count + 1,
            regeneration_reserved = greatest(regeneration_reserved - 1, 0),
            updated_at = pg_catalog.now()
          where workspace_id = ${workspaceId} and campaign_id = ${campaignId}
            and channel = ${channel} and regeneration_reserved > 0
            and exists (select 1 from active_job)
          returning id
        ), completed_job as (
          update public.jobs
          set status = 'completed', progress = 100,
            result = ${serializeGenerateJobResult(generated)}::jsonb,
            updated_at = pg_catalog.now()
          where id in (select id from active_job)
            and exists (select 1 from updated_output)
          returning id
        )
        select id from completed_job
        union all
        select id from public.jobs
        where id = ${jobId} and workspace_id = ${workspaceId}
          and campaign_id = ${campaignId} and regeneration_channel = ${channel}
          and status = 'completed'
        limit 1
      `;
      if (!updated) throw new NonRetriableError("The regeneration reservation is no longer available.");
    });
    return { campaignId, channel };
  },
);

function storedAssetId(value: string) {
  try {
    const path = new URL(value, "https://easeyourstartup.invalid").pathname;
    const match = path.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function withStoredAssetUrls(
  composition: ReturnType<typeof studioStateSchema.parse>["composition"],
  urls: Map<string, string>,
) {
  const replace = (value: string) => {
    const id = storedAssetId(value);
    return id ? urls.get(id) ?? value : value;
  };
  return {
    ...composition,
    screenshotUrl: replace(composition.screenshotUrl),
    mockups: {
      desktop: replace(composition.mockups.desktop),
      tablet: replace(composition.mockups.tablet),
      phone: replace(composition.mockups.phone),
    },
    elements: composition.elements?.map((element) =>
      element.kind === "image" && element.src ? { ...element, src: replace(element.src) } : element,
    ),
  };
}

const exportCampaignAssets = inngest.createFunction(
  {
    id: "export-campaign-assets",
    retries: 2,
    onFailure: async ({ event }) => {
      const database = createDatabase();
      if (!database) return;
      const { jobId, workspaceId } = event.data.event.data;
      await database`
        update public.jobs
        set status = 'failed',
          error_message = 'The export failed after retries. Your saved campaign is unchanged.',
          updated_at = pg_catalog.now()
        where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid
          and kind = 'export' and status <> 'completed'
      `;
    },
  },
  { event: "campaign/export.requested" },
  async ({ event, step }) => {
    const { jobId, workspaceId } = event.data;
    const request = await step.run("load-saved-export-revision", async () => {
      const [row] = await database()`
        select requested_by, project_id, campaign_id, format, revision,
          snapshot_state, file_name
        from public.export_requests
        where job_id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid
        limit 1
      `;
      if (!row) throw new Error("The saved export request is no longer available.");
      const raw = typeof row.snapshot_state === "string"
        ? JSON.parse(row.snapshot_state) as unknown
        : row.snapshot_state;
      return {
        requestedBy: String(row.requested_by),
        projectId: String(row.project_id),
        campaignId: String(row.campaign_id),
        format: row.format === "png" ? "png" as const : row.format === "zip" ? "zip" as const : null,
        revision: Number(row.revision),
        fileName: String(row.file_name),
        watermarked: !(raw && typeof raw === "object" && "watermarked" in raw && raw.watermarked === false),
        state: studioStateSchema.parse(raw),
      };
    });
    if (!request.format) throw new Error("The requested export format is not supported.");

    await step.run("mark-export-rendering", async () => {
      await database()`
        update public.jobs
        set status = 'rendering', progress = 15, updated_at = pg_catalog.now()
        where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid
          and kind = 'export' and status in ('queued', 'rendering')
      `;
    });

    const saved = await step.run("render-and-store-export", async () => {
      const state = request.state;
      if (
        state.projectId !== request.projectId ||
        state.campaignId !== request.campaignId ||
        !state.brand || !state.scan || !state.generation || state.outputs.length === 0
      ) {
        throw new Error("The saved campaign is incomplete.");
      }

      const ids = compositionImageUrls(state.composition).map(storedAssetId);
      if (ids.some((id) => id === null)) {
        throw new Error("Replace embedded or external screenshots with a saved project image before exporting.");
      }
      const distinctIds = Array.from(new Set(ids as string[]));
      const assets = await database()`
        select id::text as id, object_key
        from public.stored_assets
        where id = any(${distinctIds}::uuid[])
          and workspace_id = ${workspaceId}::uuid
          and owner_user_id = ${request.requestedBy}
          and project_id = ${request.projectId}::uuid
          and (campaign_id is null or campaign_id = ${request.campaignId}::uuid)
      `;
      if (assets.length !== distinctIds.length) throw new Error("One or more saved campaign images are unavailable.");

      const privateUrls = new Map<string, string>();
      for (const asset of assets) {
        if (typeof asset.id === "string" && typeof asset.object_key === "string") {
          privateUrls.set(asset.id.toLowerCase(), createPrivateObjectReadUrl(asset.object_key, 900));
        }
      }
      if (privateUrls.size !== distinctIds.length) throw new Error("One or more saved campaign images are unavailable.");
      const composition = withStoredAssetUrls(state.composition, privateUrls);
      const renderToken = randomBytes(32).toString("base64url");
      const renderTokenHash = createHash("sha256").update(renderToken).digest("hex");
      await database()`
        insert into public.render_requests (
          token_hash, workspace_id, user_id, project_id, campaign_id,
          revision, composition, expires_at
        ) values (
          ${renderTokenHash}, ${workspaceId}::uuid, ${request.requestedBy},
          ${request.projectId}::uuid, ${request.campaignId}::uuid, ${request.revision},
          ${JSON.stringify({ ...composition, watermarked: request.watermarked })}::jsonb, pg_catalog.now() + interval '20 minutes'
        )
      `;

      const png = await captureCompositionPng(
        absoluteUrl(`/render/${renderToken}`),
        state.composition.output,
      );
      let output: Uint8Array = png;
      const mimeType = request.format === "png" ? "image/png" : "application/zip";
      if (request.format === "zip") {
        const zip = new JSZip();
        for (const file of buildLaunchKitFiles({
          brand: state.brand,
          draft: state.draft,
          outputs: state.outputs,
          composition: state.composition,
          scan: state.scan,
        })) {
          zip.file(file.path, file.contents);
        }
        zip.file("creative-preview.png", png);
        output = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      }
      if (output.byteLength > 50_000_000) throw new Error("The export is too large to store.");

      const objectKey = `exports/${workspaceId}/${jobId}.${request.format}`;
      const stored = await putPrivateObject(objectKey, output, mimeType);
      const db = requireDatabase();
      await db.transaction([
        db`
          update public.export_requests
          set object_key = ${objectKey}, mime_type = ${mimeType}, byte_size = ${stored.byteSize},
            download_expires_at = pg_catalog.now() + interval '30 days',
            updated_at = pg_catalog.now()
          where job_id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid
        `,
        db`
          update public.jobs
          set status = 'completed', progress = 100,
            result = ${JSON.stringify({ format: request.format, fileName: request.fileName, revision: request.revision })}::jsonb,
            updated_at = pg_catalog.now()
          where id = ${jobId}::uuid and workspace_id = ${workspaceId}::uuid
            and kind = 'export' and status <> 'failed'
        `,
        db`
          insert into public.audit_events (workspace_id, actor_user_id, event_type, payload)
          values (
            ${workspaceId}::uuid, ${request.requestedBy}, ${`server.export_${request.format}_completed`},
            ${JSON.stringify({ project_id: request.projectId, campaign_id: request.campaignId, revision: request.revision, byte_size: stored.byteSize })}::jsonb
          )
        `,
      ]);
      return { format: request.format, byteSize: stored.byteSize, fileName: request.fileName };
    });
    return { jobId, ...saved };
  },
);

export const cleanupDeletedPrivateObjects = inngest.createFunction(
  { id: "cleanup-deleted-private-objects", retries: 1 },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    await step.run("queue-expired-export-files", async () => database()`
      with expired as materialized (
        select job_id, object_key from public.export_requests
        where object_key is not null and download_expires_at <= pg_catalog.now()
        for update
      ), cleared as (
        update public.export_requests r
        set object_key = null, mime_type = null, byte_size = null,
          download_expires_at = null, updated_at = pg_catalog.now()
        from expired
        where r.job_id = expired.job_id
        returning expired.object_key
      )
      insert into public.object_cleanup_queue (object_key)
      select object_key from cleared
      on conflict (object_key) do nothing
    `);
    await step.run("prune-expired-render-tokens-and-deletion-locks", async () => {
      await database()`delete from public.render_requests where expires_at <= pg_catalog.now()`;
      await database()`delete from public.account_deletion_requests where expires_at <= pg_catalog.now()`;
    });

    const keys = await step.run("load-pending-object-cleanup", async () => {
      const rows = await database()`
        select object_key
        from public.object_cleanup_queue
        where next_attempt_at <= pg_catalog.now()
        order by created_at
        limit 25
      `;
      return rows.flatMap((row) =>
        typeof row.object_key === "string" ? [row.object_key] : [],
      );
    });

    let removed = 0;
    for (const objectKey of keys) {
      const key = createHash("sha256").update(objectKey).digest("hex").slice(0, 24);
      const success = await step.run(`delete-private-object-${key}`, async () => {
        try {
          await deletePrivateObject(objectKey);
          await database()`
            delete from public.object_cleanup_queue
            where object_key = ${objectKey}
          `;
          return true;
        } catch {
          await database()`
            update public.object_cleanup_queue
            set attempts = attempts + 1,
              next_attempt_at = pg_catalog.now()
                + (least(360, 5 * power(2, attempts)) * interval '1 minute'),
              last_error = 'Private object deletion failed; retry scheduled.',
              updated_at = pg_catalog.now()
            where object_key = ${objectKey}
          `;
          console.error("[object-cleanup] Private object deletion failed; retry scheduled.");
          return false;
        }
      });
      if (success) removed += 1;
    }
    return { attempted: keys.length, removed };
  },
);

const outboxPayloadSchemas = {
  "campaign/scan.requested": z.object({
    jobId: z.uuid(), workspaceId: z.uuid(), projectId: z.uuid(), url: z.string().url(),
  }).strict(),
  "campaign/generation.requested": z.object({
    jobId: z.uuid(), workspaceId: z.uuid(), campaignId: z.uuid(),
  }).strict(),
  "campaign/channel-regeneration.requested": z.object({
    jobId: z.uuid(), workspaceId: z.uuid(), projectId: z.uuid(), campaignId: z.uuid(),
    channel: channelSchema,
  }).strict(),
  "campaign/export.requested": z.object({
    jobId: z.uuid(), workspaceId: z.uuid(),
  }).strict(),
} as const;

type OutboxEventName = keyof typeof outboxPayloadSchemas;

async function deliverOutboxEvent(entry: {
  event_id: unknown;
  event_name: unknown;
  event_payload: unknown;
}) {
  if (
    typeof entry.event_id !== "string" ||
    typeof entry.event_name !== "string" ||
    !Object.prototype.hasOwnProperty.call(outboxPayloadSchemas, entry.event_name)
  ) {
    throw new Error("Invalid job dispatch record.");
  }
  const name = entry.event_name as OutboxEventName;
  const rawPayload = typeof entry.event_payload === "string"
    ? JSON.parse(entry.event_payload) as unknown
    : entry.event_payload;

  switch (name) {
    case "campaign/scan.requested": {
      const data = outboxPayloadSchemas["campaign/scan.requested"].parse(rawPayload);
      await inngest.send({ id: entry.event_id, name, data });
      break;
    }
    case "campaign/generation.requested": {
      const data = outboxPayloadSchemas["campaign/generation.requested"].parse(rawPayload);
      await inngest.send({ id: entry.event_id, name, data });
      break;
    }
    case "campaign/channel-regeneration.requested": {
      const data = outboxPayloadSchemas["campaign/channel-regeneration.requested"].parse(rawPayload);
      await inngest.send({ id: entry.event_id, name, data });
      break;
    }
    case "campaign/export.requested": {
      const data = outboxPayloadSchemas["campaign/export.requested"].parse(rawPayload);
      await inngest.send({ id: entry.event_id, name, data });
      break;
    }
  }
}

export const dispatchJobOutbox = inngest.createFunction(
  { id: "dispatch-job-outbox", retries: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    const entries = await step.run("claim-pending-job-outbox", async () => {
      const rows = await database()`
        select event_id, event_name, event_payload, attempts
        from public.claim_job_outbox(20)
      `;
      return rows as Array<{ event_id: unknown; event_name: unknown; event_payload: unknown }>;
    });
    let delivered = 0;
    let retried = 0;
    for (const entry of entries) {
      if (typeof entry.event_id !== "string") continue;
      const outcome = await step.run(`dispatch-job-outbox-${entry.event_id}`, async () => {
        try {
          await deliverOutboxEvent(entry);
          await database()`
            select public.mark_job_outbox_delivered(${entry.event_id}::uuid)
          `;
          return "delivered" as const;
        } catch {
          await database()`
            select public.retry_job_outbox(
              ${entry.event_id}::uuid,
              'Event delivery failed; retry scheduled.'
            )
          `;
          console.error("[job-outbox] Event delivery failed; retry scheduled.");
          return "retried" as const;
        }
      });
      if (outcome === "delivered") delivered += 1;
      else retried += 1;
    }
    const recovered = await step.run("fail-stale-campaign-generations", () =>
      failStaleGenerationJobs(requireDatabase()),
    );
    await step.run("prune-old-job-outbox-receipts", async () =>
      database()`
        delete from public.job_outbox
        where delivered_at < pg_catalog.now() - interval '30 days'
      `,
    );
    return { attempted: entries.length, delivered, retried, recovered };
  },
);

export const inngestFunctions = [
  scanProject,
  generateCampaignAssets,
  regenerateCampaignChannel,
  exportCampaignAssets,
  cleanupDeletedPrivateObjects,
  dispatchJobOutbox,
];
