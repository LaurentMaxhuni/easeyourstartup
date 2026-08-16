import { EventSchemas, Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ease-your-startup",
  schemas: new EventSchemas().fromRecord<{
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
  }>(),
});
