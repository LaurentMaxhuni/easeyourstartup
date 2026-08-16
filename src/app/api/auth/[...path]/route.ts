import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/auth/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const auth = getNeonAuth();
const handlers = auth?.handler();

async function unavailable(request: Request, context: RouteContext) {
  void request;
  void context;
  return NextResponse.json(
    { error: "Authentication is not configured in this environment." },
    { status: 503 },
  );
}

export const GET = handlers?.GET ?? unavailable;
export const POST = handlers?.POST ?? unavailable;
export const PUT = handlers?.PUT ?? unavailable;
export const PATCH = handlers?.PATCH ?? unavailable;
export const DELETE = handlers?.DELETE ?? unavailable;
