import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { DesignConflictError, DesignAssetError, DesignJobStateError } from "./storage";
export class DesignHttpError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function designHttpError(error: unknown) {
  if (error instanceof Error && ["Cross-site request rejected.", "Request origin rejected."].includes(error.message)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  if (error instanceof Error && error.message === "Request body must be valid JSON.") return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof Error && error.message === "Request body is too large.") return NextResponse.json({ error: error.message }, { status: 413 });
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof DesignConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof DesignAssetError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof DesignJobStateError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof DesignHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "The design request is invalid.", issues: error.issues.map(({ path, message }) => ({ path, message })).slice(0, 8) }, { status: 400 });
  console.error("[design-studio] Request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "The design request could not be completed. Your saved work is unchanged." }, { status: 503 });
}
