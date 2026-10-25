import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", () => ({
  requestStructuredAiJson: vi.fn(),
}));

import { requestStructuredAiJson } from "@/lib/server/campaign-generator";
import { defaultChannelsForKind, suggestAnnouncement, type AnnouncementSuggestionInput } from "./announcement-suggestions";

const aiMock = vi.mocked(requestStructuredAiJson);
const metadata = {
  task: "copyModel" as const,
  provider: "openai" as const,
  model: "test-model",
  promptVersion: "test",
  latencyMs: 0,
  success: true,
};

function input(mode: AnnouncementSuggestionInput["mode"], updateDetails = ""): AnnouncementSuggestionInput {
  return {
    mode,
    kind: "launch",
    updateDetails,
    brand: {
      projectName: "Shipkit",
      tagline: "Launch posts from your website",
      audience: "Solo SaaS founders",
      cta: "Try it free",
      claims: ["Creates a post for each channel from one announcement."],
    },
  };
}

describe("suggestAnnouncement", () => {
  beforeEach(() => {
    aiMock.mockReset();
  });

  it("returns a draft and de-duplicated platforms in display order", async () => {
    aiMock.mockResolvedValue({
      value: { updateDetails: "  Shipkit is live.\n It writes a post for each channel.  ", channels: ["product_hunt", "x", "x"] },
      metadata,
    });

    await expect(suggestAnnouncement(input("draft"))).resolves.toEqual({
      updateDetails: "Shipkit is live. It writes a post for each channel.",
      channels: ["x", "product_hunt"],
      source: "ai",
    });
    expect(aiMock.mock.calls[0]?.[0].task).toBe("copyModel");
  });

  it("ignores any draft text when only platforms were requested", async () => {
    aiMock.mockResolvedValue({ value: { updateDetails: "Unwanted", channels: ["linkedin"] }, metadata });

    await expect(suggestAnnouncement(input("channels", "We launched Shipkit today."))).resolves.toEqual({
      updateDetails: null,
      channels: ["linkedin"],
      source: "ai",
    });
  });

  it("falls back to platforms for the announcement type when AI fails", async () => {
    aiMock.mockRejectedValue(new Error("provider down"));

    await expect(suggestAnnouncement(input("channels", "We launched Shipkit today."))).resolves.toEqual({
      updateDetails: null,
      channels: defaultChannelsForKind("launch"),
      source: "default",
    });
  });

  it("reports a failed draft instead of inventing one", async () => {
    aiMock.mockRejectedValue(new Error("provider down"));

    await expect(suggestAnnouncement(input("draft"))).rejects.toThrow("provider down");
  });
});
