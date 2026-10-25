import { EventSchemas, Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ease-your-startup",
  schemas: new EventSchemas().fromRecord<{
    "design-studio/generation.requested": {
      data: { jobId: string; workspaceId: string; attempt: number };
    };
    "campaign/scan.requested": {
      data: {
        jobId: string;
        workspaceId: string;
        projectId: string;
        url: string;
      };
    };
    "campaign/generation.requested": {
      data: {
        jobId: string;
        workspaceId: string;
        campaignId: string;
      };
    };
    "campaign/channel-regeneration.requested": {
      data: {
        jobId: string;
        workspaceId: string;
        projectId: string;
        campaignId: string;
        channel: "x" | "linkedin" | "product_hunt" | "reddit" | "hacker_news" | "instagram" | "threads" | "facebook" | "email";
      };
    };
    "campaign/export.requested": {
      data: {
        jobId: string;
        workspaceId: string;
      };
    };
  }>(),
});
