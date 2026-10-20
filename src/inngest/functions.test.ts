import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  requireDatabase: vi.fn(),
  scanWebsite: vi.fn(),
  generateCampaign: vi.fn(),
  generateCampaignV2: vi.fn(),
  analyzeBrandIntelligence: vi.fn(),
  inngestSend: vi.fn(),
  captureCompositionPng: vi.fn(),
}));

vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/server/browserless", () => ({ captureCompositionPng: mocks.captureCompositionPng }));

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
  enrichScannedWebsite: vi.fn(),
}));

import {
  dispatchJobOutbox,
  generateCampaignAssets,
  inngestFunctions,
  parseStoredGenerationInput,
  scanProject,
} from "@/inngest/functions";
import { DEMO_ANGLES, DEMO_BRAND, DEMO_COMPOSITION } from "@/lib/demo-data";

type RegisteredFunction = {
  config: {
    timeouts: { finish: string };
    onFailure: (input: {
      event: { data: { event: { data: Record<string, string> } } };
      error?: Error;
    }) => Promise<void>;
  };
};

function recordingDatabase(responses: unknown[][] = []) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join("?"), values });
      return Promise.resolve(responses.shift() ?? []);
    },
    { transaction: (items: Promise<unknown[]>[]) => Promise.all(items) },
  );
  return { database, queries };
}

describe("stored campaign generator version", () => {
  const brief = {
    brand: DEMO_BRAND,
    kind: "launch" as const,
    goal: "Introduce the campaign workflow to solo founders",
    updateDetails: "A new campaign workflow is now available.",
    audience: "Solo SaaS founders",
    launchDate: "",
    cta: "Try the free scan",
    angle: DEMO_ANGLES[0],
    channels: ["x" as const],
  };

  it("treats legacy stored briefs as V1", () => {
    expect(parseStoredGenerationInput(brief)).toEqual({
      generatorVersion: "v1",
      brief,
    });
  });

  it("uses the pinned V2 version from a queued campaign", () => {
    expect(
      parseStoredGenerationInput({ generatorVersion: "v2", brief }),
    ).toEqual({ generatorVersion: "v2", brief });
  });

  it.each(["v1", "v2"])("requests a provider canvas before completing a durable %s campaign", async (version) => {
    vi.clearAllMocks();
    const { database } = recordingDatabase([
      [{ generation_input: version === "v2" ? { generatorVersion: "v2", brief } : brief }],
      [{ id: "job" }],
    ]);
    mocks.requireDatabase.mockReturnValue(database);
    const generate = version === "v2" ? mocks.generateCampaignV2 : mocks.generateCampaign;
    generate.mockResolvedValue({ outputs: [] });
    const worker = generateCampaignAssets as unknown as {
      handler: (input: { event: unknown; step: { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>;
    };
    await expect(worker.handler({
      event: { data: { jobId: "job", workspaceId: "workspace", campaignId: "campaign" } },
      step: { run: async (name, callback) => {
        if (name === "persist-success-and-consume-usage") throw new Error("persistence reached");
        return callback();
      } },
    })).rejects.toThrow("persistence reached");
    expect(generate).toHaveBeenCalledWith(brief, expect.objectContaining({ includeCreativeDesign: true }));
  });
});

type DispatchFunction = {
  handler: (input: { step: { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>;
};

describe("queued export image validation", () => {
  it.each([false, true])("validates only rendered images (active external image: %s)", async (activeImage) => {
    const { database } = recordingDatabase();
    mocks.requireDatabase.mockReturnValue(database);
    mocks.captureCompositionPng.mockRejectedValueOnce(new Error("render reached"));
    const request = {
      format: "png", projectId: "project", campaignId: "campaign", revision: 1,
      requestedBy: "user", watermarked: false,
      state: {
        projectId: "project", campaignId: "campaign", brand: DEMO_BRAND,
        scan: {}, generation: {}, outputs: [{}],
        composition: {
          ...DEMO_COMPOSITION, designSource: "ai",
          screenshotUrl: "https://example.com/unused.png",
          elements: activeImage ? [{ kind: "image", src: "https://example.com/active.png" }] : [],
        },
      },
    };
    const worker = inngestFunctions.find((entry) =>
      (entry as unknown as { config: { id: string } }).config.id === "export-campaign-assets",
    ) as unknown as {
      handler: (input: { event: unknown; step: unknown }) => Promise<unknown>;
    };
    await expect(worker.handler({
      event: { data: { jobId: "job", workspaceId: "workspace" } },
      step: { run: (name: string, callback: () => Promise<unknown>) =>
        name === "load-saved-export-revision" ? Promise.resolve(request) : callback() },
    })).rejects.toThrow(activeImage
      ? "Replace embedded or external screenshots"
      : "render reached");
  });
});

describe("durable job failure cleanup", () => {
  it("caps campaign generation at 15 minutes", () => {
    expect((generateCampaignAssets as unknown as RegisteredFunction).config.timeouts.finish)
      .toBe("15m");
  });

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
      "Campaign generation failed: provider unavailable",
    );
  });
});

describe("transactional job outbox dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails stale campaign jobs and releases their reserved usage", async () => {
    const { database, queries } = recordingDatabase([[], [{ id: "stale-job" }], []]);
    mocks.requireDatabase.mockReturnValue(database);
    const step = { run: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()) };
    const functionConfig = dispatchJobOutbox as unknown as DispatchFunction;

    await functionConfig.handler({ step });

    expect(queries[1].sql).toContain("status in ('queued', 'generating')");
    expect(queries[1].sql).toContain("updated_at < pg_catalog.now()");
    expect(queries[2].sql).toContain("release_campaign_usage_reservation");
    expect(queries[2].sql).toContain("updated_at = pg_catalog.now()");
  });

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
