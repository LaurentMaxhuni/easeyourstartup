import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { getDesignJob } from "@/lib/server/design-studio/storage";
import { designHttpError, DesignHttpError } from "@/lib/server/design-studio/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { database, workspaceId } = await requireWorkspaceContext();
    const id = z.uuid().parse((await context.params).id);
    const job = await getDesignJob(database, workspaceId, id);
    if (!job) throw new DesignHttpError("Design job not found.", 404);
    return NextResponse.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return designHttpError(error); }
}
