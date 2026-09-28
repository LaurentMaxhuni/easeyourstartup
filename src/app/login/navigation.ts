export function safeLoginNextPath(value: string | string[] | undefined) {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";

  try {
    const url = new URL(value, "https://easeyourstartup.invalid");
    if (
      url.origin !== "https://easeyourstartup.invalid" ||
      url.pathname === "/login" ||
      url.pathname === "/onboarding"
    ) {
      return "/dashboard";
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
