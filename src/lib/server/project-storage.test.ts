import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/workspace-access", () => ({ ensureWorkspaceForUser: vi.fn() }));
import { groupProjectsByUrl, projectBrandSummary, type ProjectSummary } from "./project-storage";

function project(id: string, publicUrl: string | null): ProjectSummary {
  return { id, name: id, publicUrl, status: "active", sourcePageCount: 2, campaignCount: 1,
    campaigns: [{ id: `campaign-${id}`, title: id, status: "completed", updatedAt: null }],
    lastScannedAt: null, createdAt: null, updatedAt: null };
}

it("shows one URL once and retains every campaign's owning project", () => {
  const grouped = groupProjectsByUrl([
    project("new", "https://Example.com/"), project("old", "https://example.com/#intro"),
  ]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]).toMatchObject({ id: "new", campaignCount: 2, projectIds: ["new", "old"] });
  expect(grouped[0].campaigns).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "campaign-new", projectId: "new" }),
    expect.objectContaining({ id: "campaign-old", projectId: "old" }),
  ]));
});

it("keeps different pages, query values, origins, and missing URLs separate", () => {
  expect(groupProjectsByUrl([
    project("a", "https://example.com/a"), project("b", "https://example.com/b"),
    project("c", "https://example.com/a?product=2"), project("d", "http://example.com/a"),
    project("e", null), project("f", null),
  ])).toHaveLength(6);
});

it("selects an active project when its newer duplicate is archived", () => {
  const archived = { ...project("archived", "https://example.com/"), status: "archived" as const };
  expect(groupProjectsByUrl([archived, project("active", "https://example.com/")])[0])
    .toMatchObject({ id: "active", status: "active", campaignCount: 2 });
});

it("keeps a duplicate's brand when the chosen project has none", () => {
  const brand = { tagline: "Ship it", faviconUrl: null, coverImageUrl: null, backgroundColor: "#112233", foregroundColor: null, accentColor: null };
  const archived = { ...project("archived", "https://example.com/"), status: "archived" as const, brand };
  expect(groupProjectsByUrl([archived, { ...project("active", "https://example.com/"), brand: null }])[0])
    .toMatchObject({ id: "active", brand });
});

it("summarises a scanned brand for dashboard cards", () => {
  expect(projectBrandSummary({
    tagline: "  Your AI\n design engineer ",
    logoUrl: "https://example.com/customers/adobe.svg",
    faviconUrl: "https://example.com/favicon.png",
    imageUrl: "http://example.com/og.jpg",
    colors: ["#e8e8e8", "#4285f4"],
    visualSystem: { backgroundColor: "#ffffff", foregroundColor: "#171917", accentColor: "not-a-color" },
  })).toEqual({
    tagline: "Your AI design engineer",
    faviconUrl: "https://example.com/favicon.png",
    coverImageUrl: null,
    backgroundColor: "#ffffff",
    foregroundColor: "#171917",
    accentColor: "#4285f4",
  });
  expect(projectBrandSummary(null)).toBeNull();
  expect(projectBrandSummary({})).toBeNull();
});
