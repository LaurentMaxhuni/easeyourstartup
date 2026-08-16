import "server-only";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

export type DatabaseClient = NeonQueryFunction<false, false>;

export function createDatabase(): DatabaseClient | null {
  const connectionString = process.env.DATABASE_URL;
  return connectionString ? neon(connectionString) : null;
}

export function requireDatabase(): DatabaseClient {
  const database = createDatabase();
  if (!database) throw new Error("Database is not configured.");
  return database;
}
