import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Runs only through `pnpm ai:check`; makes real provider requests.
it.skipIf(import.meta.env.MODE !== "ai-check")("checks every configured AI provider", async () => {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { checkAiProviders } = await import("./ai-health");
  const report = await checkAiProviders();
  mkdirSync("output", { recursive: true });
  writeFileSync("output/ai-check.json", JSON.stringify(report, null, 2));
}, 600_000);
