import { describe, expect, it } from "vitest";
import { safeLoginNextPath } from "@/app/login/navigation";

describe("safeLoginNextPath", () => {
  it.each([
    ["root path", "/", "/"],
    ["nested path with query and fragment", "/studio?new=1#canvas", "/studio?new=1#canvas"],
    ["protocol-relative URL", "//evil.com", "/dashboard"],
    ["backslash authority URL", "/\\evil.com", "/dashboard"],
    ["repeated next query parameters", ["/studio", "/dashboard"], "/dashboard"],
    ["login loop", "/login?next=/studio", "/dashboard"],
    ["onboarding loop", "/onboarding?next=/studio", "/dashboard"],
    ["absolute external URL", "https://evil.com", "/dashboard"],
  ])("handles %s", (_description, value, expected) => {
    expect(safeLoginNextPath(value)).toBe(expected);
  });
});
