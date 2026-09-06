import { z } from "zod";
import {
  generateJobResultSchema,
  scanJobResultSchema,
  type GenerationResult,
  type ScanResult,
} from "@/lib/contracts";

export function parseDurableJobResult<T>(
  value: unknown,
  schema: z.ZodType<T>,
): T {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return schema.parse(parsed);
}

export function serializeScanJobResult(scan: ScanResult) {
  return JSON.stringify(scanJobResultSchema.parse({ scan }));
}

export function serializeGenerateJobResult(generation: GenerationResult) {
  return JSON.stringify(generateJobResultSchema.parse({ generation }));
}
