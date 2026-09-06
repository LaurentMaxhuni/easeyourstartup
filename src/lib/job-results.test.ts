import { describe, expect, it } from "vitest";
import {
  parseDurableJobResult,
  serializeGenerateJobResult,
  serializeScanJobResult,
} from "@/lib/job-results";
import {
  generateJobResultSchema,
  scanJobResultSchema,
} from "@/lib/contracts";
import {
  DEMO_ANGLES,
  DEMO_OUTPUTS,
  DEMO_SCAN,
} from "@/lib/demo-data";

describe("durable job results", () => {
  it("round-trips the full scan needed to resume the studio", () => {
    const serialized = serializeScanJobResult(DEMO_SCAN);
    const result = parseDurableJobResult(serialized, scanJobResultSchema);

    expect(result.scan).toEqual(DEMO_SCAN);
  });

  it("rejects the legacy summary-only generation result", () => {
    expect(() =>
      parseDurableJobResult(
        { mode: "ai", channelCount: 3 },
        generateJobResultSchema,
      ),
    ).toThrow();
  });

  it("round-trips the complete generation result used by the creative studio", () => {
    const serialized = serializeGenerateJobResult({
      angles: DEMO_ANGLES,
      outputs: DEMO_OUTPUTS,
      creativeDirections: [
        {
          id: "demo-creative",
          label: "Product proof",
          layout: "browser",
          icon: "rocket-launch",
          graphic: "orbit",
          imageMode: "single",
          eyebrow: "EaseYourStartup",
          headline: "Turn every ship into a campaign.",
          subheadline: "Launch the product update you already shipped.",
          body: "Source-backed copy and real screenshots in one package.",
          cta: "Build your launch",
          footer: "Source-backed launch studio",
        },
      ],
      mode: "ai",
    });
    const result = parseDurableJobResult(serialized, generateJobResultSchema);

    expect(result.generation.outputs.map((output) => output.channel)).toEqual([
      "x",
      "linkedin",
      "product_hunt",
    ]);
  });
});
