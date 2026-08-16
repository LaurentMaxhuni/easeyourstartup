import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDatabase } from "./database";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("createDatabase", () => {
  it("keeps demo mode available without a database URL", () => {
    delete process.env.DATABASE_URL;
    expect(createDatabase()).toBeNull();
  });

  it("creates a Neon query client when configured", () => {
    process.env.DATABASE_URL =
      "postgresql://demo:demo@example.neon.tech/neondb?sslmode=require";
    expect(createDatabase()).toEqual(expect.any(Function));
  });
});
