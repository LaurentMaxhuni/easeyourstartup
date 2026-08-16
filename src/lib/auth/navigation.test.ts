import { describe, expect, it, vi } from "vitest";
import {
  hasNeonAuthSessionVerifier,
  redirectAfterAuthentication,
  redirectToAuthenticationProvider,
} from "@/lib/auth/navigation";

describe("authentication navigation", () => {
  it("navigates to the requested path after authentication", () => {
    const assign = vi.fn();

    redirectAfterAuthentication("/studio", { assign });

    expect(assign).toHaveBeenCalledWith("/studio");
  });

  it("navigates to the OAuth URL returned by the auth provider", () => {
    const assign = vi.fn();
    const oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=test";

    redirectToAuthenticationProvider(oauthUrl, { assign });

    expect(assign).toHaveBeenCalledWith(oauthUrl);
  });

  it("rejects an insecure OAuth URL", () => {
    const assign = vi.fn();

    expect(() =>
      redirectToAuthenticationProvider("javascript:alert(1)", { assign }),
    ).toThrow("Authentication provider URL is invalid.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("recognizes Neon Auth callback URLs that need session exchange", () => {
    expect(
      hasNeonAuthSessionVerifier(
        "http://localhost:3000/studio?neon_auth_session_verifier=test",
      ),
    ).toBe(true);
    expect(hasNeonAuthSessionVerifier("http://localhost:3000/studio")).toBe(
      false,
    );
  });
});
