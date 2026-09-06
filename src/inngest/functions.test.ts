import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  requireDatabase: vi.fn(),
  scanWebsite: vi.fn(),
  generateCampaign: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: (config: unknown, event: unknown, handler: unknown) => ({
      config,
      event,
      handler,
    }),
  },
}));

vi.mock("@/lib/server/database", () => ({
  createDatabase: mocks.createDatabase,
  requireDatabase: mocks.requireDatabase,
}));

vi.mock("@/lib/server/scanner", () => ({
  scanWebsite: mocks.scanWebsite,
}));

vi.mock("@/lib/server/campaign-generator", () => ({
  generateCampaign: mocks.generateCampaign,
}));

import { generateCampaignAssets, scanProject } from "@/inngest/functions";

type RegisteredFunction = {
  config: {
    onFailure: (input: { event: { data: { event: { data: Record<string, string> } } } }) => Promise<void>;
  };
};

function recordingDatabase() {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve([]);
  };
  return { database, queries };
}

describe("durable job failure cleanup", () => {
  it("does not try to release a campaign reservation when a scan fails", async () => {
    const { database, queries } = recordingDatabase();
    mocks.createDatabase.mockReturnValue(database);

    await (scanProject as unknown as RegisteredFunction).config.onFailure({
      event: { data: { event: { data: { jobId: "scan-job", workspaceId: "workspace" } } } },
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).not.toContain("release_campaign_usage_reservation");
  });

  it("releases the reserved campaign slot after generation retries are exhausted", async () => {
    const { database, queries } = recordingDatabase();
    mocks.createDatabase.mockReturnValue(database);

    await (generateCampaignAssets as unknown as RegisteredFunction).config.onFailure({
      event: {
        data: {
          event: {
            data: {
              jobId: "generation-job",
              workspaceId: "workspace",
              campaignId: "campaign",
            },
          },
        },
      },
    });

    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({
      sql: expect.stringContaining("release_campaign_usage_reservation"),
      values: ["workspace", "campaign"],
    });
  });
});
