import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  requireDatabase: vi.fn(),
  scanWebsite: vi.fn(),
  generateCampaign: vi.fn(),
  generateCampaignV2: vi.fn(),
  analyzeBrandIntelligence: vi.fn(),
  inngestSend: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: mocks.inngestSend,
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

vi.mock("@/lib/server/object-storage", () => ({
  createPrivateObjectReadUrl: vi.fn(),
  deletePrivateObject: vi.fn(),
  putPrivateObject: vi.fn(),
}));

vi.mock("@/lib/server/browserless", () => ({ captureCompositionPng: vi.fn() }));

vi.mock("@/lib/server/campaign-generator", () => ({
  generateCampaign: mocks.generateCampaign,
  publicProviderError: (error: unknown) => error instanceof Error
    ? error.message
    : "Unknown provider error",
}));
vi.mock("@/lib/server/generation-v2", () => ({
  generateCampaignV2: mocks.generateCampaignV2,
}));
vi.mock("@/lib/server/brand-intelligence", () => ({
  analyzeBrandIntelligence: mocks.analyzeBrandIntelligence,
}));

import { dispatchJobOutbox, generateCampaignAssets, scanProject } from "@/inngest/functions";

type RegisteredFunction = {
  config: {
    onFailure: (input: {
      event: { data: { event: { data: Record<string, string> } } };
      error?: Error;
    }) => Promise<void>;
  };
};

function recordingDatabase(responses: unknown[][] = []) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve(responses.shift() ?? []);
  };
  return { database, queries };
}

type DispatchFunction = {
  handler: (input: { step: { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>;
};

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

  it("stores the sanitized error that caused campaign retries to fail", async () => {
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
      error: new Error("provider unavailable"),
    });

    expect(queries[1].values).toContain(
      "Campaign generation failed after retries: provider unavailable",
    );
  });
});

describe("transactional job outbox dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a stable event ID and marks the outbox entry delivered", async () => {
    const entry = {
      event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      event_name: "campaign/scan.requested",
      event_payload: {
        jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        projectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        url: "https://example.com",
      },
    };
    const { database, queries } = recordingDatabase([[entry]]);
    mocks.requireDatabase.mockReturnValue(database);
    const step = { run: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()) };
    const functionConfig = dispatchJobOutbox as unknown as DispatchFunction;

    await functionConfig.handler({ step }).catch(() => undefined);
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      id: entry.event_id,
      name: entry.event_name,
      data: entry.event_payload,
    });
    expect(queries.some((query) => query.sql.includes("mark_job_outbox_delivered"))).toBe(true);
  });

  it("schedules another attempt when Inngest delivery fails", async () => {
    const eventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const entry = {
      event_id: eventId,
      event_name: "campaign/generation.requested",
      event_payload: {
        jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        campaignId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    };
    const { database, queries } = recordingDatabase([[entry]]);
    mocks.requireDatabase.mockReturnValue(database);
    mocks.inngestSend.mockRejectedValueOnce(new Error("network unavailable"));
    const step = { run: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()) };
    const functionConfig = dispatchJobOutbox as unknown as DispatchFunction;

    await functionConfig.handler({ step }).catch(() => undefined);
    expect(queries.some((query) => query.sql.includes("retry_job_outbox"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("mark_job_outbox_delivered"))).toBe(false);
  });
});
