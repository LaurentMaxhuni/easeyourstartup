import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import {
  creativeCompositionSchema,
  type CreativeComposition,
} from "@/lib/contracts";

type RenderTokenPayload = {
  composition: CreativeComposition;
  expiresAt: number;
};

function secret() {
  const value = process.env.RENDER_SIGNING_SECRET;
  return value && value.length >= 32 ? value : null;
}

function signature(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createRenderToken(composition: CreativeComposition) {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(
    JSON.stringify({
      composition,
      expiresAt: Date.now() + 5 * 60 * 1000,
    } satisfies RenderTokenPayload),
  ).toString("base64url");
  return `${payload}.${signature(payload, key)}`;
}

export function verifyRenderToken(token: string) {
  const key = secret();
  if (!key || token.length > 16_000) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;
  const expected = signature(payload, key);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as RenderTokenPayload;
    if (parsed.expiresAt < Date.now()) return null;
    return creativeCompositionSchema.parse(parsed.composition);
  } catch {
    return null;
  }
}
