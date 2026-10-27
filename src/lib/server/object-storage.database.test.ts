import { afterEach, beforeEach, expect, it, vi } from "vitest";

const objects = vi.hoisted(() => new Map<string, { mimeType: string; body: Buffer }>());
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({
  // Emulates the three private_objects statements over a pooled connection.
  Pool: class {
    async query(text: string, values: unknown[]) {
      if (text.includes("insert into public.private_objects")) {
        objects.set(values[0] as string, { mimeType: values[1] as string, body: values[2] as Buffer });
        return { rows: [] };
      }
      if (text.includes("select")) {
        const stored = objects.get(values[0] as string);
        return { rows: stored ? [{ body: stored.body }] : [] };
      }
      if (text.includes("delete from public.private_objects")) objects.delete(values[0] as string);
      return { rows: [] };
    }
    async end() {}
  },
}));
import { deletePrivateObject, getPrivateObject, putPrivateObject } from "./object-storage";

beforeEach(() => {
  objects.clear();
  vi.stubEnv("DATABASE_URL", "postgres://test.invalid/db");
  for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

it("stores, reads and deletes private files in the database when S3 is not configured", async () => {
  const body = new Uint8Array([0, 1, 2, 250, 255]);
  const stored = await putPrivateObject("assets/w/one.webp", body, "image/webp");
  expect(stored.byteSize).toBe(5);
  expect(objects.get("assets/w/one.webp")?.mimeType).toBe("image/webp");
  expect(Array.from(await getPrivateObject("assets/w/one.webp"))).toEqual(Array.from(body));
  await deletePrivateObject("assets/w/one.webp");
  await expect(getPrivateObject("assets/w/one.webp")).rejects.toThrow(/not found/i);
});

it("rejects files too large for database storage", async () => {
  await expect(putPrivateObject("exports/w/big.zip", new Uint8Array(20_000_001), "application/zip")).rejects.toThrow(/20 MB/);
  expect(objects.size).toBe(0);
});

it("refuses a partial S3 configuration instead of silently using the database", async () => {
  vi.stubEnv("S3_BUCKET", "bucket");
  await expect(putPrivateObject("assets/w/one.webp", new Uint8Array([1]), "image/webp")).rejects.toThrow(/every S3 setting/);
  expect(objects.size).toBe(0);
});
