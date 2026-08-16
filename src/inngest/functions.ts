import { inngest } from "@/inngest/client";
import { generateCampaignSchema } from "@/lib/contracts";
import { generateCampaign } from "@/lib/server/campaign-generator";
import { createDatabase, requireDatabase } from "@/lib/server/database";
import { scanWebsite } from "@/lib/server/scanner";

function database() {
  return requireDatabase();
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
      `;
    });

    const result = await step.run("scan-public-pages", () => scanWebsite(url));

    await step.run("persist-brand-dna", async () => {
      const database = requireDatabase();
      const [profile] = await database`
        insert into public.brand_profiles (
          workspace_id,
          project_id,
          version,
          profile,
          scan_mode
        )
        values (
          ${workspaceId},
          ${projectId},
          1,
          ${JSON.stringify(result.profile)}::jsonb,
          ${result.mode}
        )
        on conflict (project_id) do update set
          workspace_id = excluded.workspace_id,
          version = excluded.version,
          profile = excluded.profile,
          scan_mode = excluded.scan_mode,
          updated_at = now()
        returning id
      `;
      if (!profile) throw new Error("Brand profile missing.");

      await database`
        delete from public.source_pages
        where project_id = ${projectId}
          and workspace_id = ${workspaceId}
      `;

      const pageQueries = result.pages.map((page) => database`
        insert into public.source_pages (
          workspace_id,
          project_id,
          brand_profile_id,
          url,
          title,
          excerpt
        )
        values (
          ${workspaceId},
          ${projectId},
          ${profile.id},
          ${page.url},
          ${page.title},
          ${page.excerpt}
        )
      `);
      if (pageQueries.length > 0) await database.transaction(pageQueries);

      await database`
        update public.jobs
        set
          status = 'completed',
          progress = 100,
          result = ${JSON.stringify({ warnings: result.warnings })}::jsonb,
          updated_at = now()
        where id = ${jobId} and workspace_id = ${workspaceId}
      `;
    });

    return { projectId, pageCount: result.pages.length };
  },
);

export const generateCampaignAssets = inngest.createFunction(
  {
    id: "generate-campaign-assets",
    retries: 2,
    onFailure: async ({ event }) => {
      const database = createDatabase();
      if (!database) return;
      await database`
        update public.jobs
        set
          status = 'failed',
          error_message = 'Campaign generation failed after retries.',
          updated_at = now()
        where id = ${event.data.event.data.jobId}
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
      const input =
        typeof data.generation_input === "string"
          ? JSON.parse(data.generation_input)
          : data.generation_input;
      return generateCampaignSchema.parse(input);
    });

    await step.run("mark-generating", async () => {
      await database()`
        update public.jobs
        set status = 'generating', progress = 35, updated_at = now()
        where id = ${jobId} and workspace_id = ${workspaceId}
      `;
    });

    const generated = await step.run("generate-source-backed-copy", () =>
      generateCampaign(campaign),
    );

    await step.run("persist-success-and-consume-usage", async () => {
      const database = requireDatabase();
      const outputQueries = generated.outputs.map((output) => database`
        insert into public.channel_outputs (
          workspace_id,
          campaign_id,
          channel,
          output
        )
        values (
          ${workspaceId},
          ${campaignId},
          ${output.channel},
          ${JSON.stringify(output)}::jsonb
        )
        on conflict (campaign_id, channel) do update set
          workspace_id = excluded.workspace_id,
          output = excluded.output,
          updated_at = now()
      `);
      const followUpQueries = [
        database`
          update public.campaigns
          set status = 'completed', completed_at = now(), updated_at = now()
          where id = ${campaignId} and workspace_id = ${workspaceId}
        `,
        database`
          select public.consume_campaign_usage(${workspaceId}, ${campaignId})
        `,
        database`
          update public.jobs
          set
            status = 'completed',
            progress = 100,
            result = ${JSON.stringify({
              mode: generated.mode,
              channelCount: generated.outputs.length,
            })}::jsonb,
            updated_at = now()
          where id = ${jobId} and workspace_id = ${workspaceId}
        `,
      ];
      await database.transaction([...outputQueries, ...followUpQueries]);
    });

    return { campaignId, channelCount: generated.outputs.length };
  },
);

export const inngestFunctions = [scanProject, generateCampaignAssets];
