const NEON_AUTH_SESSION_VERIFIER_PARAM =
  "neon_auth_session_verifier";

export type AuthenticationNavigation = Pick<Location, "assign">;

export function hasNeonAuthSessionVerifier(requestUrl: string) {
  try {
    return new URL(requestUrl).searchParams.has(
      NEON_AUTH_SESSION_VERIFIER_PARAM,
    );
  } catch {
    return false;
  }
}

export function redirectAfterAuthentication(
  nextPath: string,
  navigation: AuthenticationNavigation = window.location,
) {
  navigation.assign(nextPath);
}

export function redirectToAuthenticationProvider(
  providerUrl: string,
  navigation: AuthenticationNavigation = window.location,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(providerUrl);
  } catch {
    throw new Error("Authentication provider URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Authentication provider URL is invalid.");
  }

  navigation.assign(providerUrl);
}
