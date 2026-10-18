import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/workspace-access", () => ({ ensureWorkspaceForUser: vi.fn() }));
import { groupProjectsByUrl, type ProjectSummary } from "./project-storage";

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
